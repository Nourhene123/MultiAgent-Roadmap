/**
 * ai-agent.service.ts — HTTP client for the Subul Roadmap API
 *
 * All communication with the FastAPI backend (port 8002) goes through this service.
 * Components import the singleton `aiAgentService` and named types from this module.
 */

const API_BASE = '/api/roadmap';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileResult {
  primary_profile: string;
  secondary_profile?: string;
  scores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  first_certification?: string;
  summary: string;
  skill_gap_analysis?: {
    gaps: SkillGap[];
    learning_path?: LearningPath;
  };
}

export interface SkillGap {
  domain: string;
  current_score: number;
  target_score: number;
  gap_percentage: number;
  priority: 'critique' | 'important' | 'optionnel' | 'maîtrisé';
  resources: string[];
}

export interface LearningPath {
  total_hours: number;
  total_weeks: number;
  priority_domains: string[];
}

export interface AdaptiveQuestion {
  id: number;
  domain: string;
  question: string;
  options: Record<string, string>;
  difficulty: string;
}

export interface AdaptiveAnswerResponse {
  done: boolean;
  questions_answered: number;
  question?: AdaptiveQuestion;
  partial_scores?: Record<string, number>;
  result?: ProfileResult & { questions_answered: number };
}

export interface WeeklyPlanItem {
  semaine: number;
  focus: string;
  heures: number;
  ressource?: string;
}

export interface CertificationItem {
  ordre: number;
  nom: string;
  code?: string;
  provider: string;
  niveau_certif: string;
  duree_preparation_semaines: number;
  heures_etude: number;
  prerequis: string[];
  pourquoi_cette_certif: string;
  competences_acquises: string[];
  statut: 'current' | 'upcoming' | 'locked';
  xp_reward: number;
  plan_semaine?: WeeklyPlanItem[];
  prix_examen_eur?: string;
  lien_formation_officielle?: string;
  lien_inscription_examen?: string;
}

export interface RoadmapPhase {
  phase_number: number;
  phase_name: string;
  phase_description: string;
  duration_weeks: number;
  level_tier?: string;
  certifications: CertificationItem[];
}

export interface CareerOutcome {
  titre_poste: string;
  salaire_moyen_eur?: string;
  entreprises_type: string[];
  niveau_requis: string;
}

export interface ParsedRoadmap {
  roadmap_title: string;
  roadmap_summary: string;
  total_estimated_weeks: number;
  total_certifications: number;
  user_level?: string;
  phases: RoadmapPhase[];
  conseil_final: string;
  debouches?: CareerOutcome[];
  objectifs_carriere?: string;
}

export type CertStatus = 'completed' | 'in_progress' | 'skipped' | 'not_started';

export interface ProgressSession {
  session_id: string;
  timestamp: string;
  profile: string;
  niveau: string;
  scores: Record<string, number>;
}

export interface Profile {
  primary_profile: string;
  scores: Record<string, number>;
}

export interface ProgressResponse {
  user_id: string;
  total_sessions: number;
  sessions: ProgressSession[];
  latest?: ProgressSession;
  score_delta?: Record<string, number>;
}

export interface NegotiationResponse {
  reply: string;
  changes_made: string[];
  updated_roadmap: ParsedRoadmap;
}

export interface SavedRoadmapMeta {
  saved_id: string;
  timestamp: string;
  profile: string;
  niveau: string;
  roadmap: ParsedRoadmap;
}

export interface SavedRoadmapsResponse {
  user_id: string;
  total: number;
  roadmaps: SavedRoadmapMeta[];
}

export interface GenerateRoadmapCallbacks {
  onMeta?: (meta: {
    roadmap_title: string;
    roadmap_summary: string;
    total_estimated_weeks: number;
    total_certifications: number;
    user_level: string;
    conseil_final: string;
    total_phases: number;
  }) => void;
  onPhase?: (phase: RoadmapPhase, phaseNumber: number, totalPhases: number) => void;
  onComplete?: (roadmap: ParsedRoadmap) => void;
  onError?: (error: string) => void;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class AiAgentService {

  // ── Phase 1 — Assessment ────────────────────────────────────────────────────

  async getAssessmentQuestions(
    lang = 'fr',
    sessionId = '',
    useStatic = false,
  ): Promise<{ questions: any[]; source?: string; session_id?: string }> {
    const res = await fetch(`${API_BASE}/assessment/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, session_id: sessionId, use_static: useStatic }),
    });
    if (!res.ok) throw new Error(`Assessment questions failed: ${res.status}`);
    const data = await res.json();
    // Return the full response so callers can access .questions, .source, etc.
    return { questions: data.questions || [], source: data.source, session_id: data.session_id };
  }

  async submitAssessment(
    answers: Record<string, string>,
    sessionId: string,
    userId = 'anonymous',
    lang = 'fr',
  ): Promise<ProfileResult> {
    const res = await fetch(`${API_BASE}/assessment/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, session_id: sessionId, user_id: userId, lang }),
    });
    if (!res.ok) throw new Error(`Assessment submit failed: ${res.status}`);
    return res.json();
  }

  /**
   * Submit answers with confidence scores.
   * Confidence is encoded into each answer as "A:4" (answer letter + confidence 1-5)
   * so the backend can run confidence-weighted scoring via ConfidenceScorer.
   */
  async submitAssessmentWithConfidence(
    answers: Record<string, string>,
    confidence: Record<string, number>,
    sessionId: string,
    userId = 'anonymous',
    lang = 'fr',
  ): Promise<ProfileResult> {
    // Encode confidence into answers: {"1": "A"} + {"1": 4} → {"1": "A:4"}
    const encodedAnswers: Record<string, string> = {};
    for (const [qid, letter] of Object.entries(answers)) {
      const conf = confidence[qid];
      encodedAnswers[qid] = conf != null ? `${letter}:${conf}` : letter;
    }
    const res = await fetch(`${API_BASE}/assessment/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: encodedAnswers,
        session_id: sessionId,
        user_id: userId,
        lang,
      }),
    });
    if (!res.ok) throw new Error(`Assessment submit failed: ${res.status}`);
    return res.json();
  }

  // ── Sprint 2 — Adaptive Assessment (CAT) ───────────────────────────────────

  async startAdaptiveAssessment(
    lang = 'fr',
  ): Promise<{ session_token: string; question: AdaptiveQuestion }> {
    const res = await fetch(`${API_BASE}/assessment/adaptive/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang }),
    });
    if (!res.ok) throw new Error(`Adaptive start failed: ${res.status}`);
    return res.json();
  }

  async submitAdaptiveAnswer(
    sessionToken: string,
    questionId: number,
    answer: string,
    sessionId: string,
    userId = 'anonymous',
  ): Promise<AdaptiveAnswerResponse> {
    const res = await fetch(`${API_BASE}/assessment/adaptive/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: sessionToken,
        question_id: questionId,
        answer,
        session_id: sessionId,
        user_id: userId,
      }),
    });
    if (!res.ok) throw new Error(`Adaptive answer failed: ${res.status}`);
    return res.json();
  }

  // ── Phase 2 — Level Quiz ────────────────────────────────────────────────────

  async getLevelQuestions(profile: string, lang = 'fr'): Promise<any> {
    const res = await fetch(`${API_BASE}/level/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, lang }),
    });
    if (!res.ok) throw new Error(`Level questions failed: ${res.status}`);
    return res.json();
  }

  async evaluateLevel(
    profile: string,
    questions: any[],
    answers: Record<string, string>,
    sessionId: string,
    userId = 'anonymous',
    lang = 'fr',
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/level/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        questions,
        answers,
        session_id: sessionId,
        user_id: userId,
        lang,
      }),
    });
    if (!res.ok) throw new Error(`Level evaluate failed: ${res.status}`);
    return res.json();
  }

  // ── Phase 3 — Roadmap Generation (NDJSON streaming) ─────────────────────────

  async generateRoadmap(
    params: {
      profile: string;
      niveau: string;
      profileData: any;
      levelData: any;
      sessionId: string;
      userId?: string;
      lang?: string;
    },
    callbacks: GenerateRoadmapCallbacks = {},
  ): Promise<ParsedRoadmap | null> {
    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: params.profile,
        niveau: params.niveau,
        profile_data: params.profileData,
        level_data: params.levelData,
        session_id: params.sessionId,
        user_id: params.userId ?? 'anonymous',
        lang: params.lang ?? 'fr',
      }),
    });

    if (!res.ok) throw new Error(`Roadmap generate failed: ${res.status}`);

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let finalRoadmap: ParsedRoadmap | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.status === 'roadmap_meta' && callbacks.onMeta) {
            callbacks.onMeta(chunk.meta);
          } else if (chunk.status === 'phase' && callbacks.onPhase) {
            callbacks.onPhase(chunk.phase, chunk.phase_number, chunk.total_phases);
          } else if (chunk.status === 'completed') {
            finalRoadmap = chunk.roadmap;
            if (callbacks.onComplete && chunk.roadmap) {
              callbacks.onComplete(chunk.roadmap);
            }
          } else if (chunk.status === 'error' && callbacks.onError) {
            callbacks.onError(chunk.error);
          }
        } catch {
          // Skip malformed NDJSON lines
        }
      }
    }

    return finalRoadmap;
  }

  // ── Progress Tracking ───────────────────────────────────────────────────────

  async getProgress(userId: string): Promise<ProgressResponse> {
    const res = await fetch(`${API_BASE}/progress/${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`Get progress failed: ${res.status}`);
    return res.json();
  }

  async recordProgress(
    userId: string,
    sessionId: string,
    profile: string,
    niveau: string,
    scores: Record<string, number>,
  ): Promise<void> {
    await fetch(`${API_BASE}/progress/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        session_id: sessionId,
        profile,
        niveau,
        scores,
      }),
    });
  }

  // ── Cert Status (Change 9) ──────────────────────────────────────────────────

  async updateCertStatus(
    userId: string,
    certCode: string,
    status: CertStatus,
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/cert/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, cert_code: certCode, status }),
    });
    if (!res.ok) throw new Error(`Cert update failed: ${res.status}`);
    return res.json();
  }

  async getCertProgress(
    userId: string,
  ): Promise<{ completed_certs: string[]; cert_status: Record<string, CertStatus> }> {
    const res = await fetch(`${API_BASE}/cert/progress/${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`Cert progress failed: ${res.status}`);
    return res.json();
  }

  // ── Coach Agent (Change 11) ─────────────────────────────────────────────────

  async coachChat(
    sessionId: string,
    userId: string,
    message: string,
    roadmapContext?: string,
  ): Promise<{ reply: string; session_id: string }> {
    const res = await fetch(`${API_BASE}/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId,
        message,
        roadmap_context: roadmapContext,
      }),
    });
    if (!res.ok) throw new Error(`Coach chat failed: ${res.status}`);
    return res.json();
  }

  async clearCoachHistory(sessionId: string): Promise<void> {
    await fetch(`${API_BASE}/coach/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  // ── Multi-turn Roadmap Negotiation ──────────────────────────────────────────

  async negotiateRoadmap(
    sessionId: string,
    userId: string,
    message: string,
    currentRoadmap: any,
    profileData: any,
    levelData: any,
  ): Promise<NegotiationResponse> {
    const res = await fetch(`${API_BASE}/negotiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId,
        message,
        current_roadmap: currentRoadmap,
        profile_data: profileData,
        level_data: levelData,
      }),
    });
    if (!res.ok) throw new Error(`Negotiate failed: ${res.status}`);
    return res.json();
  }

  async clearNegotiationHistory(sessionId: string): Promise<void> {
    await fetch(`${API_BASE}/negotiate/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  // ── Save / Load Roadmaps ────────────────────────────────────────────────────

  async saveRoadmap(
    userId: string,
    sessionId: string,
    roadmap: any,
    profile: string,
    niveau: string,
  ): Promise<{ saved_id: string; timestamp: string }> {
    const res = await fetch(`${API_BASE}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        session_id: sessionId,
        roadmap,
        profile,
        niveau,
      }),
    });
    if (!res.ok) throw new Error(`Save roadmap failed: ${res.status}`);
    return res.json();
  }

  async getSavedRoadmaps(userId: string): Promise<SavedRoadmapsResponse> {
    const res = await fetch(`${API_BASE}/saved/${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`Get saved roadmaps failed: ${res.status}`);
    return res.json();
  }

  // ── Session Management ──────────────────────────────────────────────────────

  async endSession(userId: string, sessionId: string): Promise<void> {
    await fetch(`${API_BASE}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, session_id: sessionId }),
    });
  }
}

const aiAgentService = new AiAgentService();
export default aiAgentService;
