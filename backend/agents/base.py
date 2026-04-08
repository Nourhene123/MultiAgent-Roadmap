"""
base.py — Shared imports, models, state, and helpers for the roadmap agent system.
"""

import os
import json
import asyncio
import re
from pathlib import Path
from typing import Dict, List, Optional, Any, TypedDict
from dotenv import load_dotenv

from pydantic import BaseModel, Field, field_validator, ValidationError

from openai import AsyncAzureOpenAI as _AsyncAzureOpenAI

from langchain_core.messages import HumanMessage, SystemMessage, BaseMessage
from langchain_openai import AzureChatOpenAI

from langgraph.graph import StateGraph, END

from azure.core.credentials import AzureKeyCredential

from backend.search.index_manager import SearchIndexManager
from backend.memory.manager import CosmosDBAdapter, RoadmapMemoryManager

load_dotenv()

_FALLBACK_PATH = Path(__file__).parent.parent / "data" / "fallback_roadmaps.json"
_fallback_cache: Optional[Dict] = None


def _load_fallback_roadmap(profile: str, level: str) -> Dict:
    """
    Load a pre-built roadmap template from fallback_roadmaps.json.
    Used as last resort when the LLM fails after all retries.
    """
    global _fallback_cache
    if _fallback_cache is None:
        with open(_FALLBACK_PATH, encoding="utf-8") as f:
            _fallback_cache = json.load(f)

    # Try exact key first, then case-insensitive partial match
    # Map the 5 bands to the 3 fallback template keys
    level_map = {
        "débutant":       "Débutant",
        "débutant+":      "Débutant",
        "intermédiaire":  "Intermédiaire",
        "intermédiaire+": "Intermédiaire",
        "expert":         "Expert",
    }
    normalized_level = level_map.get(level.lower(), level)
    key = f"{profile}_{normalized_level}"

    roadmap = _fallback_cache.get(key)
    if roadmap is None:
        # Try any key that starts with the profile
        for k, v in _fallback_cache.items():
            if k.startswith(profile):
                roadmap = v
                break

    if roadmap is None:
        raise ValueError(f"No fallback roadmap found for profile='{profile}' level='{level}'")

    return roadmap


# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS — Roadmap output validation
# These models validate what the LLM returns. If validation fails the agent
# retries the LLM call with the error message appended to the prompt.
# ═══════════════════════════════════════════════════════════════════════════════

class WeeklyPlanItem(BaseModel):
    semaine: int
    focus: str          # e.g. "Modules 1-3 : Cloud Concepts & Azure Services"
    heures: int = Field(gt=0)
    ressource: Optional[str] = None  # e.g. "Microsoft Learn – AZ-900 Learning Path"


class CertificationOutput(BaseModel):
    ordre: int
    nom: str
    code: Optional[str] = None
    provider: str
    niveau_certif: str
    duree_preparation_semaines: int = Field(gt=0)
    heures_etude: int = Field(gt=0)
    prerequis: List[str] = Field(default_factory=list)
    pourquoi_cette_certif: str
    competences_acquises: List[str] = Field(default_factory=list)
    statut: str = "upcoming"
    xp_reward: int = Field(default=100, gt=0)
    plan_semaine: List[WeeklyPlanItem] = Field(default_factory=list)
    # Feature E — resource links + exam price (injected post-generation, not by LLM)
    prix_examen_eur: Optional[str] = None          # e.g. "165 €"
    lien_formation_officielle: Optional[str] = None # e.g. Microsoft Learn URL
    lien_inscription_examen: Optional[str] = None   # e.g. Pearson VUE / Certiport URL

    @field_validator("provider")
    @classmethod
    def provider_must_be_valid(cls, v: str) -> str:
        allowed = {"Microsoft", "AWS", "Amazon", "CompTIA", "ISC2", "Google"}
        if v not in allowed:
            if "azure" in v.lower() or "microsoft" in v.lower():
                return "Microsoft"
            if "aws" in v.lower() or "amazon" in v.lower():
                return "AWS"
        return v


class PhaseOutput(BaseModel):
    phase_number: int
    phase_name: str
    phase_description: str
    duration_weeks: int = Field(gt=0)
    level_tier: Optional[str] = None
    certifications: List[CertificationOutput]


class CareerOutcome(BaseModel):
    titre_poste: str                        # e.g. "Cloud Solutions Architect"
    salaire_moyen_eur: Optional[str] = None # e.g. "45 000 – 70 000 €/an"
    entreprises_type: List[str] = Field(default_factory=list)  # e.g. ["ESN", "Banque", "Startup"]
    niveau_requis: str                      # e.g. "Intermédiaire+"


class RoadmapOutput(BaseModel):
    """
    Validated roadmap structure.
    Every LLM response is parsed into this model before being returned to
    the frontend. A ValidationError triggers an automatic retry.
    """
    roadmap_title: str
    roadmap_summary: str
    total_estimated_weeks: int = Field(gt=0)
    total_certifications: int = Field(gt=0)
    user_level: Optional[str] = None
    phases: List[PhaseOutput]
    conseil_final: str
    debouches: List[CareerOutcome] = Field(default_factory=list)
    objectifs_carriere: Optional[str] = None  # 1-2 sentence career vision

    @field_validator("phases")
    @classmethod
    def at_least_one_phase(cls, v: List[PhaseOutput]) -> List[PhaseOutput]:
        if not v:
            raise ValueError("roadmap must contain at least one phase")
        return v


# ═══════════════════════════════════════════════════════════════════════════════
# CERT RESOURCES MAP  — authoritative links & prices, never generated by LLM
# ═══════════════════════════════════════════════════════════════════════════════

# fmt: off
CERT_RESOURCES: Dict[str, Dict[str, str]] = {
    # ── Microsoft Azure ──────────────────────────────────────────────────────
    "AZ-900":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-fundamentals/",        "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/az-900"},
    "AZ-104":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-administrator/",       "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/az-104"},
    "AZ-204":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-developer/",           "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/az-204"},
    "AZ-305":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-solutions-architect/", "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/az-305"},
    "AZ-400":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/devops-engineer/",           "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/az-400"},
    "AZ-500":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-security-engineer/",   "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/az-500"},
    "AZ-700":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-network-engineer/",    "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/az-700"},
    "AZ-220":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-iot-developer/",       "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/az-220"},
    # ── Microsoft AI / Data ──────────────────────────────────────────────────
    "AI-900":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-ai-fundamentals/",     "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/ai-900"},
    "AI-102":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-ai-engineer/",         "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/ai-102"},
    "DP-900":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-data-fundamentals/",   "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/dp-900"},
    "DP-100":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-data-scientist/",      "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/dp-100"},
    "DP-203":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-data-engineer/",       "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/dp-203"},
    "DP-300":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/azure-database-administrator/", "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/dp-300"},
    # ── Microsoft Security ───────────────────────────────────────────────────
    "SC-900":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/security-compliance-and-identity-fundamentals/", "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/sc-900"},
    "SC-200":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/security-operations-analyst/", "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/sc-200"},
    "SC-300":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/identity-and-access-administrator/", "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/sc-300"},
    "SC-400":  {"prix": "165 €", "formation": "https://learn.microsoft.com/fr-fr/certifications/information-protection-administrator/", "inscription": "https://learn.microsoft.com/fr-fr/certifications/exams/sc-400"},
    # ── AWS ──────────────────────────────────────────────────────────────────
    "AWS Cloud Practitioner":        {"prix": "110 $", "formation": "https://aws.amazon.com/fr/training/learn-about/cloud-practitioner/", "inscription": "https://aws.amazon.com/fr/certification/certified-cloud-practitioner/"},
    "SAA-C03":                       {"prix": "300 $", "formation": "https://aws.amazon.com/fr/training/learn-about/architect/",          "inscription": "https://aws.amazon.com/fr/certification/certified-solutions-architect-associate/"},
    "SAP-C02":                       {"prix": "300 $", "formation": "https://aws.amazon.com/fr/training/learn-about/architect/",          "inscription": "https://aws.amazon.com/fr/certification/certified-solutions-architect-professional/"},
    "DVA-C02":                       {"prix": "300 $", "formation": "https://aws.amazon.com/fr/training/learn-about/developer/",          "inscription": "https://aws.amazon.com/fr/certification/certified-developer-associate/"},
    "AWS Security Specialty":        {"prix": "300 $", "formation": "https://aws.amazon.com/fr/training/learn-about/security/",           "inscription": "https://aws.amazon.com/fr/certification/certified-security-specialty/"},
    "AWS ML Specialty":              {"prix": "300 $", "formation": "https://aws.amazon.com/fr/training/learn-about/machine-learning/",   "inscription": "https://aws.amazon.com/fr/certification/certified-machine-learning-specialty/"},
    "AWS Data Analytics Specialty":  {"prix": "300 $", "formation": "https://aws.amazon.com/fr/training/learn-about/data-analytics/",    "inscription": "https://aws.amazon.com/fr/certification/certified-data-analytics-specialty/"},
    "AWS IoT Core Developer":        {"prix": "300 $", "formation": "https://aws.amazon.com/fr/iot/",                                     "inscription": "https://aws.amazon.com/fr/certification/"},
    # ── CompTIA ──────────────────────────────────────────────────────────────
    "CompTIA Security+":  {"prix": "390 $", "formation": "https://www.comptia.org/fr/formations/by-certification/security",   "inscription": "https://www.comptia.org/certifications/security"},
    "CompTIA Network+":   {"prix": "338 $", "formation": "https://www.comptia.org/fr/formations/by-certification/network",    "inscription": "https://www.comptia.org/certifications/network"},
    "CompTIA CySA+":      {"prix": "390 $", "formation": "https://www.comptia.org/fr/formations/by-certification/cybersecurity-analyst", "inscription": "https://www.comptia.org/certifications/cybersecurity-analyst"},
    "CompTIA CASP+":      {"prix": "466 $", "formation": "https://www.comptia.org/fr/formations/by-certification/casp",       "inscription": "https://www.comptia.org/certifications/casp"},
    # ── ISC2 ─────────────────────────────────────────────────────────────────
    "ISC2 CC":  {"prix": "199 $", "formation": "https://www.isc2.org/certifications/cc",    "inscription": "https://www.isc2.org/certifications/cc"},
    "CISSP":    {"prix": "749 $", "formation": "https://www.isc2.org/certifications/cissp", "inscription": "https://www.isc2.org/certifications/cissp"},
}
# fmt: on


def inject_resources(roadmap: Dict) -> Dict:
    """
    Post-process a generated roadmap dict to inject authoritative resource
    links and exam prices from CERT_RESOURCES by matching cert code or name.

    Modifies in-place and returns the same dict.
    Safe to call even if keys are missing — all fields are Optional.
    """
    for phase in roadmap.get("phases", []):
        for cert in phase.get("certifications", []):
            code = (cert.get("code") or "").strip().upper()
            name = (cert.get("nom") or "").strip()

            # Try exact code match first, then name match
            resources = CERT_RESOURCES.get(code)
            if resources is None:
                # Try case-insensitive name match (for AWS certs that use full names)
                for key, val in CERT_RESOURCES.items():
                    if key.lower() in name.lower() or name.lower() in key.lower():
                        resources = val
                        break

            if resources:
                cert.setdefault("prix_examen_eur",          resources["prix"])
                cert.setdefault("lien_formation_officielle", resources["formation"])
                cert.setdefault("lien_inscription_examen",   resources["inscription"])

    return roadmap


def _extract_json(text: str) -> str:
    """Extract the first JSON object found in raw LLM output."""
    text = re.sub(r"```(?:json)?", "", text).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return match.group()
    raise ValueError("No JSON object found in LLM response")


# ═══════════════════════════════════════════════════════════════════════════════
# LANGGRAPH STATE
# ═══════════════════════════════════════════════════════════════════════════════

class AgentState(TypedDict):
    """State managed by LangGraph throughout the agent lifecycle."""
    messages: List[BaseMessage]
    user_id: str
    session_id: str
    profile: Optional[str]
    level: Optional[str]
    profile_data: Optional[Dict]
    level_data: Optional[Dict]
    roadmap_data: Optional[Dict]
    current_phase: str          # assessment | level_test | generating | complete
    memory_context: str


# ═══════════════════════════════════════════════════════════════════════════════
# SESSION STATE MANAGER
# ═══════════════════════════════════════════════════════════════════════════════

class SessionStateManager:
    """
    In-memory store that maps session_id → AgentState.

    Every API endpoint (submit_assessment, evaluate_level, generate_roadmap)
    calls update() so the LangGraph state is always current and the roadmap
    node can access the full context when it runs.
    """

    def __init__(self) -> None:
        self._sessions: Dict[str, AgentState] = {}

    def get_or_create(self, session_id: str, user_id: str) -> AgentState:
        if session_id not in self._sessions:
            self._sessions[session_id] = AgentState(
                messages=[],
                user_id=user_id,
                session_id=session_id,
                profile=None,
                level=None,
                profile_data=None,
                level_data=None,
                roadmap_data=None,
                current_phase="assessment",
                memory_context="",
            )
        return self._sessions[session_id]

    def update(self, session_id: str, **fields) -> AgentState:
        state = self._sessions.get(session_id)
        if state is None:
            raise KeyError(f"Session '{session_id}' not found. Call get_or_create first.")
        state.update(fields)  # type: ignore[arg-type]
        return state

    def get(self, session_id: str) -> Optional[AgentState]:
        return self._sessions.get(session_id)

    def clear(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
