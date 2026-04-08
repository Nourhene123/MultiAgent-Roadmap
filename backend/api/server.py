"""
langchain_api_server.py — FastAPI Server for Quiz-Based Assessment & Roadmap Generation

Each endpoint advances the LangGraph AgentState via the agent's SessionStateManager,
making LangGraph the single source of truth for the user's journey.

Phase 1 → POST /assessment/questions         (classic, all 12 questions)
           POST /assessment/submit
           POST /assessment/adaptive/start    (Sprint 2 — CAT, 6-10 questions)
           POST /assessment/adaptive/answer

Phase 2 → POST /level/questions
           POST /level/evaluate

Phase 3 → POST /generate   (streaming, runs the LangGraph roadmap node)

Progress → GET  /progress/{user_id}
           POST /progress/record
"""

import os
import json
import asyncio
from typing import Optional, AsyncGenerator, Dict, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.agents.roadmap_agent import LangChainRoadmapAgent
from backend.assessment.system import get_assessment_api, VALID_PROFILES, progress_tracker
from backend.api import n8n_routes


# ═══════════════════════════════════════════════════════════════════════════════
# GLOBAL AGENT INSTANCE
# ═══════════════════════════════════════════════════════════════════════════════

agent: Optional[LangChainRoadmapAgent] = None

# Per-session question store: session_id → list of LLM-generated question dicts
# Used so submit_assessment scores against the same bank that was served to the user.
_session_questions: Dict[str, List[Dict]] = {}


# ═══════════════════════════════════════════════════════════════════════════════
# REQUEST / RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class AssessmentQuestionsRequest(BaseModel):
    lang: str = Field(default="fr")
    session_id: str = Field(default="", description="Session identifier — used to cache generated questions for scoring")
    use_static: bool = Field(default=False, description="If true, skip LLM generation and return static questions.json bank immediately")


class AssessmentSubmitRequest(BaseModel):
    answers: Dict[str, str] = Field(
        ...,
        description="Map of question_id → answer letter, e.g. {'1': 'A', '2': 'C'}"
    )
    session_id: str = Field(..., description="Client-generated session identifier")
    user_id: str = Field(default="anonymous")
    lang: str = Field(default="fr")


# Sprint 2 — Adaptive assessment
class AdaptiveStartRequest(BaseModel):
    lang: str = Field(default="fr")


class AdaptiveAnswerRequest(BaseModel):
    session_token: str = Field(..., description="Token returned by /adaptive/start")
    question_id: int
    answer: str = Field(..., description="Answer letter: A | B | C | D")
    session_id: str = Field(..., description="Main session identifier")
    user_id: str = Field(default="anonymous")


class LevelQuestionsRequest(BaseModel):
    profile: str = Field(..., description="cloud | cyber | ai | iot")
    lang: str = Field(default="fr")


class LevelEvaluateRequest(BaseModel):
    profile: str = Field(..., description="cloud | cyber | ai | iot")
    questions: List[dict] = Field(..., description="Questions as returned by /level/questions")
    answers: Dict[str, str] = Field(..., description="{'question_id': 'answer_letter'}")
    session_id: str = Field(..., description="Same session_id used in assessment/submit")
    user_id: str = Field(default="anonymous")
    lang: str = Field(default="fr")


class RoadmapGenerateRequest(BaseModel):
    profile: str = Field(..., description="cloud | cyber | ai | iot")
    niveau: str = Field(..., description="Débutant | Intermédiaire | Expert")
    profile_data: dict = Field(..., description="Full profile result from Phase 1")
    level_data: dict = Field(..., description="Full level evaluation result from Phase 2")
    session_id: str = Field(..., description="Same session_id used throughout the flow")
    user_id: str = Field(default="anonymous")
    lang: str = Field(default="fr")


# Sprint 2 — Progress recording
class ProgressRecordRequest(BaseModel):
    user_id: str
    session_id: str
    profile: str
    niveau: str
    scores: Dict[str, int]


class EndSessionRequest(BaseModel):
    user_id: str
    session_id: str


# Change 9 — Cert-level progress update
class CertUpdateRequest(BaseModel):
    user_id: str
    cert_code: str = Field(..., description="e.g. 'AZ-900'")
    status: str = Field(..., description="completed | in_progress | skipped")


# Multi-turn negotiation
class NegotiateRequest(BaseModel):
    session_id:      str  = Field(..., description="Roadmap session id — also keys the negotiation history")
    user_id:         str  = Field(default="anonymous")
    message:         str  = Field(..., description="Natural-language modification request")
    current_roadmap: dict = Field(..., description="The roadmap JSON currently shown to the user")
    profile_data:    dict = Field(..., description="Profile result from Phase 1")
    level_data:      dict = Field(..., description="Level result from Phase 2")


class SaveRoadmapRequest(BaseModel):
    user_id:     str  = Field(..., description="Persistent user id")
    session_id:  str  = Field(..., description="Roadmap session id")
    roadmap:     dict = Field(..., description="Final (possibly negotiated) roadmap JSON")
    profile:     str  = Field(..., description="cloud | cyber | ai | iot")
    niveau:      str  = Field(..., description="Débutant | Intermédiaire | Expert")


# Change 11 — Coach Agent
class CoachMessageRequest(BaseModel):
    session_id: str = Field(..., description="Coach session id (can differ from roadmap session_id)")
    user_id: str = Field(default="anonymous")
    message: str = Field(..., description="User's question or message")
    roadmap_context: Optional[str] = Field(
        default=None,
        description="JSON summary of the learner's current roadmap (injected on first turn only)",
    )


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _validate_profile(profile: str) -> None:
    if profile not in VALID_PROFILES:
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"Invalid profile '{profile}'.",
                "valid_profiles": sorted(VALID_PROFILES),
            },
        )


def _require_agent() -> LangChainRoadmapAgent:
    if agent is None:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    return agent


# ═══════════════════════════════════════════════════════════════════════════════
# LIFESPAN
# ═══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent
    print("Initializing LangChain Roadmap Agent...")
    agent = LangChainRoadmapAgent()
    await agent.setup()
    # Inject agent into n8n routes for Cosmos DB access
    n8n_routes.set_n8n_agent(agent)
    print("LangChain Agent ready!")
    print("n8n automation endpoints ready at /api/n8n/*")
    yield
    print("Shutting down agent...")
    agent = None


# ═══════════════════════════════════════════════════════════════════════════════
# APP
# ═══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="Subul Roadmap Agent API",
    description=(
        "Three-phase personalized certification roadmap agent. "
        "Domains: Cloud, Cybersecurity, AI, IoT."
    ),
    version="3.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include n8n automation routes
app.include_router(n8n_routes.router)


# ═══════════════════════════════════════════════════════════════════════════════
# HEALTH
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/roadmap/health")
async def health():
    ag = agent
    cosmos_ok = ag is not None and ag._cosmos_memory is not None
    return {
        "status": "ok",
        "service": "Subul Assessment & Roadmap API",
        "version": "3.2.0",
        "port": 8002,
        "domains": sorted(VALID_PROFILES),
        "model": {
            "base_model": ag.roadmap_model.azure_deployment if ag else None,
        },
        "memory": {
            "cosmos_db": "connected" if cosmos_ok else "disabled",
            "note": "Cosmos disabled → personalization/cert-tracking unavailable" if not cosmos_ok else "Memory active",
        },
        "features": [
            "assessment_quiz",
            "adaptive_assessment",
            "level_quiz",
            "roadmap_generation",
            "phase_streaming",
            "session_tracking",
            "progress_tracking",
            "critic_agent",
            "multi_agent_enrichment",
            "cosmos_memory" if cosmos_ok else "cosmos_memory_disabled",
            "coach_agent",
            "evaluation_agent",
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1 — Classic Assessment Quiz (40 questions, 10 per domain)
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/roadmap/assessment/questions")
async def get_assessment_questions(request: AssessmentQuestionsRequest):
    """
    Return assessment questions.

    Strategy (LLM-first, static fallback):
    1. Try to generate fresh questions via the LLM agent.
    2. If generation fails or the agent is not ready, fall back to questions.json.

    Generated questions are stored server-side keyed by session_id so that
    /assessment/submit can score against the exact same question bank.
    """
    ag = agent  # may be None during startup
    questions = None
    source = "static"

    # ── Attempt LLM generation (skipped when use_static=True) ─────────────
    if ag is not None and not request.use_static:
        try:
            questions = await ag.generate_assessment_questions(lang=request.lang)
            source = "llm"
            # Cache generated questions so submit can score them correctly
            if request.session_id:
                _session_questions[request.session_id] = questions
            print(f"[Assessment] LLM generated {len(questions)} questions (session={request.session_id})")
        except Exception as exc:
            print(f"[Assessment] LLM generation failed ({exc}), falling back to static bank.")

    # ── Fallback to static bank ─────────────────────────────────────────────
    if questions is None:
        api = get_assessment_api()
        questions = api.get_assessment_questions(request.lang)
        if request.session_id:
            # Store static questions too so submit always has a consistent bank
            _session_questions[request.session_id] = questions

    return {
        "questions": questions,
        "total_questions": len(questions),
        "domains": sorted(VALID_PROFILES),
        "source": source,
        "instructions": "Répondez aux questions pour déterminer votre profil",
    }


@app.post("/api/roadmap/assessment/submit")
async def submit_assessment(request: AssessmentSubmitRequest):
    """
    Phase 1 — Submit answers, compute profile with enhanced analysis.

    Scores answers against the question bank that was served to this session
    (LLM-generated if available, static otherwise) so profiling is always
    consistent with what the user actually saw.

    NEW: Includes skill gap analysis, benchmarking, and optional confidence scoring.
    """
    ag = _require_agent()
    try:
        api = get_assessment_api()

        # Retrieve the question bank served to this session (may be None → static)
        dynamic_questions = _session_questions.pop(request.session_id, None)

        # Extract confidence data if provided in answers (format: {"1": "A:4"})
        confidence_data = {}
        clean_answers = {}
        for qid, ans in request.answers.items():
            if ":" in ans:
                letter, conf = ans.split(":", 1)
                clean_answers[qid] = letter
                confidence_data[qid] = int(conf)
            else:
                clean_answers[qid] = ans

        result = api.submit_assessment(
            answers=clean_answers,
            dynamic_questions=dynamic_questions,
            confidence_data=confidence_data if confidence_data else None,
            user_id=request.user_id
        )

        ag.record_assessment_result(
            session_id=request.session_id,
            user_id=request.user_id,
            profile=result["primary_profile"],
            profile_data=result,
        )
        print(
            f"[Assessment] session={request.session_id} | "
            f"profile={result['primary_profile']} | scores={result['scores']} | "
            f"bank={'dynamic' if dynamic_questions else 'static'} ({len(dynamic_questions or [])} q) | "
            f"gaps={len(result.get('skill_gap_analysis', {}).get('gaps', []))}"
        )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/roadmap/assessment/skill-gaps")
async def get_skill_gaps(request: AssessmentSubmitRequest):
    """
    Get detailed skill gap analysis for submitted answers.
    Returns prioritized learning path with resources.
    """
    try:
        api = get_assessment_api()

        # Get base profile
        dynamic_questions = _session_questions.get(request.session_id)
        base_result = api.assessment.calculate_profile(request.answers, dynamic_questions)
        scores = api.assessment.to_dict(base_result)["scores"]
        profile = base_result.primary_profile

        # Analyze gaps
        gaps = api.skill_analyzer.analyze(scores, profile)
        learning_path = api.skill_analyzer.get_focused_learning_path(gaps)

        return {
            "profile": profile,
            "scores": scores,
            "skill_gaps": [api.skill_analyzer.to_dict(g) for g in gaps],
            "learning_path": learning_path,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/roadmap/benchmark/{user_id}")
async def get_benchmarks(user_id: str):
    """
    Get percentile rankings and peer comparisons for user's latest assessment.
    """
    try:
        api = get_assessment_api()

        # Get latest assessment from progress tracker
        progress = progress_tracker.get_progress(user_id)
        if not progress or not progress.get("latest"):
            return {
                "user_id": user_id,
                "has_data": False,
                "message": "Aucune évaluation trouvée. Passez l'évaluation d'abord."
            }

        latest = progress["latest"]
        scores = latest.get("scores", {})
        profile = latest.get("profile", "cloud")

        benchmarks = api.benchmarking.get_benchmarks(scores, profile)
        trend = api.benchmarking.get_improvement_trend(user_id)

        return {
            "user_id": user_id,
            "has_data": True,
            "profile": profile,
            "scores": scores,
            "benchmarks": [api.benchmarking.to_dict(b) for b in benchmarks],
            "trend": trend,
            "total_sessions": progress.get("total_sessions", 0),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/roadmap/assessment/dynamic-questions")
async def generate_dynamic_questions(request: LevelQuestionsRequest):
    """
    Generate fresh assessment questions using Azure Search + LLM.
    Falls back to static questions if generation fails.
    """
    ag = _require_agent()
    try:
        api = get_assessment_api()

        # Try to generate dynamic questions
        if ag.search_manager and ag.roadmap_model:
            questions = await api.question_generator.generate_questions_for_domain(
                domain=request.profile,
                count=10,
                difficulty="mixed"
            )

            if questions:
                # Store for scoring
                session_id = f"dynamic_{request.profile}_{uuid.uuid4().hex[:8]}"
                _session_questions[session_id] = questions

                return {
                    "questions": questions,
                    "total_questions": len(questions),
                    "source": "llm_dynamic",
                    "session_id": session_id,
                    "profile": request.profile,
                }

        # Fallback to static
        questions = api.get_assessment_questions(request.lang)
        return {
            "questions": questions,
            "total_questions": len(questions),
            "source": "static_fallback",
            "profile": request.profile,
        }
    except Exception as exc:
        # Fallback on any error
        api = get_assessment_api()
        questions = api.get_assessment_questions(request.lang)
        return {
            "questions": questions,
            "total_questions": len(questions),
            "source": "static_fallback",
            "profile": request.profile,
            "error_note": str(exc)
        }


# ═══════════════════════════════════════════════════════════════════════════════
# SPRINT 2 — Adaptive Assessment  (CAT: 6-10 questions, stops when confident)
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/roadmap/assessment/adaptive/start")
async def adaptive_start(request: AdaptiveStartRequest):
    """
    Sprint 2 — Start an adaptive assessment session.
    Returns the first question and an opaque session_token for subsequent calls.
    """
    try:
        api = get_assessment_api()
        return api.adaptive.start_session()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/roadmap/assessment/adaptive/answer")
async def adaptive_answer(request: AdaptiveAnswerRequest):
    """
    Sprint 2 — Submit one adaptive answer.

    Returns one of:
      - {"done": false, "question": <next_question>, "partial_scores": {...}}
      - {"done": true,  "result": <ProfileResult>}

    When done=true, the result is automatically recorded in the LangGraph state.
    """
    ag = _require_agent()
    try:
        api = get_assessment_api()
        response = api.adaptive.submit_answer(
            token=request.session_token,
            question_id=request.question_id,
            answer=request.answer.upper(),
        )

        # If assessment complete, record in LangGraph state and progress tracker
        if response.get("done") and "result" in response:
            result = response["result"]
            ag.record_assessment_result(
                session_id=request.session_id,
                user_id=request.user_id,
                profile=result["primary_profile"],
                profile_data=result,
            )
            print(
                f"[Adaptive] session={request.session_id} | "
                f"profile={result['primary_profile']} | "
                f"questions={result['questions_answered']}"
            )

        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — Level Quiz
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/roadmap/level/questions")
async def generate_level_questions(request: LevelQuestionsRequest):
    """Phase 2 — Generate 10 level assessment questions adapted to the profile."""
    _validate_profile(request.profile)
    try:
        api = get_assessment_api()
        quiz = api.get_level_quiz(request.profile, request.lang)
        print(f"[Level Quiz] profile={request.profile} | {quiz['total_questions']} questions")
        return quiz
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/roadmap/level/evaluate")
async def evaluate_level(request: LevelEvaluateRequest):
    """
    Phase 2 — Evaluate answers, determine skill level, record in LangGraph state.
    Also records in the ProgressTracker for long-term history.
    """
    ag = _require_agent()
    _validate_profile(request.profile)

    try:
        api = get_assessment_api()
        result = api.evaluate_level(
            questions=request.questions,
            answers=request.answers,
        )

        # Ensure session exists (client may skip Phase 1 in direct API usage)
        if ag.sessions.get(request.session_id) is None:
            ag.sessions.get_or_create(request.session_id, request.user_id)

        ag.record_level_result(
            session_id=request.session_id,
            level=result["niveau"],
            level_data=result,
        )

        # Sprint 2 — record in progress tracker
        session_state = ag.sessions.get(request.session_id)
        profile_scores = (session_state or {}).get("profile_data", {}).get("scores", {})
        progress_tracker.record(
            user_id=request.user_id,
            session_id=request.session_id,
            profile=request.profile,
            niveau=result["niveau"],
            scores=profile_scores,
        )

        print(
            f"[Level Quiz] session={request.session_id} | "
            f"niveau={result['niveau']} | score={result['score']['pourcentage']}%"
        )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3 — Roadmap Generation  (streams via LangGraph roadmap node)
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/roadmap/generate")
async def generate_roadmap(request: RoadmapGenerateRequest):
    """
    Phase 3 — Generate a validated, personalized roadmap.

    Runs the LangGraph roadmap node (with CriticAgent + multi-agent enrichment).
    Streams the JSON result as NDJSON chunks for progressive frontend rendering.
    Falls back to fallback_roadmaps.json if LLM generation fails entirely.
    """
    ag = _require_agent()
    _validate_profile(request.profile)

    async def stream() -> AsyncGenerator[str, None]:
        try:
            yield json.dumps({"status": "started", "chunk": ""}) + "\n"
            await asyncio.sleep(0.05)

            roadmap = await ag.generate_roadmap_for(
                session_id=request.session_id,
                user_id=request.user_id,
                profile=request.profile,
                level=request.niveau,
                profile_data=request.profile_data,
                level_data=request.level_data,
            )

            # Change 10 — stream roadmap header + phases one by one
            phases = roadmap.get("phases", [])
            total_phases = len(phases)

            # Emit roadmap metadata (without phases)
            yield json.dumps({
                "status": "roadmap_meta",
                "meta": {
                    "roadmap_title": roadmap.get("roadmap_title", ""),
                    "roadmap_summary": roadmap.get("roadmap_summary", ""),
                    "total_estimated_weeks": roadmap.get("total_estimated_weeks", 0),
                    "total_certifications": roadmap.get("total_certifications", 0),
                    "user_level": roadmap.get("user_level", ""),
                    "conseil_final": roadmap.get("conseil_final", ""),
                    "total_phases": total_phases,
                },
            }) + "\n"
            await asyncio.sleep(0.08)

            # Emit each phase individually for progressive rendering
            for phase in phases:
                yield json.dumps({
                    "status": "phase",
                    "phase": phase,
                    "phase_number": phase.get("phase_number", 0),
                    "total_phases": total_phases,
                }) + "\n"
                await asyncio.sleep(0.15)  # small delay so the UI can animate each card

            # Final completed event carries the full roadmap for compatibility
            yield json.dumps({
                "status": "completed",
                "chunk": "",
                "roadmap": roadmap,
            }) + "\n"

            print(
                f"[Roadmap] session={request.session_id} | "
                f"phases={total_phases} | "
                f"certs={roadmap.get('total_certifications', '?')}"
            )

        except Exception as exc:
            print(f"[Roadmap] Error session={request.session_id}: {exc}")
            yield json.dumps({
                "status": "error",
                "chunk": "",
                "error": str(exc),
            }) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


# ═══════════════════════════════════════════════════════════════════════════════
# SPRINT 2 — Progress Tracking
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/roadmap/progress/{user_id}")
async def get_user_progress(user_id: str):
    """
    Sprint 2 — Return the full progress history and score trends for a user.
    Includes score delta between first and latest completed session.
    """
    return progress_tracker.get_progress(user_id)


@app.post("/api/roadmap/progress/record")
async def record_progress(request: ProgressRecordRequest):
    """
    Sprint 2 — Manually record a completed session in the progress tracker.
    Useful when the frontend wants to persist a result that came from the
    adaptive flow without going through /level/evaluate.
    """
    try:
        progress_tracker.record(
            user_id=request.user_id,
            session_id=request.session_id,
            profile=request.profile,
            niveau=request.niveau,
            scores=request.scores,
        )
        return {"status": "recorded"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ═══════════════════════════════════════════════════════════════════════════════
# SESSION
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
# CHANGE 9 — Cert-level progress update
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/roadmap/cert/update")
async def update_cert_status(request: CertUpdateRequest):
    """
    Change 9 — Mark an individual certification as completed | in_progress | skipped.
    Persisted to Cosmos DB via RoadmapMemoryManager so future roadmaps never
    recommend certifications the student has already finished.
    """
    ag = _require_agent()
    valid_statuses = {"completed", "in_progress", "skipped"}
    if request.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{request.status}'. Must be one of: {sorted(valid_statuses)}",
        )

    if ag._cosmos_memory is None:
        raise HTTPException(
            status_code=503,
            detail="Cosmos DB memory is not available. Cannot persist cert status.",
        )

    try:
        await ag._cosmos_memory.mark_cert_complete(
            user_id=request.user_id,
            cert_code=request.cert_code,
            status=request.status,
        )
        print(f"[CertUpdate] user={request.user_id} | cert={request.cert_code} | status={request.status}")
        return {"status": "ok", "cert_code": request.cert_code.upper(), "new_status": request.status}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/roadmap/cert/progress/{user_id}")
async def get_cert_progress(user_id: str):
    """Change 9 — Get all cert statuses for a user."""
    ag = _require_agent()
    if ag._cosmos_memory is None:
        return {"completed_certs": [], "cert_status": {}}
    try:
        return await ag._cosmos_memory.get_cert_progress(user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ═══════════════════════════════════════════════════════════════════════════════
# CHANGE 11 — Coach Agent Chat
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/roadmap/coach")
async def coach_chat(request: CoachMessageRequest):
    """
    Change 11 — Send a message to the Subul Coach.

    The coach keeps a per-session conversation history and answers questions
    about the learner's roadmap, certifications, and study strategies.
    On the first turn, pass roadmap_context (JSON string of the roadmap) so the
    coach knows what the learner is working on.
    """
    ag = _require_agent()
    try:
        reply = await ag.coach.chat(
            session_id=request.session_id,
            user_message=request.message,
            roadmap_context=request.roadmap_context,
        )
        print(f"[Coach] session={request.session_id} | user={request.user_id} | reply_len={len(reply)}")
        return {"reply": reply, "session_id": request.session_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/api/roadmap/coach/{session_id}")
async def coach_clear(session_id: str):
    """Change 11 — Clear coach conversation history for a session."""
    ag = _require_agent()
    ag.coach.clear_history(session_id)
    return {"status": "cleared", "session_id": session_id}


# ═══════════════════════════════════════════════════════════════════════════════
# MULTI-TURN ROADMAP NEGOTIATION
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/roadmap/negotiate")
async def negotiate_roadmap(request: NegotiateRequest):
    """
    One turn of interactive roadmap negotiation.

    The user sends a natural-language request (e.g. "make it faster",
    "replace AZ-104 with AWS SAA", "I only have 5h/week") and this
    endpoint returns a modified roadmap + a human explanation of changes.

    Conversation history is maintained server-side keyed by session_id
    so each call builds on the previous turns.
    """
    ag = _require_agent()
    try:
        result = await ag.negotiate_roadmap(
            session_id=request.session_id,
            user_message=request.message,
            current_roadmap=request.current_roadmap,
            profile_data=request.profile_data,
            level_data=request.level_data,
        )
        print(
            f"[Negotiate] session={request.session_id} | "
            f"changes={len(result.get('changes_made', []))} | "
            f"user={request.user_id}"
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/api/roadmap/negotiate/{session_id}")
async def clear_negotiation_history(session_id: str):
    """Clear negotiation conversation history for a session."""
    ag = _require_agent()
    ag.clear_negotiation_history(session_id)
    return {"status": "cleared", "session_id": session_id}


@app.post("/api/roadmap/save")
async def save_roadmap(request: SaveRoadmapRequest):
    """
    Persist the final (possibly negotiated) roadmap linked to the user.
    Stores up to 10 roadmaps per user in saved_roadmaps/{user_id}.json.
    Returns {saved_id, timestamp}.
    """
    ag = _require_agent()
    try:
        result = await ag.save_roadmap(
            user_id=request.user_id,
            session_id=request.session_id,
            roadmap=request.roadmap,
            profile=request.profile,
            niveau=request.niveau,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/roadmap/saved/{user_id}")
async def get_saved_roadmaps(user_id: str):
    """Return all saved roadmaps for a user (newest first)."""
    ag = _require_agent()
    try:
        saves = await ag.get_saved_roadmaps(user_id)
        return {"user_id": user_id, "total": len(saves), "roadmaps": saves}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/roadmap/session/end")
async def end_session(request: EndSessionRequest):
    ag = _require_agent()
    state = ag.sessions.get(request.session_id)
    if state:
        ag.sessions.clear(request.session_id)
        print(f"[Session] Closed session={request.session_id}")
    return {"status": "success", "message": "Session ended"}


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRYPOINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002, reload=False)
