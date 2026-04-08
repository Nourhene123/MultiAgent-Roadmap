"""
evaluation.py — EvaluationAgent: background quality scorer for generated roadmaps.
"""

import json
from typing import Dict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import AzureChatOpenAI

from backend.agents.base import _extract_json
from backend.agents.prompts import EVALUATION_SYSTEM_PROMPT


# ═══════════════════════════════════════════════════════════════════════════════
# CHANGE 12 — EVALUATION AGENT
# Background task that scores every generated roadmap on 5 criteria after /generate.
# Results are printed for observability; extend to Cosmos DB if you want persistence.
# ═══════════════════════════════════════════════════════════════════════════════

class EvaluationAgent:
    """
    Scores a generated roadmap on 5 quality dimensions (Change 12).
    Runs as a fire-and-forget asyncio task — never blocks the response path.

    Scoring rubric (each out of 20):
        progression_logique  — Fundamentals → Associate → Expert order
        adequation_niveau    — Difficulty matches the learner's level
        durees_realistes     — Realistic hours / weeks
        diversite_certifs    — Good provider and domain balance
        valeur_marche        — Certs are in-demand in 2025
    """

    def __init__(self, llm: AzureChatOpenAI):
        self.llm = llm

    async def evaluate(self, roadmap: Dict, profile: str, level: str) -> None:
        """
        Evaluate the roadmap and log the result.
        Designed to be called via asyncio.create_task() so it never blocks.
        """
        user_msg = (
            f"Profil apprenant: {profile} | Niveau: {level}\n\n"
            f"Roadmap:\n{json.dumps(roadmap, ensure_ascii=False, indent=2)}"
        )
        try:
            response = await self.llm.ainvoke([
                SystemMessage(content=EVALUATION_SYSTEM_PROMPT),
                HumanMessage(content=user_msg),
            ])
            raw = _extract_json(response.content)
            result = json.loads(raw)
            grade = result.get("grade", "?")
            total = result.get("total", 0)
            print(
                f"[EvaluationAgent] grade={grade} ({total}/100) | "
                f"profile={profile} | level={level} | "
                f"positifs={result.get('points_forts', [])} | "
                f"negatifs={result.get('points_faibles', [])}"
            )
        except Exception as exc:
            print(f"[EvaluationAgent] Evaluation failed (non-critical): {exc}")
