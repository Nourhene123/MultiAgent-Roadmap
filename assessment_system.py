"""
assessment_system.py — Structured Assessment System for Profile Detection

Features:
    - 40 questions across 4 domains (Cloud, Cybersecurity, AI, IoT) — 10 per domain
    - Questions loaded from questions.json (data separated from logic)
    - Score-based profile detection with strengths/weaknesses
    - Adaptive Assessment (CAT): questions selected dynamically based on running scores
    - Progress Tracking: records sessions per user for trend analysis
"""

import json
import random
import uuid
import os
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════════════════════════

_QUESTIONS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "questions.json")


def _load_questions_data() -> dict:
    """Load all question data from questions.json."""
    with open(_QUESTIONS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


# ═══════════════════════════════════════════════════════════════════════════════
# DOMAIN ENUM
# ═══════════════════════════════════════════════════════════════════════════════

class Domain(Enum):
    CLOUD = "cloud"
    CYBER = "cyber"
    AI = "ai"
    IOT = "iot"


VALID_PROFILES = {d.value for d in Domain}


# ═══════════════════════════════════════════════════════════════════════════════
# DATA CLASSES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class AssessmentQuestion:
    """Single assessment question structure."""
    id: int
    domain: Domain
    question: str
    options: Dict[str, str]       # {"A": "...", "B": "...", ...}
    scores: Dict[str, Dict[str, int]]  # {"A": {"cloud": 10, "cyber": 5, "ai": 0, "iot": 0}}
    difficulty: str               # "easy", "medium", "hard"


@dataclass
class ProfileResult:
    """Result of the assessment."""
    primary_profile: str          # "cloud" | "cyber" | "ai" | "iot"
    secondary_profile: Optional[str]
    scores: Dict[str, int]        # {"cloud": 85, "cyber": 45, "ai": 30, "iot": 10}
    strengths: List[str]
    weaknesses: List[str]
    recommended_first_cert: str
    summary: str


# ═══════════════════════════════════════════════════════════════════════════════
# ASSESSMENT SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

class AssessmentSystem:
    """
    Quiz-based profile detection across 4 domains.
    All question data is loaded from questions.json.
    """

    PROFILE_NAMES = {
        "cloud": "Cloud & DevOps",
        "cyber": "Cybersécurité",
        "ai": "Intelligence Artificielle",
        "iot": "Internet des Objets (IoT)",
    }

    def __init__(self):
        data = _load_questions_data()
        self._cert_recommendations: Dict[str, dict] = data["cert_recommendations"]
        self.questions: List[AssessmentQuestion] = self._parse_questions(
            data["assessment_questions"]
        )

    # ── Parsing ────────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_questions(raw: list) -> List[AssessmentQuestion]:
        return [
            AssessmentQuestion(
                id=q["id"],
                domain=Domain(q["domain"]),
                question=q["question"],
                options=q["options"],
                scores=q["scores"],
                difficulty=q["difficulty"],
            )
            for q in raw
        ]

    # ── Public API ─────────────────────────────────────────────────────────────

    def get_all_questions(self, lang: str = "fr") -> List[Dict]:
        """
        Return all assessment questions in randomized order.

        Question ORDER is shuffled on every call so users never see the same
        sequence twice.

        Option letters are intentionally kept in original positions because
        calculate_profile() looks up scores by the letter the user submitted —
        shuffling letters would silently break scoring without a server-side
        remapping mechanism.
        """
        shuffled = list(self.questions)
        random.shuffle(shuffled)
        return [
            {
                "id": q.id,
                "domain": q.domain.value,
                "question": q.question,
                "options": q.options,
                "difficulty": q.difficulty,
            }
            for q in shuffled
        ]

    def calculate_profile(
        self,
        answers: Dict[str, str],
        dynamic_questions: Optional[List[Dict]] = None,
    ) -> ProfileResult:
        """
        Calculate user profile from submitted answers.

        Args:
            answers: {question_id: answer_letter}, e.g. {"1": "A", "2": "C"}
            dynamic_questions: LLM-generated question dicts (with "scores" key).
                If provided, these are used instead of the static self.questions bank.

        Returns:
            ProfileResult with primary profile, scores, strengths, weaknesses.
        """
        all_domains = [d.value for d in Domain]
        scores = {d: 0 for d in all_domains}
        max_possible = {d: 0 for d in all_domains}

        # Use dynamic (LLM-generated) questions if provided, else static bank
        if dynamic_questions:
            question_items = dynamic_questions   # list of dicts with "id" and "scores"
        else:
            question_items = [
                {"id": q.id, "scores": q.scores} for q in self.questions
            ]

        for q in question_items:
            qid = str(q["id"])
            answer = answers.get(qid, "A")
            q_scores_map: Dict[str, Dict] = q["scores"]
            q_scores = q_scores_map.get(answer, q_scores_map.get("A", {}))

            for domain in all_domains:
                scores[domain] += q_scores.get(domain, 0)
                max_possible[domain] += max(
                    (s.get(domain, 0) for s in q_scores_map.values()), default=0
                )

        # Normalize to percentages
        normalized: Dict[str, int] = {
            d: round((scores[d] / max_possible[d]) * 100) if max_possible[d] > 0 else 0
            for d in all_domains
        }

        # Primary and secondary profiles
        sorted_scores = sorted(normalized.items(), key=lambda x: x[1], reverse=True)
        primary = sorted_scores[0][0]
        secondary = (
            sorted_scores[1][0]
            if len(sorted_scores) > 1
            and (sorted_scores[0][1] - sorted_scores[1][1]) < 20
            else None
        )

        strengths = self._determine_strengths(normalized, answers)
        weaknesses = self._determine_weaknesses(normalized)
        cert_rec = self._cert_recommendations.get(primary, {"first": "AZ-900"})
        summary = self._generate_summary(primary, secondary, normalized, strengths)

        return ProfileResult(
            primary_profile=primary,
            secondary_profile=secondary,
            scores=normalized,
            strengths=strengths,
            weaknesses=weaknesses,
            recommended_first_cert=cert_rec["first"],
            summary=summary,
        )

    def to_dict(self, result: ProfileResult) -> Dict:
        """Serialize ProfileResult for API response."""
        return {
            "primary_profile": result.primary_profile,
            "secondary_profile": result.secondary_profile,
            "scores": result.scores,
            "strengths": result.strengths,
            "weaknesses": result.weaknesses,
            "recommended_first_certification": result.recommended_first_cert,
            "summary": result.summary,
            "certification_path": self._cert_recommendations.get(
                result.primary_profile, {}
            ).get("path", []),
        }

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _determine_strengths(
        self, scores: Dict[str, int], answers: Dict[str, str]
    ) -> List[str]:
        strengths = []

        domain_labels = {
            "cloud": "Architecture Cloud & Infrastructure",
            "cyber": "Sensibilité Sécurité & Protection",
            "ai": "Intelligence Artificielle & Data",
            "iot": "Internet des Objets & Edge Computing",
        }
        for domain, label in domain_labels.items():
            if scores.get(domain, 0) >= 70:
                strengths.append(label)

        if not strengths:
            top = max(scores.items(), key=lambda x: x[1])
            strengths.append(f"Intérêt pour {domain_labels.get(top[0], top[0])}")

        # Bonus: solved hard questions well
        hard_good = sum(
            1
            for q in self.questions
            if q.difficulty == "hard"
            and sum(q.scores.get(answers.get(str(q.id), ""), {}).values()) >= 10
        )
        if hard_good >= 2:
            strengths.append("Capacité à résoudre des problèmes complexes")

        return strengths

    def _determine_weaknesses(self, scores: Dict[str, int]) -> List[str]:
        """Return a list of descriptive weakness strings for domains below 50%."""
        domain_labels = {
            "cloud": "Fondamentaux Cloud & Infrastructure",
            "cyber": "Sécurité des Systèmes & Réseaux",
            "ai": "Intelligence Artificielle & Data Science",
            "iot": "Internet des Objets & Edge Computing",
        }
        weaknesses = []
        for domain, label in domain_labels.items():
            score = scores.get(domain, 0)
            if score < 50:
                weaknesses.append(label)
        return weaknesses

    def _generate_summary(
        self,
        primary: str,
        secondary: Optional[str],
        scores: Dict[str, int],
        strengths: List[str],
    ) -> str:
        """Generate a human-readable French summary of the profile."""
        primary_score = scores.get(primary, 0)
        label_map = {
            "cloud": "Cloud & DevOps",
            "cyber": "Cybersécurité",
            "ai": "Intelligence Artificielle",
            "iot": "IoT & Embarqué",
        }
        primary_label = label_map.get(primary, primary)
        summary = (
            f"Votre profil dominant est {primary_label} avec {primary_score}% d'affinité."
        )
        if secondary:
            sec_label = label_map.get(secondary, secondary)
            sec_score = scores.get(secondary, 0)
            summary += (
                f" Profil secondaire : {sec_label} ({sec_score}%)."
            )
        if strengths:
            summary += f" Points forts identifiés : {', '.join(strengths[:2])}."
        return summary


# ═══════════════════════════════════════════════════════════════════════════════
# SKILL GAP ANALYSIS
# Detailed breakdown of domain-specific gaps with learning resources
# ═══════════════════════════════════════════════════════════════════════════════

SKILL_GAP_RESOURCES = {
    "cloud": {
        "concepts": ["Azure Fundamentals (AZ-900)", "AWS Cloud Practitioner"],
        "resources": [
            {"title": "Microsoft Learn - Azure Fundamentals", "url": "https://learn.microsoft.com/fr-fr/training/azure-fundamentals/", "type": "free"},
            {"title": "AWS Free Tier", "url": "https://aws.amazon.com/free/", "type": "free"},
            {"title": "Cloud Computing Basics - Coursera", "url": "https://coursera.org", "type": "paid"},
        ],
        "skills": ["Comprendre les modèles de service (IaaS, PaaS, SaaS)", "Stockage cloud et bases de données", "Réseaux virtuels et sécurité cloud"],
    },
    "cyber": {
        "concepts": ["Security Fundamentals (SC-900)", "CompTIA Security+"],
        "resources": [
            {"title": "Microsoft Learn - Security Fundamentals", "url": "https://learn.microsoft.com/fr-fr/training/security-fundamentals/", "type": "free"},
            {"title": "TryHackMe - Introduction à la cybersécurité", "url": "https://tryhackme.com", "type": "freemium"},
            {"title": "CyberSecurity Bootcamp", "url": "https://bootcamp.com", "type": "paid"},
        ],
        "skills": ["Principes de sécurité Zero Trust", "Gestion des identités et accès", "Détection et réponse aux menaces"],
    },
    "ai": {
        "concepts": ["AI Fundamentals (AI-900)", "Azure AI Engineer (AI-102)"],
        "resources": [
            {"title": "Microsoft Learn - AI Fundamentals", "url": "https://learn.microsoft.com/fr-fr/training/ai-fundamentals/", "type": "free"},
            {"title": "Fast.ai - Practical Deep Learning", "url": "https://fast.ai", "type": "free"},
            {"title": "Coursera Machine Learning", "url": "https://coursera.org/learn/machine-learning", "type": "paid"},
        ],
        "skills": ["Machine Learning supervisé et non supervisé", "Services cognitifs Azure (Vision, Langage)", "MLOps et déploiement de modèles"],
    },
    "iot": {
        "concepts": ["Azure IoT Developer (AZ-220)", "Edge Computing"],
        "resources": [
            {"title": "Microsoft Learn - IoT Fundamentals", "url": "https://learn.microsoft.com/fr-fr/training/iot-fundamentals/", "type": "free"},
            {"title": "Raspberry Pi IoT Projects", "url": "https://projects.raspberrypi.org", "type": "free"},
            {"title": "Udemy - IoT Architecture", "url": "https://udemy.com", "type": "paid"},
        ],
        "skills": ["Protocoles IoT (MQTT, CoAP, HTTP)", "Edge computing et traitement local", "Sécurité des appareils connectés"],
    },
}


@dataclass
class SkillGapResult:
    """Detailed skill gap analysis for a domain."""
    domain: str
    current_score: int
    target_score: int
    gap_percentage: int
    priority_level: str  # "critique", "important", "optionnel"
    missing_concepts: List[str]
    recommended_resources: List[Dict[str, str]]
    key_skills_to_acquire: List[str]
    estimated_hours_to_bridge: int


class SkillGapAnalyzer:
    """
    Analyzes assessment results to identify specific skill gaps
    and provides targeted learning recommendations.
    """

    # Score thresholds
    CRITICAL_THRESHOLD = 30
    IMPORTANT_THRESHOLD = 50
    TARGET_SCORE = 70

    def analyze(self, scores: Dict[str, int], profile: str) -> List[SkillGapResult]:
        """
        Generate detailed gap analysis for each domain.
        
        Returns list ordered by priority (critical gaps first).
        """
        results = []
        
        for domain, score in scores.items():
            resources = SKILL_GAP_RESOURCES.get(domain, {})
            
            # Determine priority
            if score < self.CRITICAL_THRESHOLD:
                priority = "critique"
                hours_estimate = 40
            elif score < self.IMPORTANT_THRESHOLD:
                priority = "important"
                hours_estimate = 25
            elif score < self.TARGET_SCORE:
                priority = "optionnel"
                hours_estimate = 15
            else:
                priority = "maîtrisé"
                hours_estimate = 0

            gap_pct = max(0, self.TARGET_SCORE - score)
            
            result = SkillGapResult(
                domain=domain,
                current_score=score,
                target_score=self.TARGET_SCORE,
                gap_percentage=gap_pct,
                priority_level=priority,
                missing_concepts=resources.get("concepts", []),
                recommended_resources=resources.get("resources", []),
                key_skills_to_acquire=resources.get("skills", []),
                estimated_hours_to_bridge=hours_estimate
            )
            results.append(result)
        
        # Sort by priority (critical first)
        priority_order = {"critique": 0, "important": 1, "optionnel": 2, "maîtrisé": 3}
        results.sort(key=lambda x: priority_order.get(x.priority_level, 4))
        
        return results

    def get_focused_learning_path(self, gaps: List[SkillGapResult]) -> Dict:
        """
        Generate a prioritized learning path based on gaps.
        """
        critical_gaps = [g for g in gaps if g.priority_level == "critique"]
        important_gaps = [g for g in gaps if g.priority_level == "important"]
        
        total_hours = sum(g.estimated_hours_to_bridge for g in critical_gaps + important_gaps)
        
        return {
            "critical_gaps_count": len(critical_gaps),
            "important_gaps_count": len(important_gaps),
            "total_hours_needed": total_hours,
            "recommended_weeks": max(4, total_hours // 8),  # Assume 8h/week
            "priority_domains": [g.domain for g in critical_gaps[:2]],
            "immediate_actions": [
                f"Commencer par {g.domain}: {g.key_skills_to_acquire[0]}"
                for g in critical_gaps[:2]
            ] if critical_gaps else ["Vous avez une bonne base, continuez sur votre lancée!"],
        }

    def to_dict(self, result: SkillGapResult) -> Dict:
        """Serialize SkillGapResult for API response."""
        return {
            "domain": result.domain,
            "current_score": result.current_score,
            "target_score": result.target_score,
            "gap_percentage": result.gap_percentage,
            "priority_level": result.priority_level,
            "missing_concepts": result.missing_concepts,
            "recommended_resources": result.recommended_resources,
            "key_skills_to_acquire": result.key_skills_to_acquire,
            "estimated_hours_to_bridge": result.estimated_hours_to_bridge,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIDENCE SCORING SYSTEM
# Captures and weights answers by user confidence level
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ConfidenceScoredAnswer:
    """Answer with confidence metadata."""
    question_id: int
    answer: str
    confidence: int  # 1-5 scale
    domain_scores: Dict[str, int]
    is_correct: Optional[bool] = None  # For level quizzes


class ConfidenceScorer:
    """
    Adjusts domain scores based on answer confidence.
    High confidence + wrong = bigger knowledge gap indicator.
    """
    
    # Weight multipliers for confidence levels
    CONFIDENCE_WEIGHTS = {
        1: 0.7,  # Guessing - lower weight
        2: 0.85,
        3: 1.0,  # Normal confidence
        4: 1.15,
        5: 1.3,  # Very confident - higher weight if wrong
    }
    
    def calculate_weighted_scores(
        self,
        answers: List[ConfidenceScoredAnswer],
        questions_data: List[Dict]
    ) -> Dict[str, Dict]:
        """
        Calculate weighted domain scores considering confidence.
        
        Returns:
            {
                "raw_scores": {"cloud": 65, "cyber": 45, ...},
                "confidence_adjusted": {"cloud": 62, "cyber": 52, ...},
                "confidence_metrics": {
                    "avg_confidence": 3.4,
                    "high_conf_wrong_count": 2,
                    "low_conf_right_count": 3,
                    "calibration_score": 0.75  # How well calibrated is user
                }
            }
        """
        # Calculate raw scores first
        raw_scores = {"cloud": 0, "cyber": 0, "ai": 0, "iot": 0}
        max_possible = {"cloud": 0, "cyber": 0, "ai": 0, "iot": 0}
        
        # Confidence metrics
        total_confidence = 0
        high_conf_wrong = 0
        low_conf_right = 0
        calibration_pairs = []  # (confidence, actual_correct)
        
        for ans in answers:
            total_confidence += ans.confidence
            
            # Find question data
            q_data = next(
                (q for q in questions_data if q.get("id") == ans.question_id),
                None
            )
            
            if q_data and "scores" in q_data:
                raw_scores_ans = q_data["scores"].get(ans.answer, {})
                max_per_q = {d: 0 for d in ["cloud", "cyber", "ai", "iot"]}
                
                for opt_scores in q_data["scores"].values():
                    for domain in max_per_q:
                        max_per_q[domain] = max(max_per_q[domain], opt_scores.get(domain, 0))
                
                # Apply confidence weight
                weight = self.CONFIDENCE_WEIGHTS.get(ans.confidence, 1.0)
                weighted_scores = {
                    d: int(raw_scores_ans.get(d, 0) * weight)
                    for d in raw_scores
                }
                
                for domain in raw_scores:
                    raw_scores[domain] += weighted_scores.get(domain, 0)
                    max_possible[domain] += max_per_q.get(domain, 0)
                
                # Track calibration metrics (for level quizzes with known answers)
                if ans.is_correct is not None:
                    calibration_pairs.append((ans.confidence, ans.is_correct))
                    if ans.confidence >= 4 and not ans.is_correct:
                        high_conf_wrong += 1
                    elif ans.confidence <= 2 and ans.is_correct:
                        low_conf_right += 1
        
        # Normalize to percentages
        normalized = {
            d: round((raw_scores[d] / max_possible[d]) * 100) if max_possible[d] > 0 else 0
            for d in raw_scores
        }
        
        # Calculate calibration score
        calibration_score = self._calculate_calibration(calibration_pairs)
        
        return {
            "raw_scores": normalized,
            "confidence_metrics": {
                "avg_confidence": round(total_confidence / len(answers), 2) if answers else 0,
                "high_confidence_wrong": high_conf_wrong,
                "low_confidence_right": low_conf_right,
                "calibration_score": calibration_score,  # 0-1, higher is better calibrated
            }
        }
    
    def _calculate_calibration(self, pairs: List[tuple]) -> float:
        """Calculate how well-calibrated the user is (0-1)."""
        if not pairs:
            return 0.5  # Neutral if no data
        
        # Group by confidence level
        conf_groups = {i: {"total": 0, "correct": 0} for i in range(1, 6)}
        for conf, correct in pairs:
            conf_groups[conf]["total"] += 1
            if correct:
                conf_groups[conf]["correct"] += 1
        
        # Calculate expected vs actual accuracy per confidence level
        calibration_errors = []
        for conf, data in conf_groups.items():
            if data["total"] > 0:
                expected = conf / 5.0  # Confidence 5 should mean 100% accuracy
                actual = data["correct"] / data["total"]
                calibration_errors.append(abs(expected - actual))
        
        if not calibration_errors:
            return 0.5
        
        # Lower error = better calibration
        avg_error = sum(calibration_errors) / len(calibration_errors)
        return max(0, 1 - avg_error)


# ═══════════════════════════════════════════════════════════════════════════════
# BENCHMARKING SYSTEM
# Compares user scores against aggregated population data
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class BenchmarkStats:
    """Statistics for benchmarking comparison."""
    domain: str
    percentile: int  # User's percentile (0-100)
    mean_score: float
    median_score: float
    user_score: int
    comparison_group: str  # "all_users", "same_profile", "similar_level"


class BenchmarkingSystem:
    """
    Provides percentile rankings and peer comparisons.
    Uses in-memory statistics - in production, this would query Cosmos DB.
    """
    
    def __init__(self):
        # Simulated population statistics (replace with actual DB aggregation)
        # Format: domain -> {percentile: score_threshold}
        self._population_stats = {
            "cloud": {
                "mean": 52, "median": 55, "std": 20,
                "p10": 30, "p25": 40, "p50": 55, "p75": 70, "p90": 85
            },
            "cyber": {
                "mean": 48, "median": 50, "std": 22,
                "p10": 25, "p25": 35, "p50": 50, "p75": 65, "p90": 80
            },
            "ai": {
                "mean": 45, "median": 45, "std": 25,
                "p10": 20, "p25": 30, "p50": 45, "p75": 60, "p90": 80
            },
            "iot": {
                "mean": 42, "median": 40, "std": 23,
                "p10": 18, "p25": 28, "p50": 40, "p75": 55, "p90": 75
            },
        }
        
        # Track assessment history for trend analysis
        self._assessment_history: Dict[str, List[Dict]] = {}  # user_id -> history
    
    def calculate_percentile(self, domain: str, score: int) -> int:
        """Calculate user's percentile for a domain score."""
        stats = self._population_stats.get(domain, {})
        
        # Find which percentile bucket the score falls into
        percentiles = [10, 25, 50, 75, 90]
        for p in reversed(percentiles):
            threshold = stats.get(f"p{p}", 0)
            if score >= threshold:
                return min(99, p + (score - threshold) // 2)
        
        # Below 10th percentile
        return max(1, score // 3)
    
    def get_benchmarks(
        self,
        user_scores: Dict[str, int],
        profile: str,
        comparison_type: str = "all_users"
    ) -> List[BenchmarkStats]:
        """
        Get benchmarking data for all domains.
        
        Args:
            user_scores: User's domain scores
            profile: Primary profile for contextual comparison
            comparison_type: "all_users", "same_profile", or "similar_level"
        """
        results = []
        
        for domain, score in user_scores.items():
            stats = self._population_stats.get(domain, {})
            percentile = self.calculate_percentile(domain, score)
            
            # Adjust comparison context based on profile
            if domain == profile:
                comparison_context = f"apprenants {profile}"
            else:
                comparison_context = "tous les apprenants"
            
            results.append(BenchmarkStats(
                domain=domain,
                percentile=percentile,
                mean_score=stats.get("mean", 50),
                median_score=stats.get("median", 50),
                user_score=score,
                comparison_group=comparison_context
            ))
        
        return results
    
    def get_improvement_trend(self, user_id: str) -> Dict:
        """Get score trend over multiple assessments."""
        history = self._assessment_history.get(user_id, [])
        if len(history) < 2:
            return {"has_trend": False, "message": "Reprenez l'évaluation dans quelques semaines pour voir votre progression"}
        
        # Calculate trend
        first = history[0]["scores"]
        latest = history[-1]["scores"]
        
        improvements = {
            d: latest.get(d, 0) - first.get(d, 0)
            for d in ["cloud", "cyber", "ai", "iot"]
        }
        
        best_improvement = max(improvements.items(), key=lambda x: x[1])
        
        return {
            "has_trend": True,
            "assessments_count": len(history),
            "days_between": (history[-1]["timestamp"] - history[0]["timestamp"]).days,
            "domain_improvements": improvements,
            "best_improvement_domain": best_improvement[0],
            "best_improvement_points": best_improvement[1],
            "overall_trend": "improving" if sum(improvements.values()) > 0 else "stable"
        }
    
    def record_assessment(self, user_id: str, scores: Dict[str, int], timestamp=None):
        """Record assessment for trend tracking."""
        from datetime import datetime
        
        if user_id not in self._assessment_history:
            self._assessment_history[user_id] = []
        
        self._assessment_history[user_id].append({
            "scores": scores,
            "timestamp": timestamp or datetime.now(),
        })
        
        # Keep last 10 assessments
        self._assessment_history[user_id] = self._assessment_history[user_id][-10:]
    
    def to_dict(self, stats: BenchmarkStats) -> Dict:
        """Serialize BenchmarkStats for API response."""
        return {
            "domain": stats.domain,
            "percentile": stats.percentile,
            "user_score": stats.user_score,
            "mean_score": stats.mean_score,
            "median_score": stats.median_score,
            "comparison_group": stats.comparison_group,
            "interpretation": self._get_interpretation(stats.percentile)
        }
    
    def _get_interpretation(self, percentile: int) -> str:
        """Get human-readable interpretation of percentile."""
        if percentile >= 90:
            return "Excellent! Vous êtes dans les 10% meilleurs."
        elif percentile >= 75:
            return "Très bien! Vous surpassez 75% des apprenants."
        elif percentile >= 50:
            return "Au-dessus de la moyenne. Continuez ainsi!"
        elif percentile >= 25:
            return "En progression. Concentrez-vous sur les lacunes identifiées."
        else:
            return "Beaucoup de potentiel d'amélioration. Suivez le parcours recommandé."


benchmarking_system = BenchmarkingSystem()


# ═══════════════════════════════════════════════════════════════════════════════
# LEVEL QUIZ SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

class LevelQuizSystem:
    """
    Generates 10-question level assessment quizzes adapted to the detected profile.
    Questions loaded from questions.json.
    Distribution: 4 easy (1pt) + 4 medium (2pts) + 2 hard (3pts)
    """

    def __init__(self):
        data = _load_questions_data()
        self._templates: Dict[str, dict] = data["level_quiz_templates"]

    # ── Option shuffling helper ────────────────────────────────────────────────

    @staticmethod
    def _shuffle_options(question: dict) -> dict:
        """
        Return a copy of `question` with the answer options in a random order.

        Because the level quiz evaluator compares the user's submitted letter
        against `bonne_reponse`, we update `bonne_reponse` to track whichever
        letter now holds the correct answer after shuffling.
        """
        letters = list("ABCD")
        original_options = question["options"]          # {"A": text, "B": text, …}
        correct_letter   = question["bonne_reponse"].upper()

        option_texts = [original_options[l] for l in letters if l in original_options]
        random.shuffle(option_texts)

        new_options: dict = {}
        new_correct = correct_letter  # fallback
        original_correct_text = original_options.get(correct_letter, "")

        for letter, text in zip(letters, option_texts):
            new_options[letter] = text
            if text == original_correct_text:
                new_correct = letter

        return {
            **question,
            "options": new_options,
            "bonne_reponse": new_correct,
        }

    def generate_quiz(self, profile: str, lang: str = "fr") -> Dict:
        """
        Generate a 10-question level quiz for the given profile.

        Randomisation applied on every call:
          1. Questions are sampled randomly from each difficulty pool.
          2. The combined list is shuffled — difficulty order is hidden.
          3. Answer options within each question are shuffled and
             `bonne_reponse` is updated to match the new letter position.

        Falls back to 'cloud' if the profile is unrecognised.
        """
        if profile not in self._templates:
            profile = "cloud"

        templates = self._templates[profile]

        easy_pool   = templates.get("fundamental", [])
        medium_pool = templates.get("associate", [])
        hard_pool   = templates.get("expert", [])

        # Tag each question with its tier so we can restore difficulty label later
        tagged: List[tuple] = (
            [("facile",   q) for q in random.sample(easy_pool,   min(4, len(easy_pool)))]
            + [("moyen",  q) for q in random.sample(medium_pool, min(4, len(medium_pool)))]
            + [("difficile", q) for q in random.sample(hard_pool, min(2, len(hard_pool)))]
        )

        # Pad if a tier has fewer questions than needed
        while len(tagged) < 10:
            tagged.append(("facile", {
                "question": f"Question de niveau #{len(tagged) + 1}",
                "options": {"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"},
                "bonne_reponse": "A",
                "explication": "Bonne réponse : A",
                "points": 1,
            }))

        # Shuffle combined list — breaks the easy→medium→hard pattern
        random.shuffle(tagged)

        formatted = [
            {
                "id": i,
                **self._shuffle_options({
                    "question":      q["question"],
                    "options":       q["options"],
                    "bonne_reponse": q["bonne_reponse"],
                    "explication":   q["explication"],
                    "points":        q.get("points", 1),
                }),
                "difficulte": tier,
            }
            for i, (tier, q) in enumerate(tagged[:10], 1)
        ]

        return {
            "profile": profile,
            "questions": formatted,
            "total_questions": len(formatted),
        }


# ═══════════════════════════════════════════════════════════════════════════════
# DYNAMIC QUESTION GENERATION
# Uses Azure Search + LLM to generate fresh questions from certification docs
# ═══════════════════════════════════════════════════════════════════════════════

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from search_index_manager import SearchIndexManager


class DynamicQuestionGenerator:
    """
    Generates assessment questions dynamically using Azure Search + LLM.
    Pulls from certification documentation to create fresh questions.
    """
    
    def __init__(self, search_manager: Optional['SearchIndexManager'] = None, llm=None):
        self.search_manager = search_manager
        self.llm = llm
        
    async def generate_questions_for_domain(
        self,
        domain: str,
        count: int = 3,
        difficulty: str = "mixed"
    ) -> List[Dict]:
        """
        Generate questions for a specific domain using Azure Search.
        
        Args:
            domain: One of cloud, cyber, ai, iot
            count: Number of questions to generate
            difficulty: easy, medium, hard, or mixed
        """
        if not self.search_manager or not self.llm:
            return []  # Fallback to static questions
        
        # Search for relevant content
        search_query = f"{domain} certification exam fundamentals concepts"
        try:
            search_results = await self.search_manager.search_structured(
                search_query,
                top_k=5,
                cloud_filter=domain if domain == "cloud" else None
            )
        except Exception:
            return []
        
        if not search_results:
            return []
        
        # Generate questions from search results using LLM
        context = "\n\n".join([r.get("texte", "") for r in search_results[:3]])
        
        prompt = f"""Generate {count} multiple-choice questions for a {domain} certification assessment.
Difficulty: {difficulty}

Based on this context:
{context}

For each question, provide:
- question: The question text (in French)
- options: Dict with keys A, B, C, D
- correct_answer: The correct option letter
- scores: Dict mapping each option letter to domain scores {{"cloud": 0-10, "cyber": 0-10, "ai": 0-10, "iot": 0-10}}
- difficulty: easy, medium, or hard

Format as JSON array."""

        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            response = await self.llm.ainvoke([
                SystemMessage(content="You are an expert exam question writer for IT certifications."),
                HumanMessage(content=prompt)
            ])
            
            # Parse generated questions
            import re
            import json
            
            # Extract JSON from response
            text = re.sub(r"```(?:json)?", "", response.content).strip()
            match = re.search(r"\[.*\]", text, re.DOTALL)
            if match:
                questions = json.loads(match.group())
                # Validate and format
                formatted = []
                for i, q in enumerate(questions, 1):
                    if all(k in q for k in ["question", "options", "correct_answer", "scores"]):
                        formatted.append({
                            "id": f"dyn_{domain}_{i}_{int(os.urandom(4).hex(), 16)}",
                            "domain": domain,
                            "question": q["question"],
                            "options": q["options"],
                            "scores": q["scores"],
                            "difficulty": q.get("difficulty", "medium"),
                            "source": "llm"
                        })
                return formatted[:count]
        except Exception as exc:
            print(f"[DynamicQuestionGenerator] Failed: {exc}")
            return []
        
        return []


# ═══════════════════════════════════════════════════════════════════════════════
# ASSESSMENT API  (public facade used by the FastAPI server)
# ═══════════════════════════════════════════════════════════════════════════════

class AssessmentAPI:
    """Public facade combining AssessmentSystem, LevelQuizSystem, and AdaptiveAssessmentSystem."""

    def __init__(self, search_manager=None, llm=None):
        self.assessment = AssessmentSystem()
        self.level_quiz = LevelQuizSystem()
        self.adaptive = AdaptiveAssessmentSystem(self.assessment.questions)
        self.skill_analyzer = SkillGapAnalyzer()
        self.confidence_scorer = ConfidenceScorer()
        self.benchmarking = BenchmarkingSystem()
        self.question_generator = DynamicQuestionGenerator(search_manager, llm)

    # ── Phase 1 ────────────────────────────────────────────────────────────────

    def get_assessment_questions(self, lang: str = "fr", use_dynamic: bool = False) -> List[Dict]:
        """
        Get assessment questions.
        
        Args:
            lang: Language code
            use_dynamic: If True and generator available, mix in LLM-generated questions
        """
        questions = self.assessment.get_all_questions(lang)
        
        # TODO: If use_dynamic is True, we would need async call
        # For now, return static questions
        return questions

    def submit_assessment(
        self,
        answers: Dict[str, str],
        dynamic_questions: Optional[List[Dict]] = None,
        confidence_data: Optional[Dict[str, int]] = None,
        user_id: str = "anonymous"
    ) -> Dict:
        """
        Score submitted answers with enhanced analysis.
        
        Args:
            answers: {question_id: answer_letter}
            dynamic_questions: LLM-generated questions (if used)
            confidence_data: {question_id: confidence_1_to_5}
            user_id: For tracking/benchmarking
        """
        # Get base profile result
        result = self.assessment.calculate_profile(answers, dynamic_questions)
        base_result = self.assessment.to_dict(result)
        
        scores = base_result["scores"]
        profile = base_result["primary_profile"]
        
        # ── Skill Gap Analysis ──
        gaps = self.skill_analyzer.analyze(scores, profile)
        learning_path = self.skill_analyzer.get_focused_learning_path(gaps)
        
        # ── Benchmarking ──
        benchmarks = self.benchmarking.get_benchmarks(scores, profile)
        self.benchmarking.record_assessment(user_id, scores)
        trend = self.benchmarking.get_improvement_trend(user_id)
        
        # ── Confidence Scoring (if provided) ──
        confidence_analysis = None
        if confidence_data:
            conf_answers = [
                ConfidenceScoredAnswer(
                    question_id=int(qid),
                    answer=ans,
                    confidence=confidence_data.get(qid, 3),
                    domain_scores={}  # Will be filled from questions
                )
                for qid, ans in answers.items()
            ]
            all_questions = dynamic_questions or []
            confidence_analysis = self.confidence_scorer.calculate_weighted_scores(
                conf_answers, all_questions
            )
        
        # Build enhanced result
        enhanced_result = {
            **base_result,
            "skill_gap_analysis": {
                "gaps": [self.skill_analyzer.to_dict(g) for g in gaps],
                "learning_path": learning_path,
            },
            "benchmarking": {
                "comparisons": [self.benchmarking.to_dict(b) for b in benchmarks],
                "trend": trend,
            },
        }
        
        if confidence_analysis:
            enhanced_result["confidence_analysis"] = confidence_analysis
        
        return enhanced_result

    # ── Phase 2 ────────────────────────────────────────────────────────────────

    def get_level_quiz(self, profile: str, lang: str = "fr") -> Dict:
        return self.level_quiz.generate_quiz(profile, lang)

    def evaluate_level(self, questions: List[Dict], answers: Dict[str, str]) -> Dict:
        """Score the level quiz and return niveau + recommendations."""
        total_points = 0
        earned_points = 0
        details = []

        for q in questions:
            qid = str(q["id"])
            user_answer = answers.get(qid, "").upper()
            correct = user_answer == q["bonne_reponse"].upper()
            points = q["points"] if correct else 0

            earned_points += points
            total_points += q["points"]

            details.append({
                "id": qid,
                "correct": correct,
                "reponse_apprenant": user_answer,
                "bonne_reponse": q["bonne_reponse"],
                "explication": q["explication"],
            })

        percentage = (earned_points / total_points * 100) if total_points > 0 else 0

        # 5-band system — richer context for the roadmap LLM
        if percentage < 20:
            niveau = "Débutant"
        elif percentage < 45:
            niveau = "Débutant+"
        elif percentage < 65:
            niveau = "Intermédiaire"
        elif percentage < 80:
            niveau = "Intermédiaire+"
        else:
            niveau = "Expert"

        return {
            "niveau": niveau,
            "score": {
                "obtenu": earned_points,
                "total": total_points,
                "pourcentage": round(percentage, 1),
            },
            "analyse": f"Niveau : {niveau} ({percentage:.0f}%)",
            "questions_detail": details,
            "recommendations": self._get_level_recommendations(niveau),
        }

    # ── Internal ───────────────────────────────────────────────────────────────

    @staticmethod
    def _get_level_recommendations(niveau: str) -> List[str]:
        recs = {
            "Débutant": [
                "Commencez par AZ-900 / AI-900 / SC-900 / AZ-220 selon votre profil",
                "Consacrez 8-10h/semaine aux ressources Microsoft Learn",
                "Pratiquez sur Azure Free Tier et AWS Free Tier",
                "Rejoignez un groupe d'étude ou un bootcamp certifications",
            ],
            "Débutant+": [
                "Démarrez avec AZ-900 mais visez AZ-104 dès les 8 premières semaines",
                "Votre rythme d'apprentissage peut être plus rapide — ciblez 2 certifications la première année",
                "Commencez des labs hands-on dès maintenant (Microsoft Learn Sandbox)",
            ],
            "Intermédiaire": [
                "Les Fundamentals sont optionnels — passez directement aux certifications Associate",
                "Ciblez AZ-104, AI-102, AZ-500 ou AZ-220 selon votre profil",
                "Montez en compétences avec des projets réels sur Azure ou AWS",
                "Rejoignez des communautés tech (Azure Tech Community, Discord certif)",
            ],
            "Intermédiaire+": [
                "Vous êtes prêt pour la voie Expert — ciblez AZ-305, AZ-400 ou équivalent AWS",
                "Envisagez une double certification (ex: AZ-104 + AZ-500) pour un profil hybride",
                "Contribuez à des projets open source pour renforcer votre portfolio",
            ],
            "Expert": [
                "Visez les certifications Specialty / Expert (AZ-305, AZ-400, AWS SA Pro)",
                "Mentoring et partage de connaissances — devenez référent dans votre domaine",
                "Envisagez des rôles d'architecte cloud, CISO ou lead ML engineer",
                "Explorez les certifications multi-cloud pour maximiser votre employabilité",
            ],
        }
        return recs.get(niveau, [])


# ═══════════════════════════════════════════════════════════════════════════════
# SPRINT 2 — ADAPTIVE ASSESSMENT (CAT — Computerized Adaptive Testing)
#
# Instead of always presenting all 40 questions, AdaptiveAssessmentSystem
# selects the next question based on running domain scores:
#   - Prefer domains with fewer questions answered
#   - Prefer domains with lowest confidence score
#   - Stop early (after MIN_QUESTIONS) if the primary profile is clear
#     (gap between top two domains >= CONFIDENCE_GAP points)
#   - Hard stop at MAX_QUESTIONS
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class AdaptiveSession:
    """Tracks the state of one in-progress adaptive assessment."""
    token: str
    answered: Dict[int, str] = field(default_factory=dict)         # id → letter
    running_scores: Dict[str, int] = field(
        default_factory=lambda: {"cloud": 0, "cyber": 0, "ai": 0, "iot": 0}
    )
    max_possible: Dict[str, int] = field(
        default_factory=lambda: {"cloud": 0, "cyber": 0, "ai": 0, "iot": 0}
    )
    asked_ids: set = field(default_factory=set)
    # Remapped scores per question_id — set by _pick_next after option shuffle
    remapped_scores: Dict[int, Dict[str, Dict]] = field(default_factory=dict)


class AdaptiveAssessmentSystem:
    """
    Computerized Adaptive Testing for profile detection.

    Delivers 6-10 questions rather than a fixed 12, stopping as soon as
    enough confidence is reached. This makes the assessment feel faster
    for users who have strong domain preferences.
    """

    MIN_QUESTIONS = 6
    MAX_QUESTIONS = 10
    CONFIDENCE_GAP = 25  # points gap between 1st and 2nd domain to stop early

    def __init__(self, questions: List[AssessmentQuestion]):
        self.questions = questions
        self._sessions: Dict[str, AdaptiveSession] = {}

    def start_session(self) -> Dict:
        """Create a new adaptive session and return the first question."""
        token = str(uuid.uuid4())
        session = AdaptiveSession(token=token)
        self._sessions[token] = session

        first_q = self._pick_next(session)
        session.asked_ids.add(first_q["id"])
        if "scores" in first_q:
            session.remapped_scores[first_q["id"]] = first_q["scores"]
        return {
            "session_token": token,
            "question": first_q,
            "questions_answered": 0,
            "done": False,
        }

    def submit_answer(self, token: str, question_id: int, answer: str) -> Dict:
        """
        Record an answer, update running scores, and return either:
          - {"done": False, "question": <next>} if more questions needed
          - {"done": True, "result": <ProfileResult dict>} when finished
        """
        session = self._sessions.get(token)
        if session is None:
            raise ValueError(f"Adaptive session '{token}' not found or already completed.")

        q = next((q for q in self.questions if q.id == question_id), None)
        if q is None:
            raise ValueError(f"Question id={question_id} not found.")

        # Update running scores — use remapped scores if options were shuffled
        session.answered[question_id] = answer
        scores_map = session.remapped_scores.get(question_id) or q.scores
        q_scores = scores_map.get(answer, scores_map.get("A", {}))
        for domain in session.running_scores:
            session.running_scores[domain] += q_scores.get(domain, 0)
            session.max_possible[domain] += max(
                (s.get(domain, 0) for s in scores_map.values()), default=0
            )

        n = len(session.answered)
        normalized = self._normalize(session)

        # Check stop conditions
        done = n >= self.MAX_QUESTIONS
        if not done and n >= self.MIN_QUESTIONS:
            sorted_vals = sorted(normalized.values(), reverse=True)
            if len(sorted_vals) >= 2 and (sorted_vals[0] - sorted_vals[1]) >= self.CONFIDENCE_GAP:
                done = True

        if done:
            result = self._build_result(normalized, session.answered)
            del self._sessions[token]
            return {"done": True, "questions_answered": n, "result": result}

        next_q = self._pick_next(session)
        session.asked_ids.add(next_q["id"])
        # Store remapped scores so submit_answer uses the shuffled letter mapping
        if "scores" in next_q:
            session.remapped_scores[next_q["id"]] = next_q["scores"]
        return {
            "done": False,
            "questions_answered": n,
            "question": next_q,
            "partial_scores": normalized,
        }

    # ── Internals ──────────────────────────────────────────────────────────────

    def _normalize(self, session: AdaptiveSession) -> Dict[str, int]:
        return {
            d: round((session.running_scores[d] / session.max_possible[d]) * 100)
            if session.max_possible[d] > 0 else 0
            for d in session.running_scores
        }

    def _pick_next(self, session: AdaptiveSession) -> Dict:
        """
        Select the next question using adaptive priority, then shuffle its options.

        Priority: fewest-asked domain → lowest running score → easiest difficulty.
        Option shuffling is safe here because the adaptive flow scores by comparing
        the submitted letter against the original `q.scores` dict, so we return
        a `scores` mapping remapped to match the new option positions.
        """
        available = [q for q in self.questions if q.id not in session.asked_ids]
        if not available:
            available = self.questions  # fallback (shouldn't happen)

        asked_by_domain: Dict[str, int] = {d.value: 0 for d in Domain}
        for q in self.questions:
            if q.id in session.asked_ids:
                asked_by_domain[q.domain.value] += 1

        normalized = {
            d: round((session.running_scores[d] / session.max_possible[d]) * 100)
            if session.max_possible[d] > 0 else 50
            for d in session.running_scores
        }

        diff_weight = {"easy": 0, "medium": 1, "hard": 2}

        def priority(q: AssessmentQuestion) -> tuple:
            d = q.domain.value
            return (asked_by_domain.get(d, 0), normalized.get(d, 50), diff_weight.get(q.difficulty, 0))

        available.sort(key=priority)
        chosen = available[0]

        # Shuffle options and remap the scores dict to the new letters
        letters = list("ABCD")
        option_pairs = [(l, chosen.options[l]) for l in letters if l in chosen.options]
        random.shuffle(option_pairs)

        new_options: Dict[str, str] = {}
        letter_remap: Dict[str, str] = {}  # old_letter → new_letter
        for new_letter, (old_letter, text) in zip(letters, option_pairs):
            new_options[new_letter] = text
            letter_remap[old_letter] = new_letter

        new_scores: Dict[str, Dict] = {
            letter_remap.get(old, old): score_dict
            for old, score_dict in chosen.scores.items()
        }

        return {
            "id": chosen.id,
            "domain": chosen.domain.value,
            "question": chosen.question,
            "options": new_options,
            "scores": new_scores,   # remapped — used by submit_answer on the client-side display
            "difficulty": chosen.difficulty,
        }

    def _build_result(self, normalized: Dict[str, int], answered: Dict) -> Dict:
        sorted_scores = sorted(normalized.items(), key=lambda x: x[1], reverse=True)
        primary = sorted_scores[0][0]
        secondary = (
            sorted_scores[1][0]
            if len(sorted_scores) > 1 and (sorted_scores[0][1] - sorted_scores[1][1]) < 20
            else None
        )
        return {
            "primary_profile": primary,
            "secondary_profile": secondary,
            "scores": normalized,
            "questions_answered": len(answered),
            "method": "adaptive",
        }


# ═══════════════════════════════════════════════════════════════════════════════
# SPRINT 2 — PROGRESS TRACKER
#
# Records every completed assessment session per user_id.
# Provides trend analysis (score delta between first and latest session).
# In-memory — data resets on server restart. Cosmos DB integration is Sprint 4.
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ProgressEntry:
    timestamp: str
    session_id: str
    profile: str
    niveau: str
    scores: Dict[str, int]


class ProgressTracker:
    """
    Lightweight in-memory progress log per user.
    Keeps the last 20 sessions per user to bound memory usage.
    """

    MAX_SESSIONS = 20

    def __init__(self) -> None:
        self._data: Dict[str, List[ProgressEntry]] = {}

    def record(
        self,
        user_id: str,
        session_id: str,
        profile: str,
        niveau: str,
        scores: Dict[str, int],
    ) -> None:
        """Append a completed session to the user's history."""
        if user_id not in self._data:
            self._data[user_id] = []
        self._data[user_id].append(
            ProgressEntry(
                timestamp=datetime.now(timezone.utc).isoformat(),
                session_id=session_id,
                profile=profile,
                niveau=niveau,
                scores=dict(scores),
            )
        )
        # Keep only last MAX_SESSIONS entries
        self._data[user_id] = self._data[user_id][-self.MAX_SESSIONS:]

    def get_progress(self, user_id: str) -> Dict:
        """Return history and trend for the given user."""
        entries = self._data.get(user_id, [])
        if not entries:
            return {"user_id": user_id, "total_sessions": 0, "sessions": [], "latest": None, "trend": {}}

        latest = entries[-1]
        trend: Dict[str, int] = {}
        if len(entries) >= 2:
            first_scores = entries[0].scores
            last_scores = entries[-1].scores
            trend = {d: last_scores.get(d, 0) - first_scores.get(d, 0) for d in last_scores}

        return {
            "user_id": user_id,
            "total_sessions": len(entries),
            "latest": {
                "profile": latest.profile,
                "niveau": latest.niveau,
                "scores": latest.scores,
                "timestamp": latest.timestamp,
            },
            "trend": trend,
            "sessions": [
                {
                    "timestamp": e.timestamp,
                    "profile": e.profile,
                    "niveau": e.niveau,
                    "scores": e.scores,
                }
                for e in entries
            ],
        }


# ═══════════════════════════════════════════════════════════════════════════════
# SINGLETON
# ═══════════════════════════════════════════════════════════════════════════════

_assessment_api: Optional[AssessmentAPI] = None


def get_assessment_api() -> AssessmentAPI:
    """Return the shared AssessmentAPI singleton."""
    global _assessment_api
    if _assessment_api is None:
        _assessment_api = AssessmentAPI()
    return _assessment_api


# Shared ProgressTracker singleton (lives for the duration of the server process)
progress_tracker = ProgressTracker()
