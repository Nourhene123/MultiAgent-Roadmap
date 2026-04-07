"""
langchain_agent.py — LangChain-Based Roadmap Agent

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

from search_index_manager import SearchIndexManager
from memory_management import CosmosDBAdapter, RoadmapMemoryManager

load_dotenv()

_FALLBACK_PATH = Path(__file__).parent / "fallback_roadmaps.json"
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


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPTS
# ═══════════════════════════════════════════════════════════════════════════════

ROADMAP_SYSTEM_PROMPT = """\
## IDENTITÉ
Tu es Subul, expert certifié en parcours professionnels Azure, AWS, Cybersécurité et IoT pour jeunes apprenants.

## TÂCHE
Génère un roadmap de certifications COMPLET et DÉTAILLÉ personnalisé basé sur le profil et le niveau fournis.

## RÈGLES ABSOLUES SUR LE NOMBRE DE CERTIFICATIONS
- Débutant     : MINIMUM 3 certifications, idéalement 4. Commence par les Fundamentals. 28-40 semaines.
- Débutant+    : MINIMUM 3 certifications. Fundamentals + 1 Associé. 22-32 semaines.
- Intermédiaire: MINIMUM 3 certifications. Saute les Fundamentals, commence Associé. 18-26 semaines.
- Intermédiaire+: MINIMUM 3 certifications. Mix Associé + Expert. 14-22 semaines.
- Expert       : MINIMUM 3 certifications. Specialty/Pro uniquement. 12-20 semaines.
⚠️ NE JAMAIS générer moins de 3 certifications. Un roadmap avec 1 ou 2 certifs sera REJETÉ.

## CERTIFICATIONS RÉELLES À UTILISER (par domaine)
Cloud    : AZ-900, AZ-104, AZ-305, AZ-400, AZ-500, AZ-700, AZ-204, DP-900, DP-100, AWS Cloud Practitioner, SAA-C03, SAP-C02, DVA-C02
Cyber    : SC-900, SC-200, SC-300, SC-400, AZ-500, CompTIA Security+, CompTIA CySA+, CompTIA CASP+, ISC2 CC, CISSP
AI       : AI-900, AI-102, DP-900, DP-100, DP-203, DP-300, AWS ML Specialty, AWS Data Analytics Specialty
IoT      : AZ-220, AZ-900, AWS IoT Core Developer, CompTIA Network+, AZ-104

## CONTRAINTES STRICTES
- Utilise UNIQUEMENT des certifications réelles listées ci-dessus.
- N'invente JAMAIS de certifications ou d'URLs.
- Respecte l'ordre logique : fondamentaux → associé → expert.
- Chaque certification doit avoir des compétences acquises pertinentes et un conseil "pourquoi_cette_certif" motivant.
- Les durées d'étude doivent être réalistes (pas moins de 20h ni plus de 120h par certification).
- Si des LACUNES SPÉCIFIQUES sont fournies dans le contexte, inclus-les explicitement dans les "competences_acquises" de la phase la plus pertinente.
- Chaque certification DOIT avoir un "plan_semaine" détaillé semaine par semaine (autant de semaines que "duree_preparation_semaines").
- Génère toujours 2 à 4 "debouches" réalistes adaptés au profil et niveau détectés.
- "objectifs_carriere" est obligatoire : 1-2 phrases motivantes sur la vision long-terme.

## FORMAT DE RÉPONSE
Réponds UNIQUEMENT avec du JSON valide correspondant exactement au schéma suivant.
N'inclus AUCUN texte, markdown ou commentaire en dehors du JSON.

{
  "roadmap_title": "string",
  "roadmap_summary": "string (2-3 phrases)",
  "total_estimated_weeks": number,
  "total_certifications": number,
  "user_level": "string",
  "phases": [
    {
      "phase_number": 1,
      "phase_name": "string",
      "phase_description": "string",
      "duration_weeks": number,
      "level_tier": "Fondamental | Associé | Expert",
      "certifications": [
        {
          "ordre": 1,
          "nom": "string",
          "code": "string (ex: AZ-900)",
          "provider": "Microsoft | AWS | CompTIA | ISC2",
          "niveau_certif": "Fondamental | Associé | Expert | Professionnel | Spécialité",
          "duree_preparation_semaines": number,
          "heures_etude": number,
          "prerequis": ["string"],
          "pourquoi_cette_certif": "string",
          "competences_acquises": ["string"],
          "statut": "current | upcoming | locked",
          "xp_reward": number,
          "plan_semaine": [
            {
              "semaine": 1,
              "focus": "string (ex: Modules 1-3 : Cloud Concepts & Azure services)",
              "heures": number,
              "ressource": "string (ex: Microsoft Learn – AZ-900 Learning Path)"
            }
          ]
        }
      ]
    }
  ],
  "conseil_final": "string",
  "objectifs_carriere": "string (1-2 phrases sur la vision carrière à atteindre avec ce roadmap)",
  "debouches": [
    {
      "titre_poste": "string",
      "salaire_moyen_eur": "string (ex: 42 000 – 65 000 €/an)",
      "entreprises_type": ["string"],
      "niveau_requis": "string (ex: Intermédiaire+)"
    }
  ]
}

## EXEMPLE (Débutant Cloud)
{
  "roadmap_title": "Cloud & DevOps — Parcours Débutant",
  "roadmap_summary": "Commence par les fondamentaux Azure pour construire une base solide.",
  "total_estimated_weeks": 28,
  "total_certifications": 3,
  "user_level": "Débutant",
  "phases": [
    {
      "phase_number": 1, "phase_name": "Fondamentaux Cloud",
      "phase_description": "Comprendre les concepts de base du cloud Azure.",
      "duration_weeks": 8, "level_tier": "Fondamental",
      "certifications": [
        {
          "ordre": 1, "nom": "Microsoft Azure Fundamentals",
          "code": "AZ-900", "provider": "Microsoft",
          "niveau_certif": "Fondamental", "duree_preparation_semaines": 8,
          "heures_etude": 40, "prerequis": [],
          "pourquoi_cette_certif": "Base indispensable pour tout parcours Azure.",
          "competences_acquises": ["Cloud concepts", "Azure services", "Pricing"],
          "statut": "current", "xp_reward": 150
        }
      ]
    }
  ],
  "conseil_final": "Consacre 1h par jour à la pratique sur le portail Azure gratuit."
}"""

PROFILE_ANALYSIS_PROMPT = """\
## IDENTITÉ
Tu es Subul, conseiller en orientation professionnelle spécialisé dans les certifications IT pour jeunes apprenants.

## TÂCHE
Analyse les scores de profil fournis et génère une description narrative personnalisée.

## FORMAT DE RÉPONSE
Réponds UNIQUEMENT avec du JSON valide:
{
  "narrative": "string (3-4 phrases décrivant le profil, les forces et la voie recommandée)",
  "top_strength": "string (la compétence la plus marquante de l'apprenant)",
  "career_paths": ["string", "string", "string"],
  "immediate_action": "string (la première chose concrète à faire cette semaine)"
}"""

LEVEL_DIAGNOSTICS_PROMPT = """\
## IDENTITÉ
Tu es Subul, expert pédagogique en certifications IT.

## TÂCHE
Analyse les résultats du quiz de niveau et génère un diagnostic d'apprentissage.

## FORMAT DE RÉPONSE
Réponds UNIQUEMENT avec du JSON valide:
{
  "diagnosis": "string (2-3 phrases sur le niveau actuel et les lacunes identifiées)",
  "learning_gaps": ["string", "string"],
  "study_strategy": "string (stratégie d'étude recommandée pour ce niveau)",
  "weekly_hours": number
}"""

CRITIC_SYSTEM_PROMPT = """\
Tu es un expert en certifications IT qui évalue la qualité des roadmaps générés pour des apprenants.

Analyse le roadmap suivant et réponds UNIQUEMENT avec du JSON:
{
  "score": <integer 1-10>,
  "issues": ["list of specific problems found"],
  "corrected_roadmap": <corrected roadmap object, or null if score >= 7>
}

Critères d'évaluation:
- Les certifications sont-elles réelles et dans le bon ordre? (3 points)
- Le niveau de difficulté est-il adapté au profil? (3 points)
- Les durées sont-elles réalistes? (2 points)
- Le conseil final est-il utile et spécifique? (2 points)

Si score < 7, fournis "corrected_roadmap" avec les mêmes certifications corrigées.
Si score >= 7, mets "corrected_roadmap" à null."""


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


# ═══════════════════════════════════════════════════════════════════════════════
# SPRINT 3 — MULTI-AGENT PIPELINE
#
# ProfileAnalysisAgent  — enriches raw profile scores with narrative context
# LevelDiagnosticsAgent — enriches level quiz results with learning diagnosis
#
# Both agents run before roadmap generation and inject their output into the
# certifications_context passed to RoadmapGenerationModel. This gives the
# roadmap LLM far richer context than raw numbers alone.
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


# ═══════════════════════════════════════════════════════════════════════════════
# CHANGE 12 — EVALUATION AGENT
# Background task that scores every generated roadmap on 5 criteria after /generate.
# Results are printed for observability; extend to Cosmos DB if you want persistence.
# ═══════════════════════════════════════════════════════════════════════════════

EVALUATION_SYSTEM_PROMPT = """\
Tu es un expert en qualité pédagogique pour les certifications IT.
Évalue ce roadmap de certifications sur 5 critères et réponds UNIQUEMENT avec du JSON:

{
  "scores": {
    "progression_logique": <0-20>,
    "adequation_niveau":   <0-20>,
    "durees_realistes":    <0-20>,
    "diversite_certifs":   <0-20>,
    "valeur_marche":       <0-20>
  },
  "total": <0-100>,
  "grade": "A | B | C | D | F",
  "points_forts": ["string", "string"],
  "points_faibles": ["string"],
  "recommandation": "string (une phrase)"
}

Critères:
1. progression_logique  — certifications dans le bon ordre (fondamentaux → expert)
2. adequation_niveau    — difficulté adaptée au niveau de l'apprenant
3. durees_realistes     — heures et semaines cohérentes
4. diversite_certifs    — bon équilibre entre providers et domaines
5. valeur_marche        — certifications reconnues et demandées en 2025"""


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


# ═══════════════════════════════════════════════════════════════════════════════
# CHANGE 11 — COACH AGENT
# Answers learner questions about their roadmap using a persistent chat history.
# ═══════════════════════════════════════════════════════════════════════════════

COACH_SYSTEM_PROMPT = """\
## IDENTITÉ
Tu es Subul Coach, l'assistant pédagogique de la plateforme Subul spécialisée dans les certifications IT (Azure, AWS, CompTIA, ISC2) pour les jeunes apprenants.

## RÔLE
Tu réponds aux questions de l'apprenant sur son roadmap de certifications, les examens, les ressources d'étude, les conseils pratiques et la motivation.

## RÈGLES STRICTES
- Ne recommande PAS de certifications autres que celles dans le roadmap de l'apprenant (sauf si on te pose la question directement).
- Réponds TOUJOURS en français sauf si l'apprenant écrit dans une autre langue.
- Sois encourageant, précis et concis (max 3 paragraphes).
- Si tu ne sais pas quelque chose, dis-le honnêtement.
- N'invente JAMAIS de liens ou d'URLs."""


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


# ═══════════════════════════════════════════════════════════════════════════════
# ASSESSMENT QUESTION GENERATOR AGENT
# ═══════════════════════════════════════════════════════════════════════════════

ASSESSMENT_GENERATION_SYSTEM_PROMPT = """Tu es un expert en conception pédagogique pour une plateforme e-learning spécialisée en certifications IT (Cloud, Cybersécurité, IA, IoT).

Ta mission : générer des questions d'évaluation variées et précises pour détecter le profil dominant d'un apprenant parmi 4 domaines : cloud, cyber, ai, iot.

RÈGLES STRICTES :
1. Génère exactement 20 questions : 5 par domaine (cloud, cyber, ai, iot)
2. Pour chaque domaine, génère un MIX : 2-3 questions "preference" (ce qui attire l'apprenant) + 2-3 questions "knowledge" ou "scenario" (cas concrets, problèmes réels)
3. Chaque question a exactement 4 options (A, B, C, D)
4. Le scoring multi-domaine : chaque option doit distribuer des points à PLUSIEURS domaines (0 à 15), pas seulement au domaine primaire
5. Une option "cloud-oriented" donne ~12-15 pts cloud, ~0-5 aux autres
6. Questions en FRANÇAIS, précises, concrètes, niveau professionnel
7. Varie les thèmes : ne répète jamais le même sujet

THÈMES PAR DOMAINE :
- cloud: Kubernetes, Terraform, CI/CD, coût cloud, serverless, multi-cloud, migration, stockage, réseau VNet, monitoring
- cyber: Zero Trust, SIEM/SOC, pentest, cryptographie, IAM, réponse incident, OWASP, DevSecOps, forensique, compliance
- ai: MLOps, RAG, LLM fine-tuning, data pipeline, détection d'anomalies, computer vision, NLP, responsible AI, TinyML, embeddings
- iot: MQTT/CoAP, LoRaWAN, edge computing, OTA updates, digital twin, SCADA/OPC-UA, energy harvesting, Azure IoT Hub, firmware, time-series

RETOURNE UNIQUEMENT un JSON valide, sans markdown, sans explication :
[
  {
    "id": 1,
    "domain": "cloud",
    "difficulty": "easy",
    "type": "preference",
    "question": "...",
    "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
    "scores": {
      "A": {"cloud": 15, "cyber": 0, "ai": 5, "iot": 0},
      "B": {"cloud": 0, "cyber": 15, "ai": 0, "iot": 0},
      "C": {"cloud": 0, "cyber": 0, "ai": 15, "iot": 0},
      "D": {"cloud": 0, "cyber": 0, "ai": 0, "iot": 15}
    }
  },
  ...20 questions total...
]"""


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


# ═══════════════════════════════════════════════════════════════════════════════
# MULTI-TURN ROADMAP NEGOTIATION
# ═══════════════════════════════════════════════════════════════════════════════

NEGOTIATION_SYSTEM_PROMPT = """\
Tu es un expert en parcours de certification IT (Azure, AWS, CompTIA, ISC2, Google Cloud).
Tu aides l'apprenant à personnaliser son roadmap en répondant à ses demandes en langage naturel.

CONTEXTE DE L'APPRENANT:
{profile_context}

ROADMAP ACTUEL (JSON compact):
{current_roadmap}

HISTORIQUE DE LA CONVERSATION:
{conversation_history}

INSTRUCTIONS DE MODIFICATION:
Tu DOIS toujours répondre avec un objet JSON valide, sans markdown, sans texte avant ou après:
{{
  "reply": "Message humain (2-4 phrases motivantes en français expliquant ce que tu as changé et pourquoi)",
  "changes_made": ["Changement 1 concis", "Changement 2 concis", ...],
  "updated_roadmap": {{ ... roadmap JSON complet identique au format actuel ... }}
}}

RÈGLES IMPÉRATIVES:
1. Ne supprime JAMAIS les prérequis critiques (pas d'AZ-305 avant AZ-900, etc.)
2. Si l'utilisateur dit "plus rapide" ou "accélérer" → réduis heures_etude de 20-25% et duree_preparation_semaines proportionnellement
3. Si "remplace X par Y" ou "je préfère AWS" → swap la certification en gardant le même niveau_certif
4. Si "focus sur X" ou "plus de X" → enrichis competences_acquises + ajuste pourquoi_cette_certif
5. Si "moins de phases" → fusionne phases de même niveau_tier
6. Si "j'ai X heures par semaine" → recalcule duree_preparation_semaines = heures_etude / X
7. Garde TOUJOURS une phase Expert finale — c'est le but ultime
8. Ne réduis jamais une certification en dessous de 20h d'étude (irréaliste)
9. Conserve les champs prix_examen_eur, lien_formation_officielle, lien_inscription_examen tels quels
10. Le champ updated_roadmap DOIT avoir les mêmes clés de premier niveau que le roadmap actuel
"""


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

                # Run critic gate — may return corrected version
                roadmap = await self.critic.evaluate(roadmap, profile, level)
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

        saved_dir = os.path.join(os.path.dirname(__file__), "saved_roadmaps")
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
        saved_dir = os.path.join(os.path.dirname(__file__), "saved_roadmaps")
        user_file = os.path.join(saved_dir, f"{user_id}.json")
        if not os.path.exists(user_file):
            return []
        try:
            with open(user_file, encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return []
