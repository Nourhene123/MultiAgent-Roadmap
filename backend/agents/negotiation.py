"""
negotiation.py — RoadmapNegotiationAgent: multi-turn roadmap negotiation agent.
"""

import json
from typing import Dict, List

from langchain_core.messages import HumanMessage, SystemMessage

from backend.agents.base import inject_resources
from backend.agents.prompts import NEGOTIATION_SYSTEM_PROMPT


# ═══════════════════════════════════════════════════════════════════════════════
# MULTI-TURN ROADMAP NEGOTIATION
# ═══════════════════════════════════════════════════════════════════════════════

class RoadmapNegotiationAgent:
    """
    Multi-turn roadmap negotiation agent.

    Maintains per-session conversation history. Each call to negotiate()
    takes the current roadmap + a natural-language user request and returns
    a modified roadmap + human-readable explanation of changes.
    """

    MAX_HISTORY_TURNS = 8  # keep last 8 exchanges (16 messages)

    def __init__(self, llm):
        self._llm = llm
        # session_id → [{"role": "user"|"assistant", "content": str}, ...]
        self._histories: Dict[str, List[Dict[str, str]]] = {}

    # ── History helpers ────────────────────────────────────────────────────────

    def _get_history(self, session_id: str) -> List[Dict[str, str]]:
        return self._histories.get(session_id, [])

    def _append(self, session_id: str, role: str, content: str) -> None:
        hist = self._histories.setdefault(session_id, [])
        hist.append({"role": role, "content": content})
        # Trim: keep only last MAX_HISTORY_TURNS exchanges
        max_msgs = self.MAX_HISTORY_TURNS * 2
        if len(hist) > max_msgs:
            self._histories[session_id] = hist[-max_msgs:]

    def clear_history(self, session_id: str) -> None:
        self._histories.pop(session_id, None)

    # ── Context builders ───────────────────────────────────────────────────────

    @staticmethod
    def _profile_context(profile_data: Dict, level_data: Dict) -> str:
        profile  = profile_data.get("primary_profile", "cloud")
        level    = level_data.get("niveau", "Débutant")
        scores   = profile_data.get("scores", {})
        strengths = profile_data.get("strengths", [])
        score_str = " | ".join(f"{k}: {v}%" for k, v in scores.items())
        return (
            f"Profil: {profile}  |  Niveau actuel: {level}\n"
            f"Scores: {score_str}\n"
            f"Points forts: {', '.join(strengths[:3]) or 'non spécifié'}"
        )

    def _history_str(self, session_id: str) -> str:
        hist = self._get_history(session_id)
        if not hist:
            return "Première demande — pas d'historique."
        lines = []
        for msg in hist[-6:]:  # last 3 exchanges for context
            label = "Apprenant" if msg["role"] == "user" else "Assistant"
            lines.append(f"{label}: {msg['content'][:180]}")
        return "\n".join(lines)

    # ── Main method ────────────────────────────────────────────────────────────

    async def negotiate(
        self,
        session_id: str,
        user_message: str,
        current_roadmap: Dict,
        profile_data: Dict,
        level_data: Dict,
    ) -> Dict:
        """
        Process one negotiation turn.

        Returns:
            {
                "reply": str,                  # Human-readable explanation
                "changes_made": List[str],     # Bullet list of changes
                "updated_roadmap": Dict,       # Full modified roadmap
            }
        Falls back gracefully (returns current_roadmap unchanged) if LLM fails.
        """
        profile_context = self._profile_context(profile_data, level_data)
        history_str     = self._history_str(session_id)

        # Compact roadmap — cap at 7 000 chars to stay within token budget
        compact = json.dumps(current_roadmap, ensure_ascii=False, separators=(",", ":"))
        if len(compact) > 7000:
            compact = compact[:7000] + "...}"

        system_prompt = NEGOTIATION_SYSTEM_PROMPT.format(
            profile_context=profile_context,
            current_roadmap=compact,
            conversation_history=history_str,
        )

        self._append(session_id, "user", user_message)

        try:
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=f"Demande: {user_message}"),
            ]
            response = await self._llm.ainvoke(messages)
            result   = self._parse_response(response.content.strip(), current_roadmap)

            # Re-inject authoritative resource links after any LLM modification
            result["updated_roadmap"] = inject_resources(result["updated_roadmap"])

            self._append(session_id, "assistant", result["reply"])
            return result

        except Exception as exc:
            print(f"[Negotiation] LLM error (session={session_id}): {exc}")
            fallback_reply = (
                "Je n'ai pas pu modifier le roadmap automatiquement. "
                "Essayez de reformuler, par exemple : "
                "'rends-le plus rapide', 'remplace AZ-104 par AWS SAA', "
                "'j'ai 5h par semaine', 'focus sur la sécurité'."
            )
            self._append(session_id, "assistant", fallback_reply)
            return {
                "reply": fallback_reply,
                "changes_made": [],
                "updated_roadmap": current_roadmap,
            }

    # ── Response parser ────────────────────────────────────────────────────────

    @staticmethod
    def _parse_response(raw: str, fallback: Dict) -> Dict:
        """Extract JSON from LLM output, tolerating markdown code fences."""
        clean = raw
        for fence in ("```json", "```JSON", "```"):
            clean = clean.replace(fence, "")
        clean = clean.strip()

        start = clean.find("{")
        end   = clean.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("No JSON object in LLM response")

        parsed  = json.loads(clean[start:end])
        reply   = str(parsed.get("reply", "Roadmap mis à jour."))
        changes = parsed.get("changes_made", [])
        roadmap = parsed.get("updated_roadmap", fallback)

        # Safety: if roadmap looks broken, keep original
        if not isinstance(roadmap, dict) or "phases" not in roadmap:
            roadmap = fallback

        return {
            "reply":           reply,
            "changes_made":    changes if isinstance(changes, list) else [],
            "updated_roadmap": roadmap,
        }
