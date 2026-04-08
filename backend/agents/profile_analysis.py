"""
profile_analysis.py — ProfileAnalysisAgent: enriches raw profile scores with narrative context.
"""

import json
from typing import Dict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import AzureChatOpenAI

from backend.agents.base import _extract_json
from backend.agents.prompts import PROFILE_ANALYSIS_PROMPT


# ═══════════════════════════════════════════════════════════════════════════════
# SPRINT 3 — PROFILE ANALYSIS AGENT
# Converts raw domain scores into a human-readable profile narrative.
# ═══════════════════════════════════════════════════════════════════════════════

class ProfileAnalysisAgent:
    """
    Converts raw domain scores into a human-readable profile narrative.

    Input:  {"cloud": 78, "cyber": 45, "ai": 30, "iot": 12}
    Output: {narrative, top_strength, career_paths, immediate_action}

    The narrative is appended to the roadmap prompt so the roadmap LLM
    understands *who* the learner is, not just their numeric scores.
    """

    def __init__(self, llm: AzureChatOpenAI):
        self.llm = llm

    async def analyze(self, profile: str, scores: Dict[str, int]) -> Dict:
        """Return enriched profile narrative. Falls back to minimal dict on failure."""
        user_msg = (
            f"Profil détecté: {profile}\n"
            f"Scores par domaine: {json.dumps(scores, ensure_ascii=False)}"
        )
        try:
            response = await self.llm.ainvoke([
                SystemMessage(content=PROFILE_ANALYSIS_PROMPT),
                HumanMessage(content=user_msg),
            ])
            raw = _extract_json(response.content)
            return json.loads(raw)
        except Exception as exc:
            print(f"[ProfileAnalysisAgent] Failed: {exc}. Using minimal fallback.")
            return {
                "narrative": f"Profil {profile} avec score principal {scores.get(profile, 0)}%.",
                "top_strength": profile,
                "career_paths": [],
                "immediate_action": "Commencer par une certification Fondamentaux.",
            }
