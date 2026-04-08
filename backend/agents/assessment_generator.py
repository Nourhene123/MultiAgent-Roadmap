"""
assessment_generator.py — AssessmentQuestionGeneratorAgent: LLM-powered assessment question generator.
"""

import re
import json
from typing import Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import AzureChatOpenAI

from backend.agents.prompts import ASSESSMENT_GENERATION_SYSTEM_PROMPT


# ═══════════════════════════════════════════════════════════════════════════════
# ASSESSMENT QUESTION GENERATOR AGENT
# ═══════════════════════════════════════════════════════════════════════════════

class AssessmentQuestionGeneratorAgent:
    """
    LLM-powered agent that generates fresh assessment questions on every session.

    Produces 20 questions (5 per domain) with multi-domain scoring, replacing
    the static questions.json bank. Falls back to the static bank if the LLM
    call fails or returns malformed JSON.

    A simple TTL cache (CACHE_TTL seconds) avoids regenerating on every page
    refresh — questions rotate each new session by default.
    """

    MAX_RETRIES = 2
    CACHE_TTL   = 0   # seconds; 0 = no cache (always fresh). Set to e.g. 3600 for 1-hour cache.

    def __init__(self, llm: AzureChatOpenAI):
        self.llm = llm
        self._cache: Optional[List[Dict]] = None
        self._cache_ts: float = 0.0

    async def generate(self, lang: str = "fr") -> List[Dict]:
        """
        Ask the LLM to produce 20 assessment questions.
        Returns a list of question dicts compatible with AssessmentSystem.
        Raises RuntimeError if all retries fail (caller should use static fallback).
        """
        import time

        # Return cached result if still fresh
        if self.CACHE_TTL > 0 and self._cache and (time.time() - self._cache_ts) < self.CACHE_TTL:
            import random
            result = list(self._cache)
            random.shuffle(result)
            # Re-number IDs after shuffle
            for i, q in enumerate(result, start=1):
                q["id"] = i
            return result

        last_error: Optional[str] = None

        for attempt in range(1, self.MAX_RETRIES + 2):
            try:
                raw = await self._call_llm(lang, last_error)
                questions = self._parse_and_validate(raw)

                # Cache and return
                if self.CACHE_TTL > 0:
                    self._cache = questions
                    self._cache_ts = time.time()

                return questions

            except Exception as exc:
                last_error = str(exc)
                print(f"[AssessmentGenerator] Attempt {attempt} failed: {last_error[:120]}")

        raise RuntimeError(f"LLM question generation failed after {self.MAX_RETRIES + 1} attempts: {last_error}")

    async def _call_llm(self, lang: str, previous_error: Optional[str]) -> str:
        user_content = (
            "Génère maintenant les 20 questions d'évaluation de profil IT "
            "(5 par domaine : cloud, cyber, ai, iot). "
            "Retourne UNIQUEMENT le tableau JSON, aucun texte avant ou après."
        )
        if previous_error:
            user_content += (
                f"\n\n⚠️ Ta réponse précédente était invalide : {previous_error[:200]}\n"
                "Corrige et retourne un JSON valide uniquement."
            )

        response = await self.llm.ainvoke([
            SystemMessage(content=ASSESSMENT_GENERATION_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ])
        return response.content.strip()

    @staticmethod
    def _parse_and_validate(raw: str) -> List[Dict]:
        """Parse LLM output and validate structure. Raises ValueError on bad data."""
        # Strip markdown code fences if present
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            text = text.strip()

        # Find the JSON array
        start = text.find("[")
        end   = text.rfind("]") + 1
        if start == -1 or end == 0:
            raise ValueError("No JSON array found in LLM response")

        data = json.loads(text[start:end])

        if not isinstance(data, list):
            raise ValueError("Expected JSON array at top level")

        REQUIRED_FIELDS = {"id", "domain", "difficulty", "question", "options", "scores"}
        VALID_DOMAINS   = {"cloud", "cyber", "ai", "iot"}
        SCORE_KEYS      = {"cloud", "cyber", "ai", "iot"}

        validated: List[Dict] = []
        for i, q in enumerate(data):
            missing = REQUIRED_FIELDS - set(q.keys())
            if missing:
                raise ValueError(f"Question {i+1} missing fields: {missing}")
            if q["domain"] not in VALID_DOMAINS:
                raise ValueError(f"Question {i+1} has invalid domain: {q['domain']}")
            if not isinstance(q["options"], dict) or len(q["options"]) < 2:
                raise ValueError(f"Question {i+1} has invalid options")
            for letter, score_map in q["scores"].items():
                missing_score_keys = SCORE_KEYS - set(score_map.keys())
                if missing_score_keys:
                    raise ValueError(f"Question {i+1} option {letter} missing score keys: {missing_score_keys}")

            # Ensure id is sequential
            q["id"] = i + 1
            validated.append(q)

        # Check domain distribution — need at least 3 per domain
        from collections import Counter
        domain_counts = Counter(q["domain"] for q in validated)
        for d in VALID_DOMAINS:
            if domain_counts[d] < 3:
                raise ValueError(f"Domain '{d}' has only {domain_counts[d]} questions (need ≥ 3)")

        return validated
