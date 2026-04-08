"""
coach.py — CoachAgent: conversational coach for learner roadmap questions.
"""

from typing import Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage, BaseMessage
from langchain_openai import AzureChatOpenAI

from backend.agents.prompts import COACH_SYSTEM_PROMPT


# ═══════════════════════════════════════════════════════════════════════════════
# CHANGE 11 — COACH AGENT
# Answers learner questions about their roadmap using a persistent chat history.
# ═══════════════════════════════════════════════════════════════════════════════

class CoachAgent:
    """
    Conversational coach that answers learner questions in context of their roadmap.

    Each session has its own message history (stored in-memory keyed by session_id).
    The roadmap context is injected as a system message on the first turn so the
    coach always knows which certifications the learner is working on.
    """

    MAX_HISTORY = 20  # keep last 20 turns to control token usage

    def __init__(self, llm: AzureChatOpenAI):
        self.llm = llm
        # session_id → list of {role, content} dicts
        self._histories: Dict[str, List[Dict[str, str]]] = {}

    def _get_history(self, session_id: str) -> List[Dict[str, str]]:
        return self._histories.setdefault(session_id, [])

    def _trim_history(self, session_id: str) -> None:
        h = self._histories.get(session_id, [])
        if len(h) > self.MAX_HISTORY:
            self._histories[session_id] = h[-self.MAX_HISTORY:]

    async def chat(
        self,
        session_id: str,
        user_message: str,
        roadmap_context: Optional[str] = None,
    ) -> str:
        """
        Send a message to the coach and return its reply.

        roadmap_context: JSON summary of the learner's current roadmap.
        If provided on the first turn, it is prepended to the system prompt.
        """
        history = self._get_history(session_id)

        # Build system message (include roadmap context if available)
        system_content = COACH_SYSTEM_PROMPT
        if roadmap_context and not history:
            # Only inject on first turn to avoid repeating it every call
            system_content += (
                "\n\n## ROADMAP ACTUEL DE L'APPRENANT\n"
                "Utilise ce contexte pour personnaliser tes réponses :\n"
                f"{roadmap_context}"
            )

        messages: List[BaseMessage] = [SystemMessage(content=system_content)]
        for turn in history:
            if turn["role"] == "user":
                messages.append(HumanMessage(content=turn["content"]))
            else:
                from langchain_core.messages import AIMessage
                messages.append(AIMessage(content=turn["content"]))
        messages.append(HumanMessage(content=user_message))

        try:
            response = await self.llm.ainvoke(messages)
            reply = response.content.strip()
        except Exception as exc:
            print(f"[CoachAgent] LLM call failed: {exc}")
            reply = "Désolé, je rencontre un problème technique. Essaie de reformuler ta question."

        # Persist to history
        history.append({"role": "user", "content": user_message})
        history.append({"role": "assistant", "content": reply})
        self._trim_history(session_id)

        return reply

    def clear_history(self, session_id: str) -> None:
        self._histories.pop(session_id, None)
