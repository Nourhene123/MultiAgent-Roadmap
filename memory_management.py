"""
memory_management.py — Gestion de Mémoire Cloud-Native avec Azure Cosmos DB (Agent Roadmap)

Évolutions Tech Lead :
    1. Stateless 100% : Le ShortMemory lit et écrit directement dans Cosmos DB.
    2. Cosmos DB Ready : Remplacement du stockage JSON local par Azure Cosmos DB.
    3. Distinction User / Session : La mémoire longue suit l'étudiant, la courte suit la discussion.
    4. Sécurité : Vérification stricte des credentials Cloud au démarrage.
    5. FinOps & Pédagogie : Le résumé de session est optimisé pour être appelé une seule fois à la déconnexion.
"""

import os
import json
import uuid
import asyncio
from datetime import datetime
from typing import List, Dict, Optional

try:
    import tiktoken as _tiktoken
    _TIKTOKEN_AVAILABLE = True
except ImportError:
    _tiktoken = None
    _TIKTOKEN_AVAILABLE = False

from openai import AsyncAzureOpenAI
from azure.cosmos.aio import CosmosClient
from azure.cosmos import PartitionKey, exceptions


class DatabaseAdapter:

    async def save_message(self, user_id: str, session_id: str, role: str, content: str):
        raise NotImplementedError

    async def get_session_messages(self, session_id: str) -> List[Dict]:
        raise NotImplementedError

    async def save_long_term_memory(self, user_id: str, memory_type: str, content: str, subject: str):
        raise NotImplementedError

    async def get_user_memories(self, user_id: str) -> List[Dict]:
        raise NotImplementedError


class CosmosDBAdapter(DatabaseAdapter):
    """Adaptateur pour Azure Cosmos DB (Production)"""
    def __init__(self, endpoint: str, key: str, db_name: str, container_name: str):

        if not endpoint or not key:
            raise ValueError(f" ERREUR CRITIQUE : Les identifiants Cosmos DB sont vides ! Vérifie les noms dans ton fichier .env. Endpoint reçu: {endpoint}")

        self.client = CosmosClient(endpoint, key)
        self.db_name = db_name
        self.container_name = container_name
        self.database = None
        self.container = None

    async def setup(self):
        """Initialise la connexion à Cosmos DB et crée la DB/Container si besoin"""
        self.database = await self.client.create_database_if_not_exists(id=self.db_name)

        self.container = await self.database.create_container_if_not_exists(
            id=self.container_name,
            partition_key=PartitionKey(path="/id")
        )
        print(f" CosmosDB Connecté (Roadmap) : DB '{self.db_name}' et Container '{self.container_name}' prêts.")

    async def _read_doc(self, doc_id: str) -> Dict:
        try:
            return await self.container.read_item(item=doc_id, partition_key=doc_id)
        except exceptions.CosmosResourceNotFoundError:
            return {"id": doc_id, "data": []}

    async def save_message(self, user_id: str, session_id: str, role: str, content: str):
        doc_id = f"session_{session_id}"
        doc = await self._read_doc(doc_id)
        doc["type"] = "short_term"
        doc["user_id"] = user_id
        if "data" not in doc:
            doc["data"] = []

        doc["data"].append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
        await self.container.upsert_item(doc)

    async def get_session_messages(self, session_id: str) -> List[Dict]:
        doc = await self._read_doc(f"session_{session_id}")
        return doc.get("data", [])

    async def save_long_term_memory(self, user_id: str, memory_type: str, content: str, subject: str):
        doc_id = f"user_{user_id}"
        doc = await self._read_doc(doc_id)
        doc["type"] = "long_term"
        if "data" not in doc:
            doc["data"] = []

        doc["data"].append({
            "id": str(uuid.uuid4()),
            "type": memory_type,
            "subject": subject,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
        await self.container.upsert_item(doc)

    async def get_user_memories(self, user_id: str) -> List[Dict]:
        doc = await self._read_doc(f"user_{user_id}")
        return doc.get("data", [])


class ShortMemory:
    def __init__(self, db_adapter: DatabaseAdapter, max_tokens: int = 6000, model_name: str = "cl100k_base"):
        self.db = db_adapter
        self.max_tokens = max_tokens
        self._enc = _tiktoken.get_encoding(model_name) if _TIKTOKEN_AVAILABLE else None

    async def add(self, user_id: str, session_id: str, role: str, content: str):
        await self.db.save_message(user_id, session_id, role, content)

    async def get_history(self, session_id: str) -> List[Dict[str, str]]:
        raw_messages = await self.db.get_session_messages(session_id)
        valid_messages = []
        current_tokens = 0

        for msg in reversed(raw_messages):
            tokens = len(self._enc.encode(msg["content"])) if self._enc else len(msg["content"]) // 4
            if current_tokens + tokens > self.max_tokens:
                break
            valid_messages.insert(0, {"role": msg["role"], "content": msg["content"]})
            current_tokens += tokens

        return valid_messages


class LongMemory:
    """Suit l'étudiant (user_id) à travers toutes ses sessions de roadmap passées."""
    def __init__(self, db_adapter: DatabaseAdapter, max_context: int = 5):
        self.db = db_adapter
        self.max_context = max_context

    async def add_summary(self, user_id: str, summary: str, subject: str = ""):
        await self.db.save_long_term_memory(user_id, "summary", summary, subject)

    async def get_context_for_prompt(self, user_id: str) -> str:
        entries = await self.db.get_user_memories(user_id)
        if not entries:
            return ""

        recent = entries[-self.max_context:][::-1]
        lines = []
        for e in recent:
            date = e["timestamp"][:10]
            icon = "📝" if e["type"] == "summary" else "🧠"
            subject = f"[{e['subject']}] " if e.get("subject") else ""
            lines.append(f"{icon} {date} — {subject}{e['content']}")

        return "\n".join(lines)


class RoadmapMemoryManager:
    """
    Thin helper that reads/writes roadmap-specific data to Cosmos DB.
    Used by langchain_agent.py to personalize roadmaps for returning students.

    Stored document schema (type="roadmap_session"):
        {
          "id": "roadmap_user_{user_id}",
          "type": "roadmap_session",
          "sessions": [
            {
              "timestamp": "...",
              "profile": "cloud",
              "level": "Intermédiaire",
              "roadmap_title": "...",
              "completed_certs": ["AZ-900", "AZ-104"]
            }
          ],
          "completed_certs": ["AZ-900"]  ← aggregated across all sessions
        }
    """

    DOC_PREFIX = "roadmap_user_"

    def __init__(self, db_adapter: CosmosDBAdapter):
        self.db = db_adapter

    def _empty_doc(self, user_id: str) -> Dict:
        return {
            "id": f"{self.DOC_PREFIX}{user_id}",
            "type": "roadmap_session",
            "sessions": [],
            "completed_certs": [],
            "cert_status": {},
        }

    async def _get_user_doc(self, user_id: str) -> Dict:
        # Guard: container is None if Cosmos setup never completed
        if not self.db.container:
            return self._empty_doc(user_id)
        doc_id = f"{self.DOC_PREFIX}{user_id}"
        try:
            return await self.db.container.read_item(item=doc_id, partition_key=doc_id)
        except Exception:
            return self._empty_doc(user_id)

    async def save_session_summary(
        self,
        user_id: str,
        profile: str,
        level: str,
        roadmap_title: str,
        completed_certs: Optional[List[str]] = None,
    ) -> None:
        """Persist a completed assessment+roadmap session for a user."""
        if not self.db.container:
            return  # Cosmos not initialised yet
        doc = await self._get_user_doc(user_id)

        doc["sessions"].append({
            "timestamp": datetime.now().isoformat(),
            "profile": profile,
            "level": level,
            "roadmap_title": roadmap_title,
        })
        # Keep last 20 sessions
        doc["sessions"] = doc["sessions"][-20:]

        # Merge completed certs
        if completed_certs:
            existing = set(doc.get("completed_certs", []))
            existing.update(completed_certs)
            doc["completed_certs"] = sorted(existing)

        try:
            await self.db.container.upsert_item(doc)
        except Exception as exc:
            print(f"[Memory] save_session_summary failed: {exc}")

    async def mark_cert_complete(self, user_id: str, cert_code: str, status: str) -> None:
        """Mark a single certification as completed/in_progress/skipped."""
        if not self.db.container:
            return
        doc = await self._get_user_doc(user_id)

        if status == "completed":
            certs = set(doc.get("completed_certs", []))
            certs.add(cert_code.upper())
            doc["completed_certs"] = sorted(certs)

        # Also track per-cert status granularly
        cert_map: Dict[str, str] = doc.get("cert_status", {})
        cert_map[cert_code.upper()] = status
        doc["cert_status"] = cert_map

        try:
            await self.db.container.upsert_item(doc)
        except Exception as exc:
            print(f"[Memory] mark_cert_complete failed: {exc}")

    async def get_cert_progress(self, user_id: str) -> Dict:
        """Return all cert statuses for a user."""
        doc = await self._get_user_doc(user_id)
        return {
            "completed_certs": doc.get("completed_certs", []),
            "cert_status": doc.get("cert_status", {}),
        }

    async def get_learning_context(self, user_id: str) -> str:
        """
        Build a personalisation context string from past roadmap sessions.
        Injected into the roadmap generation prompt so the LLM never
        recommends certifications the student has already completed.
        Returns empty string for first-time users (no personalisation needed).
        """
        doc = await self._get_user_doc(user_id)
        sessions = doc.get("sessions", [])
        completed = doc.get("completed_certs", [])

        if not sessions:
            return ""

        past_profiles = list({s["profile"] for s in sessions if s.get("profile")})
        past_levels   = [s["level"] for s in sessions[-3:] if s.get("level")]
        last_roadmap  = sessions[-1].get("roadmap_title", "")
        session_count = len(sessions)

        lines = [
            "## HISTORIQUE ÉTUDIANT (utiliser pour personnaliser)",
            f"- Sessions précédentes : {session_count}",
            f"- Profils évalués      : {', '.join(past_profiles)}",
            f"- Évolution de niveau  : {' → '.join(past_levels)}",
        ]
        if last_roadmap:
            lines.append(f"- Dernier roadmap      : {last_roadmap}")
        if completed:
            lines.append(f"- Certifications déjà obtenues (NE PAS recommander) : {', '.join(completed)}")
            lines.append("  ⚠️ Ne recommande PAS ces certifications dans le nouveau roadmap.")

        return "\n".join(lines)


class MemoryManager:
    def __init__(self, oai_client: AsyncAzureOpenAI, chat_model: str, db_adapter: DatabaseAdapter):
        self._client = oai_client
        self._chat_model = chat_model
        self.db_adapter = db_adapter

        self.short = ShortMemory(db_adapter=self.db_adapter)
        self.long = LongMemory(db_adapter=self.db_adapter)

    async def add_user_message(self, user_id: str, session_id: str, content: str):
        await self.short.add(user_id, session_id, "user", content)

    async def add_agent_message(self, user_id: str, session_id: str, content: str):
        await self.short.add(user_id, session_id, "assistant", content)

    async def get_full_context(self, user_id: str, session_id: str) -> tuple[str, List[Dict[str, str]]]:
        """Récupère en même temps le passé de l'étudiant et la conversation en cours."""
        long_task = self.long.get_context_for_prompt(user_id)
        short_task = self.short.get_history(session_id)

        long_ctx, short_hist = await asyncio.gather(long_task, short_task)

        formatted_long_ctx = f" PROFIL QUIZ DE L'ÉTUDIANT :\n{long_ctx}" if long_ctx else ""
        return formatted_long_ctx, short_hist

    async def trigger_background_summary(self, user_id: str, session_id: str):
        """
        Génère un résumé pédagogique de la session roadmap.
        ⚠️ ATTENTION FINOPS & ARCHITECTURE : Ne jamais appeler cette fonction dans la boucle de chat.
        Elle doit être appelée UNIQUEMENT au moment où l'étudiant quitte l'application ou ferme la session.
        """
        history = await self.short.get_history(session_id)
        if len(history) < 2:
            print(f"ℹ️ [MemoryManager Roadmap] Session {session_id} trop courte pour nécessiter un résumé.")
            return

        print(f"\n💭 [MemoryManager Roadmap] Génération du Bilan Roadmap de fin de session pour l'étudiant {user_id}...")
        historique_str = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in history)

        prompt = (
            "Tu es le superviseur pédagogique d'une plateforme e-learning (module Roadmap).\n"
            "Analyse cette session de roadmap finalisée et rédige un rapport ultra-concis (exactement 4 phrases) "
            "qui servira de mémoire à long terme pour l'Agent Roadmap.\n\n"
            "INSTRUCTIONS STRICTES (Rédige 1 phrase par point) :\n"
            "1. SUJETS : Note les sujets et concepts évalués lors de cette session de roadmap.\n"
            "2. SCORE : Indique le niveau de performance global (questions réussies vs ratées).\n"
            "3. POINTS FAIBLES : Indique les concepts où l'étudiant a échoué et qui nécessitent une révision.\n"
            "4. PROGRESSION : Note l'évolution ou les nouvelles compétences validées par le roadmap aujourd'hui.\n\n"
            f"SESSION QUIZ :\n{historique_str}"
        )

        try:
            response = await self._client.chat.completions.create(
                model=self._chat_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=250,
                temperature=0.2
            )
            resume = response.choices[0].message.content.strip()
            await self.long.add_summary(user_id, resume, subject=f"Bilan Bilan Roadmap de Fin de Session")
            print(f" [MemoryManager Roadmap] Bilan sauvegardé avec succès dans Cosmos DB pour {user_id}")
        except Exception as e:
            print(f" [MemoryManager Roadmap] Erreur critique lors du résumé : {e}")
