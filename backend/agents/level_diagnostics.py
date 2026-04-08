"""
level_diagnostics.py — LevelDiagnosticsAgent: enriches level quiz results with learning diagnosis.
"""

import json
from typing import Dict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import AzureChatOpenAI

from backend.agents.base import _extract_json
from backend.agents.prompts import LEVEL_DIAGNOSTICS_PROMPT


# ═══════════════════════════════════════════════════════════════════════════════
# SPRINT 3 — LEVEL DIAGNOSTICS AGENT
# Converts level quiz results into a structured learning diagnosis.
# ═══════════════════════════════════════════════════════════════════════════════

class LevelDiagnosticsAgent:
    """
    Converts level quiz results into a structured learning diagnosis.

    Input:  {niveau, score: {obtenu, total, pourcentage}, questions_detail}
    Output: {diagnosis, learning_gaps, study_strategy, weekly_hours}

    The diagnosis is appended to the roadmap prompt so the roadmap LLM
    knows what gaps to address and how to pace the learning plan.
    """

    def __init__(self, llm: AzureChatOpenAI):
        self.llm = llm

    async def diagnose(self, profile: str, level_result: Dict) -> Dict:
        """Return learning diagnosis. Falls back to minimal dict on failure."""
        niveau = level_result.get("niveau", "Débutant")
        score = level_result.get("score", {})
        user_msg = (
            f"Profil: {profile}\n"
            f"Niveau détecté: {niveau}\n"
            f"Score: {score.get('obtenu', 0)}/{score.get('total', 1)} "
            f"({score.get('pourcentage', 0):.0f}%)\n"
            f"Recommandations: {json.dumps(level_result.get('recommendations', []), ensure_ascii=False)}"
        )
        try:
            response = await self.llm.ainvoke([
                SystemMessage(content=LEVEL_DIAGNOSTICS_PROMPT),
                HumanMessage(content=user_msg),
            ])
            raw = _extract_json(response.content)
            return json.loads(raw)
        except Exception as exc:
            print(f"[LevelDiagnosticsAgent] Failed: {exc}. Using minimal fallback.")
            return {
                "diagnosis": f"Niveau {niveau} avec {score.get('pourcentage', 0):.0f}% de réussite.",
                "learning_gaps": [],
                "study_strategy": "Apprentissage progressif avec pratique régulière.",
                "weekly_hours": 8,
            }
