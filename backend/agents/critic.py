"""
critic.py — CriticAgent: quality gate for generated roadmaps.
"""

import json
from typing import Dict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import AzureChatOpenAI

from backend.agents.base import _extract_json
from backend.agents.prompts import CRITIC_SYSTEM_PROMPT


# ═══════════════════════════════════════════════════════════════════════════════
# CRITIC AGENT
# Reviews every generated roadmap. If score < 7 it returns a corrected version.
# This is the Generate → Critique → Revise pattern for higher output quality.
# ═══════════════════════════════════════════════════════════════════════════════

class CriticAgent:
    """
    Quality gate for generated roadmaps.

    Scores the roadmap 1-10 against four criteria:
        - Certification validity and ordering
        - Level appropriateness
        - Realistic durations
        - Useful final advice

    If score < 7, asks the LLM to return a corrected roadmap inline.
    """

    PASS_THRESHOLD = 7

    def __init__(self, llm: AzureChatOpenAI):
        self.llm = llm

    async def evaluate(self, roadmap: Dict, profile: str, level: str) -> Dict:
        """
        Evaluate the roadmap and return either the original (score >= 7)
        or the corrected version (score < 7).
        """
        user_msg = (
            f"Profil: {profile} | Niveau: {level}\n\n"
            f"Roadmap à évaluer:\n{json.dumps(roadmap, ensure_ascii=False, indent=2)}"
        )

        response = await self.llm.ainvoke([
            SystemMessage(content=CRITIC_SYSTEM_PROMPT),
            HumanMessage(content=user_msg),
        ])

        try:
            raw = _extract_json(response.content)
            result = json.loads(raw)
            score = result.get("score", 10)
            issues = result.get("issues", [])

            if score < self.PASS_THRESHOLD:
                print(f"[CriticAgent] Score {score}/10 — auto-correcting. Issues: {issues}")
                corrected = result.get("corrected_roadmap")
                if corrected and isinstance(corrected, dict):
                    return corrected

            print(f"[CriticAgent] Score {score}/10 — roadmap approved.")
            return roadmap

        except Exception as exc:
            # If the critic itself fails, don't block — return original
            print(f"[CriticAgent] Evaluation failed ({exc}), returning original roadmap.")
            return roadmap
