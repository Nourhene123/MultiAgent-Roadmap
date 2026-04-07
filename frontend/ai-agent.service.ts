/**
 * ai-agent.service.ts — API client for Quiz-Based Assessment & Roadmap Agent
 *
 * Every mutating call (submitAssessment, evaluateLevel, generateRoadmap)
 * sends the session_id so the backend can update LangGraph state correctly.
 */

const API_BASE_URL = 'http://localhost:8002';

// ─── Domain Types ─────────────────────────────────────────────────────────────

export type Profile = 'cloud' | 'cyber' | 'ai' | 'iot';
export type Level   = 'Débutant' | 'Débutant+' | 'Intermédiaire' | 'Intermédiaire+' | 'Expert';

// ─── Assessment Types ─────────────────────────────────────────────────────────

export interface AssessmentQuestion {
  id: number;
  domain: Profile;
  question: string;
  options: Record<string, string>;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface AssessmentQuestionsResponse {
  questions: AssessmentQuestion[];
  total_questions: number;
  domains: Profile[];
  instructions: string;
  source: 'llm' | 'static';
}

export interface ProfileScores {
  cloud: number;
  cyber: number;
  ai: number;
  iot: number;
}

export interface ProfileResult {
  primary_profile: Profile;
  secondary_profile: Profile | null;
  scores: ProfileScores;
  strengths: string[];
  weaknesses: string[];
  recommended_first_certification: string;
  summary: string;
  certification_path: string[];
}

// ─── Level Quiz Types ─────────────────────────────────────────────────────────

export interface LevelQuestion {
  id: number;
  question: string;
  options: Record<string, string>;
  bonne_reponse: string;
  explication: string;
  difficulte: 'facile' | 'moyen' | 'difficile';
  points: number;
}

export interface LevelQuestionsResponse {
  profile: Profile;
  questions: LevelQuestion[];
  total_questions: number;
}

export interface LevelEvaluation {
  niveau: Level;
  score: {
    obtenu: number;
    total: number;
    pourcentage: number;
  };
  analyse: string;
  questions_detail: {
    id: string;
    correct: boolean;
    reponse_apprenant: string;
    bonne_reponse: string;
    explication: string;
  }[];
  recommendations: string[];
}

// ─── Roadmap Types ────────────────────────────────────────────────────────────

// ─── Adaptive Assessment Types ────────────────────────────────────────────────

export interface AdaptiveQuestion {
  id: number;
  domain: Profile;
  question: string;
  options: Record<string, string>;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface AdaptiveStartResponse {
  session_token: string;
  question: AdaptiveQuestion;
  questions_answered: number;
  done: false;
}

export interface AdaptiveAnswerResponse {
  done: boolean;
  questions_answered: number;
  question?: AdaptiveQuestion;
  partial_scores?: Record<Profile, number>;
  result?: {
    primary_profile: Profile;
    secondary_profile: Profile | null;
    scores: Record<Profile, number>;
    questions_answered: number;
    method: 'adaptive';
  };
}

// ─── NEW: Enhanced Assessment Types ───────────────────────────────────────────

export interface SkillGap {
  domain: Profile;
  current_score: number;
  target_score: number;
  gap_percentage: number;
  priority_level: 'critique' | 'important' | 'optionnel' | 'maîtrisé';
  missing_concepts: string[];
  recommended_resources: { title: string; url: string; type: 'free' | 'paid' | 'freemium' }[];
  key_skills_to_acquire: string[];
  estimated_hours_to_bridge: number;
}

export interface LearningPath {
  critical_gaps_count: number;
  important_gaps_count: number;
  total_hours_needed: number;
  recommended_weeks: number;
  priority_domains: string[];
  immediate_actions: string[];
}

export interface BenchmarkComparison {
  domain: Profile;
  percentile: number;
  user_score: number;
  mean_score: number;
  median_score: number;
  comparison_group: string;
  interpretation: string;
}

export interface ConfidenceMetrics {
  avg_confidence: number;
  high_confidence_wrong: number;
  low_confidence_right: number;
  calibration_score: number;
}

export interface SkillGapResponse {
  profile: Profile;
  scores: Record<Profile, number>;
  skill_gaps: SkillGap[];
  learning_path: LearningPath;
}

export interface BenchmarkResponse {
  user_id: string;
  has_data: boolean;
  profile: Profile;
  scores: Record<Profile, number>;
  benchmarks: BenchmarkComparison[];
  trend: {
    has_trend: boolean;
    message?: string;
    assessments_count?: number;
    domain_improvements?: Record<Profile, number>;
    best_improvement_domain?: string;
    best_improvement_points?: number;
  };
  total_sessions: number;
}

export interface EnhancedProfileResult extends ProfileResult {
  skill_gap_analysis?: {
    gaps: SkillGap[];
    learning_path: LearningPath;
  };
  benchmarking?: {
    comparisons: BenchmarkComparison[];
    trend: BenchmarkResponse['trend'];
  };
  confidence_analysis?: {
    raw_scores: Record<Profile, number>;
    confidence_metrics: ConfidenceMetrics;
  };
}

// ─── Progress Types ───────────────────────────────────────────────────────────

export interface ProgressSession {
  timestamp: string;
  profile: Profile;
  niveau: Level;
  scores: Record<Profile, number>;
}

export interface ProgressResponse {
  user_id: string;
  total_sessions: number;
  latest: ProgressSession | null;
  trend: Record<Profile, number>;
  sessions: ProgressSession[];
}

export interface RoadmapRequest {
  profile: Profile;
  niveau: Level;
  profile_data: ProfileResult;
  level_data: LevelEvaluation;
  session_id: string;
  user_id?: string;
  lang?: string;
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
}

export interface RoadmapPhase {
  phase_number: number;
  phase_name: string;
  phase_description: string;
  duration_weeks: number;
  level_tier?: string;
  certifications: CertificationItem[];
}

export interface RoadmapResponse {
  roadmap_title: string;
  roadmap_summary: string;
  total_estimated_weeks: number;
  total_certifications: number;
  user_level?: string;
  phases: RoadmapPhase[];
  conseil_final: string;
}

// ─── Negotiation Types ────────────────────────────────────────────────────────

export interface NegotiationResponse {
  reply: string;
  changes_made: string[];
  updated_roadmap: RoadmapResponse;
}

export interface SavedRoadmapMeta {
  saved_id: string;
  user_id: string;
  session_id: string;
  timestamp: string;
  profile: string;
  niveau: string;
  roadmap_title: string;
  total_weeks: number;
  total_certs: number;
  roadmap: RoadmapResponse;
}

export interface SavedRoadmapsResponse {
  user_id: string;
  total: number;
  roadmaps: SavedRoadmapMeta[];
}

// ─── Cert Progress Types ──────────────────────────────────────────────────────

export type CertStatus = 'completed' | 'in_progress' | 'skipped';

export interface CertProgressResponse {
  completed_certs: string[];
  cert_status: Record<string, CertStatus>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class AIAgentService {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { detail?: unknown };
      const detail = error.detail;
      // FastAPI detail can be a string, object, or array (e.g. 422 validation errors)
      const message =
        typeof detail === 'string'
          ? detail
          : detail != null
          ? JSON.stringify(detail)
          : `HTTP ${response.status}`;
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }

  // ── Phase 1: Assessment ────────────────────────────────────────────────────

  async getAssessmentQuestions(lang = 'fr', sessionId = '', useStatic = false): Promise<AssessmentQuestionsResponse> {
    return this.request('/api/roadmap/assessment/questions', {
      method: 'POST',
      body: JSON.stringify({ lang, session_id: sessionId, use_static: useStatic }),
    });
  }

  async submitAssessment(
    answers: Record<string, string>,
    sessionId: string,
    userId = 'anonymous',
    lang = 'fr',
  ): Promise<ProfileResult> {
    return this.request('/api/roadmap/assessment/submit', {
      method: 'POST',
      body: JSON.stringify({ answers, session_id: sessionId, user_id: userId, lang }),
    });
  }

  // ── NEW: Enhanced Assessment Features ──────────────────────────────────────

  async submitAssessmentWithConfidence(
    answers: Record<string, string>,
    confidenceMap: Record<string, number>,
    sessionId: string,
    userId = 'anonymous',
    lang = 'fr',
  ): Promise<EnhancedProfileResult> {
    // Format answers as "A:4" where 4 is confidence level
    const answersWithConfidence: Record<string, string> = {};
    for (const [qid, answer] of Object.entries(answers)) {
      const conf = confidenceMap[qid] ?? 3;
      answersWithConfidence[qid] = `${answer}:${conf}`;
    }

    return this.request('/api/roadmap/assessment/submit', {
      method: 'POST',
      body: JSON.stringify({ 
        answers: answersWithConfidence, 
        session_id: sessionId, 
        user_id: userId, 
        lang 
      }),
    });
  }

  async getSkillGapAnalysis(
    answers: Record<string, string>,
    sessionId: string,
    userId = 'anonymous',
    lang = 'fr',
  ): Promise<SkillGapResponse> {
    return this.request('/api/roadmap/assessment/skill-gaps', {
      method: 'POST',
      body: JSON.stringify({ answers, session_id: sessionId, user_id: userId, lang }),
    });
  }

  async getBenchmarks(userId: string): Promise<BenchmarkResponse> {
    return this.request(`/api/roadmap/benchmark/${encodeURIComponent(userId)}`);
  }

  async getDynamicQuestions(profile: Profile, lang = 'fr'): Promise<AssessmentQuestionsResponse> {
    return this.request('/api/roadmap/assessment/dynamic-questions', {
      method: 'POST',
      body: JSON.stringify({ profile, lang }),
    });
  }

  // ── Phase 2: Level Quiz ────────────────────────────────────────────────────

  async getLevelQuestions(profile: Profile, lang = 'fr'): Promise<LevelQuestionsResponse> {
    return this.request('/api/roadmap/level/questions', {
      method: 'POST',
      body: JSON.stringify({ profile, lang }),
    });
  }

  async evaluateLevel(
    profile: Profile,
    questions: LevelQuestion[],
    answers: Record<string, string>,
    sessionId: string,
    userId = 'anonymous',
    lang = 'fr',
  ): Promise<LevelEvaluation> {
    return this.request('/api/roadmap/level/evaluate', {
      method: 'POST',
      body: JSON.stringify({ profile, questions, answers, session_id: sessionId, user_id: userId, lang }),
    });
  }

  // ── Phase 3: Roadmap Generation ────────────────────────────────────────────

  /**
   * Generate a roadmap and stream results progressively.
   *
   * Change 10: onPhase is called for each phase as it arrives so the UI can
   * render cards one by one. onMeta is called with header data before phases.
   * Returns the full RoadmapResponse when the stream is complete.
   */
  async generateRoadmap(
    params: RoadmapRequest,
    callbacks?: {
      onMeta?: (meta: Omit<RoadmapResponse, 'phases'> & { total_phases: number }) => void;
      onPhase?: (phase: RoadmapPhase, phaseNumber: number, totalPhases: number) => void;
    },
  ): Promise<RoadmapResponse> {
    const response = await fetch(`${this.baseUrl}/api/roadmap/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { detail?: unknown };
      const detail = error.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : detail != null
          ? JSON.stringify(detail)
          : `HTTP ${response.status}`;
      throw new Error(message);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let roadmapData: RoadmapResponse | null = null;
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as {
            status: string;
            roadmap?: RoadmapResponse;
            meta?: Omit<RoadmapResponse, 'phases'> & { total_phases: number };
            phase?: RoadmapPhase;
            phase_number?: number;
            total_phases?: number;
            error?: string;
          };

          if (parsed.status === 'error') {
            throw new Error(parsed.error || 'Roadmap generation failed');
          }
          if (parsed.status === 'roadmap_meta' && parsed.meta && callbacks?.onMeta) {
            callbacks.onMeta(parsed.meta);
          }
          if (parsed.status === 'phase' && parsed.phase && callbacks?.onPhase) {
            callbacks.onPhase(parsed.phase, parsed.phase_number ?? 0, parsed.total_phases ?? 0);
          }
          if (parsed.status === 'completed' && parsed.roadmap) {
            roadmapData = parsed.roadmap;
          }
        } catch (e) {
          if ((e as Error).message !== 'Roadmap generation failed') continue;
          throw e;
        }
      }
    }

    if (!roadmapData) throw new Error('No roadmap data received from server');
    return roadmapData;
  }

  // ── Adaptive Assessment (Sprint 2) ────────────────────────────────────────

  async startAdaptiveAssessment(lang = 'fr'): Promise<AdaptiveStartResponse> {
    return this.request('/api/roadmap/assessment/adaptive/start', {
      method: 'POST',
      body: JSON.stringify({ lang }),
    });
  }

  async submitAdaptiveAnswer(
    sessionToken: string,
    questionId: number,
    answer: string,
    sessionId: string,
    userId = 'anonymous',
  ): Promise<AdaptiveAnswerResponse> {
    return this.request('/api/roadmap/assessment/adaptive/answer', {
      method: 'POST',
      body: JSON.stringify({
        session_token: sessionToken,
        question_id: questionId,
        answer,
        session_id: sessionId,
        user_id: userId,
      }),
    });
  }

  // ── Progress Tracking (Sprint 2) ──────────────────────────────────────────

  async getProgress(userId: string): Promise<ProgressResponse> {
    return this.request(`/api/roadmap/progress/${encodeURIComponent(userId)}`);
  }

  // ── Coach Agent (Change 11) ───────────────────────────────────────────────

  async coachChat(
    sessionId: string,
    userId: string,
    message: string,
    roadmapContext?: string,
  ): Promise<{ reply: string; session_id: string }> {
    return this.request('/api/roadmap/coach', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId,
        message,
        roadmap_context: roadmapContext ?? null,
      }),
    });
  }

  // ── Multi-turn Roadmap Negotiation ───────────────────────────────────────

  async negotiateRoadmap(
    sessionId: string,
    userId: string,
    message: string,
    currentRoadmap: RoadmapResponse,
    profileData: ProfileResult,
    levelData: LevelEvaluation,
  ): Promise<NegotiationResponse> {
    return this.request('/api/roadmap/negotiate', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId,
        message,
        current_roadmap: currentRoadmap,
        profile_data: profileData,
        level_data: levelData,
      }),
    });
  }

  async clearNegotiationHistory(sessionId: string): Promise<{ status: string }> {
    return this.request(`/api/roadmap/negotiate/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  async saveRoadmap(
    userId: string,
    sessionId: string,
    roadmap: RoadmapResponse,
    profile: string,
    niveau: string,
  ): Promise<{ saved_id: string; timestamp: string }> {
    return this.request('/api/roadmap/save', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, session_id: sessionId, roadmap, profile, niveau }),
    });
  }

  async getSavedRoadmaps(userId: string): Promise<SavedRoadmapsResponse> {
    return this.request(`/api/roadmap/saved/${encodeURIComponent(userId)}`);
  }

  async coachClearHistory(sessionId: string): Promise<{ status: string }> {
    return this.request(`/api/roadmap/coach/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  }

  // ── Cert Progress (Change 9) ──────────────────────────────────────────────

  async updateCertStatus(userId: string, certCode: string, status: CertStatus): Promise<{ status: string; cert_code: string; new_status: CertStatus }> {
    return this.request('/api/roadmap/cert/update', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, cert_code: certCode, status }),
    });
  }

  async getCertProgress(userId: string): Promise<CertProgressResponse> {
    return this.request(`/api/roadmap/cert/progress/${encodeURIComponent(userId)}`);
  }

  // ── Health ────────────────────────────────────────────────────────────────

  async checkHealth(): Promise<{ status: string; version: string; domains: string[]; features: string[] }> {
    return this.request('/api/roadmap/health');
  }
}

const aiAgentService = new AIAgentService();
export default aiAgentService;
