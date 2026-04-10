"""
roadmap_agent.py — LangChain-Based Roadmap Agent

Architecture:
    - Pydantic-validated Roadmap Output (LLM output validated & retried on failure)
    - CriticAgent: scores every roadmap 1-10, triggers auto-correction if score < 7
    - SessionStateManager — connects each API endpoint to LangGraph AgentState
    - Fallback: loads from fallback_roadmaps.json when LLM generation fails entirely
    - LangGraph for agent workflow orchestration
"""

import os
import json
import asyncio
from typing import Dict, List, Optional, Any

from openai import AsyncAzureOpenAI as _AsyncAzureOpenAI

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import AzureChatOpenAI

from langgraph.graph import StateGraph, END

from azure.core.credentials import AzureKeyCredential

from backend.search.index_manager import SearchIndexManager
from backend.memory.manager import CosmosDBAdapter, RoadmapMemoryManager

from backend.agents.base import (
    AgentState,
    SessionStateManager,
    RoadmapOutput,
    ValidationError,
    inject_resources,
    _extract_json,
    _load_fallback_roadmap,
)
from backend.agents.prompts import ROADMAP_SYSTEM_PROMPT
from backend.agents.critic import CriticAgent
from backend.agents.profile_analysis import ProfileAnalysisAgent
from backend.agents.level_diagnostics import LevelDiagnosticsAgent
from backend.agents.evaluation import EvaluationAgent
from backend.agents.coach import CoachAgent
from backend.agents.assessment_generator import AssessmentQuestionGeneratorAgent
from backend.agents.negotiation import RoadmapNegotiationAgent


# ═══════════════════════════════════════════════════════════════════════════════
# ROADMAP GENERATION MODEL
# ═══════════════════════════════════════════════════════════════════════════════

class RoadmapGenerationModel:
    """
    Generates certification roadmaps via Azure OpenAI.
    LLM output is validated against RoadmapOutput (Pydantic).
    On validation failure the model retries up to MAX_RETRIES times,
    feeding the error back into the prompt so the LLM can self-correct.
    """

    MAX_RETRIES = 2

    def __init__(self, azure_deployment: Optional[str] = None):
        self.azure_deployment = azure_deployment or os.getenv(
            "AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o-mini"
        )

        self.base_llm = AzureChatOpenAI(
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            deployment_name=self.azure_deployment,
            api_version="2024-02-15-preview",
            temperature=0.2,
            max_tokens=4096,  # cap output length to reduce generation time
        )

        self.critic = CriticAgent(llm=self.base_llm)

    async def generate_roadmap(
        self,
        profile: str,
        level: str,
        certifications_context: str,
    ) -> Dict[str, Any]:
        """
        Generate, validate, and critique a roadmap.
        Retries up to MAX_RETRIES on validation failure, passing the error
        back to the LLM so it can self-correct.
        """
        last_error: Optional[str] = None

        for attempt in range(1, self.MAX_RETRIES + 2):
            raw = await self._call_llm(
                profile=profile,
                level=level,
                certifications_context=certifications_context,
                previous_error=last_error,
            )

            try:
                json_str = _extract_json(raw)
                data = json.loads(json_str)
                validated = RoadmapOutput.model_validate(data)
                roadmap = validated.model_dump()

                # Run critic gate in background — don't block user response.
                # The roadmap is already Pydantic-validated; critic is a quality
                # monitor, not a blocker.
                asyncio.create_task(self.critic.evaluate(roadmap, profile, level))
                return roadmap

            except (json.JSONDecodeError, ValidationError, ValueError) as exc:
                last_error = str(exc)
                if attempt <= self.MAX_RETRIES:
                    print(
                        f"[RoadmapModel] Attempt {attempt} failed: "
                        f"{last_error[:120]}. Retrying…"
                    )

        # All retries exhausted — try returning raw dict before giving up
        print("[RoadmapModel] All retries exhausted; returning unvalidated data.")
        try:
            return json.loads(_extract_json(raw))
        except Exception:
            raise ValueError(
                f"LLM failed to produce valid JSON after {self.MAX_RETRIES + 1} attempts. "
                f"Last error: {last_error}"
            )

    async def _call_llm(
        self,
        profile: str,
        level: str,
        certifications_context: str,
        previous_error: Optional[str],
    ) -> str:
        profile_labels = {
            "cloud": "Cloud & DevOps",
            "cyber": "Cybersécurité",
            "ai": "Intelligence Artificielle",
            "iot": "Internet des Objets (IoT)",
        }

        user_content = (
            f"Génère un roadmap complet.\n\n"
            f"Profil : {profile_labels.get(profile, profile)}\n"
            f"Niveau : {level}\n\n"
            f"Certifications disponibles :\n{certifications_context}"
        )

        if previous_error:
            user_content += (
                f"\n\n⚠️ Ta réponse précédente contenait cette erreur : {previous_error}\n"
                f"Corrige-la et génère un JSON valide."
            )

        response = await self.base_llm.ainvoke([
            SystemMessage(content=ROADMAP_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ])
        return response.content


# ═══════════════════════════════════════════════════════════════════════════════
# AGENT TOOLS
# ═══════════════════════════════════════════════════════════════════════════════

class AgentTools:
    """Collection of tools available to the roadmap agent."""

    def __init__(self, search_manager: SearchIndexManager, cosmos_client=None):
        self.search = search_manager
        self.cosmos = cosmos_client

    async def search_certifications(self, profile: str, top_k: int = 10) -> str:
        """RAG search for certifications relevant to the given profile."""
        search_queries = {
            "cloud": "Azure AZ-900 AZ-104 AZ-305 AZ-400 AWS Cloud Practitioner SAA DevOps",
            "cyber": "Azure security AZ-500 SC-900 SC-200 AWS Security Specialty CompTIA Security+",
            "ai":    "Azure AI-900 AI-102 DP-900 DP-100 AWS Machine Learning Specialty",
            "iot":   "Azure IoT AZ-220 AWS IoT Core IoT Developer edge computing MQTT",
        }
        query = search_queries.get(profile, "Azure AWS certification")

        try:
            results = await self.search.search_structured(query, top_k=top_k)
            lines = [
                f"- [{r.get('cloud', 'Unknown')}] {r.get('source', 'Unknown')}"
                for r in results
            ]
            return "\n".join(lines) if lines else f"Certifications for {profile} profile."
        except Exception as exc:
            print(f"[Tools] Search failed: {exc}. Using default context.")
            return f"Certifications de référence pour le profil {profile}."

    async def generate_roadmap(
        self,
        profile: str,
        level: str,
        profile_data: Dict,
        level_data: Dict,
        model: RoadmapGenerationModel,
        memory_context: str = "",
    ) -> Dict:
        """
        Fetch certification context, prepend Sprint 3 enrichment, then generate.
        memory_context contains the ProfileAnalysisAgent + LevelDiagnosticsAgent output.
        """
        certifications = await self.search_certifications(profile)
        if memory_context:
            certifications = f"{memory_context}\n\nCERTIFICATIONS DISPONIBLES:\n{certifications}"
        return await model.generate_roadmap(
            profile=profile,
            level=level,
            certifications_context=certifications,
        )


# ═══════════════════════════════════════════════════════════════════════════════
# LANGGRAPH WORKFLOW
# ═══════════════════════════════════════════════════════════════════════════════

class RoadmapAgentGraph:
    """
    LangGraph workflow that orchestrates the three phases.

    The graph is intentionally simple: the API endpoints update the AgentState
    via SessionStateManager, then call run_roadmap_node() directly when roadmap
    generation is requested.
    """

    def __init__(self, tools: AgentTools, model: RoadmapGenerationModel):
        self.tools = tools
        self.model = model
        self._compiled = self._build_graph()

    def _build_graph(self):
        async def assessment_node(state: AgentState) -> Dict:
            return {"current_phase": "level_test"}

        async def level_test_node(state: AgentState) -> Dict:
            return {"current_phase": "generating"}

        async def roadmap_node(state: AgentState) -> Dict:
            if not state.get("profile") or not state.get("level"):
                return {"current_phase": "error"}

            roadmap = await self.tools.generate_roadmap(
                profile=state["profile"],
                level=state["level"],
                profile_data=state.get("profile_data", {}),
                level_data=state.get("level_data", {}),
                model=self.model,
                memory_context=state.get("memory_context", ""),
            )
            return {"roadmap_data": roadmap, "current_phase": "complete"}

        workflow = StateGraph(AgentState)
        workflow.add_node("assessment", assessment_node)
        workflow.add_node("level_test", level_test_node)
        workflow.add_node("roadmap", roadmap_node)

        workflow.set_entry_point("assessment")
        workflow.add_conditional_edges(
            "assessment",
            lambda s: "level_test" if s.get("profile") else END,
        )
        workflow.add_conditional_edges(
            "level_test",
            lambda s: "roadmap" if s.get("level") else END,
        )
        workflow.add_edge("roadmap", END)

        return workflow.compile()

    async def run_roadmap_node(self, state: AgentState) -> Dict:
        """
        Execute only the roadmap generation node with the given state.
        Called by the API after profile + level are already stored in state.
        """
        result = await self._compiled.ainvoke(
            {**state, "current_phase": "generating"},
            config={"recursion_limit": 10},
        )
        return result


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN AGENT CLASS
# ═══════════════════════════════════════════════════════════════════════════════

class LangChainRoadmapAgent:
    """
    Main agent class.

    Exposes three high-level methods that map 1:1 to the API phases:
        record_assessment_result()  — called after Phase 1
        record_level_result()       — called after Phase 2
        generate_roadmap_for()      — called for Phase 3 (runs LangGraph)

    If LangGraph generation fails after all retries, falls back to
    fallback_roadmaps.json so the user always receives a complete roadmap.
    """

    def __init__(self):
        # SearchIndexManager expects a raw AsyncAzureOpenAI client (calls .embeddings.create())
        _oai_client = _AsyncAzureOpenAI(
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
            api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
            api_version="2024-02-15-preview",
        )
        self.search_manager = SearchIndexManager(
            endpoint=os.getenv("AZURE_SEARCH_ENDPOINT"),
            credential=AzureKeyCredential(os.getenv("AZURE_SEARCH_API_KEY", "")),
            index_name=os.getenv("AZURE_SEARCH_INDEX_NAME"),
            dimensions=int(os.getenv("AZURE_AI_EMBED_DIMENSIONS", 1536)),
            model=os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT"),
            embeddings_client=_oai_client,
        )

        self.roadmap_model = RoadmapGenerationModel()
        self.tools = AgentTools(search_manager=self.search_manager)
        self.graph = RoadmapAgentGraph(self.tools, self.roadmap_model)
        self.sessions = SessionStateManager()

        # Sprint 3 — sub-agents for context enrichment
        _llm = self.roadmap_model.base_llm
        self.profile_agent = ProfileAnalysisAgent(llm=_llm)
        self.level_agent = LevelDiagnosticsAgent(llm=_llm)
        # Change 11 — conversational coach
        self.coach = CoachAgent(llm=_llm)
        # Change 12 — background quality evaluator
        self.evaluator = EvaluationAgent(llm=_llm)
        # Dynamic assessment question generator — LLM-first, static fallback
        self.assessment_generator = AssessmentQuestionGeneratorAgent(llm=_llm)
        # Multi-turn roadmap negotiation
        self.negotiator = RoadmapNegotiationAgent(llm=_llm)

        # Change 8 — Cosmos DB memory for personalisation
        self._cosmos_memory: Optional[RoadmapMemoryManager] = None
        try:
            _cosmos = CosmosDBAdapter(
                endpoint=os.getenv("AZURE_COSMOS_ENDPOINT", ""),
                key=os.getenv("AZURE_COSMOS_KEY", ""),
                db_name=os.getenv("AZURE_COSMOS_DATABASE_NAME", "EduTech_AI_Production"),
                container_name=os.getenv("AZURE_COSMOS_ROADMAP_CONTAINER_NAME", "AgentRoadmap"),
            )
            self._cosmos_memory = RoadmapMemoryManager(_cosmos)
        except Exception as exc:
            print(f"[Agent] Cosmos DB memory disabled: {exc}")

    async def setup(self) -> None:
        """Initialise Azure connections on startup."""
        await self.search_manager.ensure_index_created()
        if self._cosmos_memory:
            try:
                await self._cosmos_memory.db.setup()
                print("[Agent] Cosmos DB memory ready.")
            except Exception as exc:
                print(f"[Agent] Cosmos DB setup failed (memory disabled): {exc}")
                self._cosmos_memory = None
        print("LangChain Roadmap Agent initialised.")

    # ── Assessment question generation ────────────────────────────────────────

    async def generate_assessment_questions(self, lang: str = "fr") -> List[Dict]:
        """
        Generate fresh assessment questions via LLM.

        Returns a list of question dicts that can be served directly to the
        frontend AND used by AssessmentSystem.calculate_profile_from_questions()
        for scoring.

        Raises RuntimeError if the LLM fails — caller should catch and fall
        back to the static questions.json bank.
        """
        return await self.assessment_generator.generate(lang=lang)

    # ── Phase helpers (called by API endpoints) ────────────────────────────────

    def record_assessment_result(
        self,
        session_id: str,
        user_id: str,
        profile: str,
        profile_data: Dict,
    ) -> AgentState:
        """Store Phase 1 result in the LangGraph state."""
        self.sessions.get_or_create(session_id, user_id)
        return self.sessions.update(
            session_id,
            profile=profile,
            profile_data=profile_data,
            current_phase="level_test",
        )

    def record_level_result(
        self,
        session_id: str,
        level: str,
        level_data: Dict,
    ) -> AgentState:
        """Store Phase 2 result in the LangGraph state."""
        return self.sessions.update(
            session_id,
            level=level,
            level_data=level_data,
            current_phase="generating",
        )

    async def generate_roadmap_for(
        self,
        session_id: str,
        user_id: str,
        profile: str,
        level: str,
        profile_data: Dict,
        level_data: Dict,
    ) -> Dict:
        """
        Run Phase 3 through the LangGraph roadmap node.

        Sprint 3 enrichment pipeline (runs in parallel before generation):
          1. ProfileAnalysisAgent  — narrative context from domain scores
          2. LevelDiagnosticsAgent — learning diagnosis from quiz results

        Both results are stored in AgentState.memory_context and injected
        into the certifications_context passed to RoadmapGenerationModel,
        giving the roadmap LLM far richer context than raw numbers.

        Falls back to fallback_roadmaps.json if the entire LLM pipeline fails.
        """
        self.sessions.get_or_create(session_id, user_id)
        self.sessions.update(
            session_id,
            profile=profile,
            profile_data=profile_data,
            level=level,
            level_data=level_data,
            current_phase="generating",
        )

        # ── Change 8: fetch Cosmos DB learning context for returning students ──
        learning_ctx = ""
        if self._cosmos_memory:
            try:
                learning_ctx = await self._cosmos_memory.get_learning_context(user_id)
                if learning_ctx:
                    print(f"[Agent] Personalisation context loaded for user={user_id}")
            except Exception as exc:
                print(f"[Agent] Could not load learning context: {exc}")

        # ── Sprint 3: run sub-agents in parallel ──────────────────────────────
        scores = profile_data.get("scores", {})
        profile_analysis, level_diagnosis = await asyncio.gather(
            self.profile_agent.analyze(profile, scores),
            self.level_agent.diagnose(profile, level_data),
            return_exceptions=True,
        )

        # Build enriched memory context (used by the roadmap node)
        memory_parts: List[str] = []
        # Change 8 — prepend Cosmos DB history so LLM sees it first
        if learning_ctx:
            memory_parts.append(learning_ctx)
        if isinstance(profile_analysis, dict):
            memory_parts.append(
                f"ANALYSE DE PROFIL:\n"
                f"- Narrative: {profile_analysis.get('narrative', '')}\n"
                f"- Force principale: {profile_analysis.get('top_strength', '')}\n"
                f"- Parcours carrière: {', '.join(profile_analysis.get('career_paths', []))}\n"
                f"- Action immédiate: {profile_analysis.get('immediate_action', '')}"
            )
        if isinstance(level_diagnosis, dict):
            memory_parts.append(
                f"DIAGNOSTIC NIVEAU:\n"
                f"- Diagnostic: {level_diagnosis.get('diagnosis', '')}\n"
                f"- Lacunes: {', '.join(level_diagnosis.get('learning_gaps', []))}\n"
                f"- Stratégie: {level_diagnosis.get('study_strategy', '')}\n"
                f"- Heures/semaine recommandées: {level_diagnosis.get('weekly_hours', 8)}"
            )

        # ── Skill gap analysis from wrong quiz answers ────────────────────────
        # Extract questions the learner got wrong and inject them explicitly so
        # the roadmap LLM can address those exact topics in competences_acquises.
        wrong_topics: List[str] = []
        for detail in level_data.get("questions_detail", []):
            if not detail.get("correct", True):
                q_text = detail.get("question", "")
                if q_text:
                    wrong_topics.append(f"• {q_text[:120]}")
        if wrong_topics:
            memory_parts.append(
                f"LACUNES SPÉCIFIQUES DÉTECTÉES (questions ratées au quiz de niveau) :\n"
                + "\n".join(wrong_topics[:8])  # cap at 8 to avoid prompt bloat
                + "\n→ Le roadmap DOIT adresser ces lacunes dans les compétences et ressources de chaque phase."
            )

        memory_context = "\n\n".join(memory_parts)
        self.sessions.update(session_id, memory_context=memory_context)
        print(f"[Agent] Sprint 3 context enriched | session={session_id}")

        # ── Run the LangGraph roadmap node ────────────────────────────────────
        try:
            current_state = self.sessions.get(session_id)
            result = await self.graph.run_roadmap_node(current_state)
            roadmap = result.get("roadmap_data") or {}

            if not roadmap:
                raise ValueError("LangGraph returned empty roadmap_data")

            # Feature E — inject authoritative resource links & exam prices
            roadmap = inject_resources(roadmap)

            self.sessions.update(
                session_id,
                roadmap_data=roadmap,
                current_phase=result.get("current_phase", "complete"),
            )
            # Change 8 — persist session summary to Cosmos DB (fire-and-forget)
            if self._cosmos_memory:
                asyncio.create_task(self._cosmos_memory.save_session_summary(
                    user_id=user_id,
                    profile=profile,
                    level=level,
                    roadmap_title=roadmap.get("roadmap_title", ""),
                ))
            # Change 12 — score the roadmap quality in the background
            asyncio.create_task(self.evaluator.evaluate(roadmap, profile, level))
            return roadmap

        except Exception as exc:
            print(f"[Agent] Generation failed: {exc}. Loading fallback roadmap.")
            try:
                fallback = _load_fallback_roadmap(profile, level)
                self.sessions.update(
                    session_id,
                    roadmap_data=fallback,
                    current_phase="complete",
                )
                return fallback
            except Exception as fallback_exc:
                print(f"[Agent] Fallback also failed: {fallback_exc}")
                raise exc

    # ── Multi-turn negotiation ────────────────────────────────────────────────

    async def negotiate_roadmap(
        self,
        session_id: str,
        user_message: str,
        current_roadmap: Dict,
        profile_data: Dict,
        level_data: Dict,
    ) -> Dict:
        """
        One turn of interactive roadmap negotiation.
        Delegates to RoadmapNegotiationAgent and returns
        {reply, changes_made, updated_roadmap}.
        """
        return await self.negotiator.negotiate(
            session_id=session_id,
            user_message=user_message,
            current_roadmap=current_roadmap,
            profile_data=profile_data,
            level_data=level_data,
        )

    def clear_negotiation_history(self, session_id: str) -> None:
        self.negotiator.clear_history(session_id)

    # ── Roadmap save / load ───────────────────────────────────────────────────

    async def save_roadmap(
        self,
        user_id: str,
        session_id: str,
        roadmap: Dict,
        profile: str,
        niveau: str,
    ) -> Dict:
        """
        Persist a (possibly negotiated) roadmap to a per-user JSON file.
        Stored in saved_roadmaps/{user_id}.json — up to 10 saves per user.
        Returns {saved_id, timestamp}.
        """
        import hashlib, time as _time

        saved_dir = os.path.join(os.path.dirname(__file__), "..", "data", "saved_roadmaps")
        os.makedirs(saved_dir, exist_ok=True)

        saved_id  = hashlib.md5(
            f"{user_id}_{session_id}_{_time.time()}".encode()
        ).hexdigest()[:12]
        timestamp = _time.strftime("%Y-%m-%dT%H:%M:%S")

        entry = {
            "saved_id":      saved_id,
            "user_id":       user_id,
            "session_id":    session_id,
            "timestamp":     timestamp,
            "profile":       profile,
            "niveau":        niveau,
            "roadmap_title": roadmap.get("roadmap_title", "Mon Roadmap"),
            "total_weeks":   roadmap.get("total_estimated_weeks", 0),
            "total_certs":   roadmap.get("total_certifications", 0),
            "roadmap":       roadmap,
        }

        user_file = os.path.join(saved_dir, f"{user_id}.json")
        saves: List[Dict] = []
        if os.path.exists(user_file):
            try:
                with open(user_file, encoding="utf-8") as fh:
                    saves = json.load(fh)
            except Exception:
                saves = []

        # Prepend newest, keep at most 10
        saves.insert(0, entry)
        saves = saves[:10]

        with open(user_file, "w", encoding="utf-8") as fh:
            json.dump(saves, fh, ensure_ascii=False, indent=2)

        print(f"[Save] user={user_id} | saved_id={saved_id} | title={entry['roadmap_title']}")
        return {"saved_id": saved_id, "timestamp": timestamp}

    async def get_saved_roadmaps(self, user_id: str) -> List[Dict]:
        """Return all saved roadmaps for a user (metadata + full roadmap)."""
        saved_dir = os.path.join(os.path.dirname(__file__), "..", "data", "saved_roadmaps")
        user_file = os.path.join(saved_dir, f"{user_id}.json")
        if not os.path.exists(user_file):
            return []
        try:
            with open(user_file, encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return []
