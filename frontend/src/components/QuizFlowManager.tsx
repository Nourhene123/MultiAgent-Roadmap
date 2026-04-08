// @ts-nocheck
/**
 * QuizFlowManager.tsx — Orchestrates the full Assessment → Quiz → Roadmap flow.
 *
 * Phases:
 *   mode-select → pick Classic (12 questions) or Adaptive (6-10 CAT questions)
 *   assessment  → AssessmentModal (classic)
 *   adaptive    → inline CAT loop (one question at a time via API)
 *   quiz        → QuizNiv (level assessment, 10 questions)
 *   generating  → spinner while LangGraph + multi-agents run
 *   done        → RoadmapView
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import AssessmentModal, { ProfileData } from './AssessmentModal';
import QuizNiv, { LevelData } from './QuizNiv';
import RoadmapView from './RoadmapView';
import aiAgentService, { AdaptiveQuestion, AdaptiveAnswerResponse, RoadmapPhase } from '../services/ai-agent.service';

// ─── Icons ────────────────────────────────────────────────────────────────────

const SparklesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const LoaderIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </svg>
);

const BoltIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const ListIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
);

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowPhase = 'mode-select' | 'assessment' | 'adaptive' | 'quiz' | 'generating' | 'done';
type AssessmentMode = 'classic' | 'adaptive';

export interface CertificationItem {
  ordre: number; nom: string; code?: string;
  provider: 'Microsoft' | 'AWS' | 'CompTIA' | 'ISC2' | 'Google';
  niveau_certif: 'Fondamental' | 'Associé' | 'Expert' | 'Professionnel' | 'Spécialité';
  duree_preparation_semaines: number; heures_etude: number;
  prerequis: string[]; pourquoi_cette_certif: string; competences_acquises: string[];
  statut: 'current' | 'upcoming' | 'locked'; xp_reward: number;
}

export interface RoadmapPhase {
  phase_number: number; phase_name: string; phase_description: string;
  duration_weeks: number; level_tier?: string; certifications: CertificationItem[];
}

export interface ParsedRoadmap {
  roadmap_title: string; roadmap_summary: string; total_estimated_weeks: number;
  total_certifications: number; user_level?: string; phases: RoadmapPhase[]; conseil_final: string;
}

interface Props { open: boolean; onClose: () => void; userId: string; sessionId: string; }

// ─── Domain colour map ────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  cloud: '#3B82F6', cyber: '#EF4444', ai: '#8B5CF6', iot: '#10B981',
};
const DOMAIN_LABELS: Record<string, string> = {
  cloud: 'Cloud', cyber: 'Cyber', ai: 'IA', iot: 'IoT',
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 50,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    background: 'rgba(10,6,25,0.55)', backdropFilter: 'blur(16px)',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  modal: {
    background: '#FFFFFF', borderRadius: 20,
    boxShadow: '0 24px 60px rgba(123,47,190,0.2)',
    width: '100%', maxWidth: 600, maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  modalLarge: { maxWidth: 720, height: '88vh' },
  header: {
    padding: '20px 24px 16px', borderBottom: '1px solid rgba(123,47,190,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  body: { padding: 28, flex: 1, overflowY: 'auto' },
  generating: {
    padding: '48px 32px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 20, textAlign: 'center',
  },
  spinnerBox: {
    width: 70, height: 70, borderRadius: 20,
    background: 'linear-gradient(135deg,rgba(233,30,140,0.1),rgba(123,47,190,0.12))',
    border: '1px solid rgba(123,47,190,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modeCard: {
    padding: '20px 24px', borderRadius: 16, cursor: 'pointer',
    border: '2px solid rgba(123,47,190,0.15)',
    background: 'rgba(123,47,190,0.03)',
    transition: 'all 0.2s', marginBottom: 14,
    display: 'flex', alignItems: 'flex-start', gap: 16,
  },
  modeCardHover: {
    border: '2px solid rgba(123,47,190,0.5)',
    background: 'rgba(123,47,190,0.07)',
    transform: 'translateY(-2px)',
    boxShadow: '0 6px 24px rgba(123,47,190,0.15)',
  },
  primaryBtn: {
    padding: '12px 28px', borderRadius: 12,
    background: 'linear-gradient(135deg,#E91E8C,#7B2FBE)',
    border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  optionBtn: (selected: boolean): React.CSSProperties => ({
    width: '100%', padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
    textAlign: 'left', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
    background: selected ? 'rgba(123,47,190,0.1)' : 'rgba(123,47,190,0.03)',
    border: selected ? '2px solid #7B2FBE' : '2px solid rgba(123,47,190,0.12)',
    color: selected ? '#5B21B6' : '#374151',
    marginBottom: 8,
  }),
};

// ─── Mode Selection Screen ────────────────────────────────────────────────────

function ModeSelect({ onSelect, onClose }: { onSelect: (m: AssessmentMode) => void; onClose: () => void }) {
  const [hovered, setHovered] = useState<AssessmentMode | null>(null);
  return (
    <>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1230' }}>Choisir le mode d'évaluation</div>
          <div style={{ fontSize: 12, color: '#B0A8C8', marginTop: 2 }}>Les deux modes détectent votre profil précisément</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0A8C8', fontSize: 20 }}>✕</button>
      </div>
      <div style={S.body}>
        {/* Adaptive card */}
        <div
          style={{ ...S.modeCard, ...(hovered === 'adaptive' ? S.modeCardHover : {}) }}
          onMouseEnter={() => setHovered('adaptive')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onSelect('adaptive')}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#E91E8C22,#7B2FBE22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BoltIcon />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#1A1230', fontSize: 15, marginBottom: 4 }}>
              Évaluation Adaptative <span style={{ background: 'linear-gradient(90deg,#E91E8C,#7B2FBE)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: 11, fontWeight: 800, marginLeft: 6 }}>NOUVEAU ✨</span>
            </div>
            <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
              6 à 10 questions sélectionnées dynamiquement par l'IA selon vos réponses.
              S'arrête dès que votre profil est clair — plus rapide et plus précis.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {['⚡ 3-5 min', '🎯 Adaptatif', '🤖 Propulsé par IA'].map(t => (
                <span key={t} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(123,47,190,0.08)', color: '#7B2FBE', fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Classic card */}
        <div
          style={{ ...S.modeCard, ...(hovered === 'classic' ? S.modeCardHover : {}) }}
          onMouseEnter={() => setHovered('classic')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onSelect('classic')}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ListIcon />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#1A1230', fontSize: 15, marginBottom: 4 }}>Évaluation Classique</div>
            <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
              40 questions couvrant les 4 domaines (Cloud, Cyber, IA, IoT).
              Mélange préférences + connaissances pour une détection précise.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {['📋 40 questions', '⏱ 8-12 min', '🌐 4 domaines'].map(t => (
                <span key={t} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.08)', color: '#6366F1', fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Adaptive Quiz Screen ─────────────────────────────────────────────────────

function AdaptiveQuiz({
  sessionId, userId, onComplete, onClose,
}: {
  sessionId: string; userId: string;
  onComplete: (profile: string, profileData: any) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string>('');
  const [question, setQuestion] = useState<AdaptiveQuestion | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [answered, setAnswered] = useState(0);
  const [partialScores, setPartialScores] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    aiAgentService.startAdaptiveAssessment().then(res => {
      setToken(res.session_token);
      setQuestion(res.question);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selected || !question) return;
    setSubmitting(true);
    try {
      const res: AdaptiveAnswerResponse = await aiAgentService.submitAdaptiveAnswer(
        token, question.id, selected, sessionId, userId,
      );
      setAnswered(res.questions_answered);

      if (res.done && res.result) {
        // Assessment complete — build a minimal ProfileResult-like object
        const r = res.result;
        onComplete(r.primary_profile, {
          primary_profile: r.primary_profile,
          secondary_profile: r.secondary_profile,
          scores: r.scores,
          strengths: [],
          weaknesses: [],
          recommended_first_certification: 'AZ-900',
          summary: `Profil ${r.primary_profile} détecté en ${r.questions_answered} questions (mode adaptatif).`,
          certification_path: [],
          hybrid: r.secondary_profile,
          summary_fr: `Profil adaptatif: ${r.primary_profile}`,
        });
      } else {
        setQuestion(res.question || null);
        setPartialScores(res.partial_scores || {});
        setSelected('');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [selected, question, token, sessionId, userId, onComplete]);

  if (loading) return (
    <div style={{ ...S.generating, gap: 16 }}>
      <LoaderIcon size={32} />
      <span style={{ color: '#B0A8C8', fontSize: 13 }}>Initialisation du test adaptatif…</span>
      <style>{`.animate-spin{animation:spin 0.7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ ...S.generating, gap: 16 }}>
      <div style={{ fontSize: 13, color: '#EF4444' }}>{error}</div>
      <button onClick={onClose} style={S.primaryBtn}>Fermer</button>
    </div>
  );

  if (!question) return null;

  const diffColor = { easy: '#10B981', medium: '#F59E0B', hard: '#EF4444' }[question.difficulty] || '#888';
  const domainColor = DOMAIN_COLORS[question.domain] || '#7B2FBE';

  return (
    <>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1230' }}>Évaluation Adaptative</div>
          <div style={{ fontSize: 12, color: '#B0A8C8', marginTop: 2 }}>
            Question {answered + 1} · Domaine: <span style={{ color: domainColor, fontWeight: 700 }}>{DOMAIN_LABELS[question.domain]}</span>
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0A8C8', fontSize: 20 }}>✕</button>
      </div>

      <div style={S.body}>
        {/* Partial scores bar */}
        {Object.keys(partialScores).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#B0A8C8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Scores en cours</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(partialScores).map(([d, v]) => (
                <div key={d} style={{ flex: 1, minWidth: 60 }}>
                  <div style={{ fontSize: 10, color: DOMAIN_COLORS[d] || '#888', fontWeight: 700, marginBottom: 3 }}>{DOMAIN_LABELS[d] || d}</div>
                  <div style={{ height: 6, borderRadius: 4, background: '#F3F4F6' }}>
                    <div style={{ height: '100%', borderRadius: 4, width: `${v}%`, background: DOMAIN_COLORS[d] || '#888', transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{v}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Difficulty badge */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, background: `${diffColor}20`, color: diffColor, fontWeight: 700 }}>
            {question.difficulty === 'easy' ? 'Facile' : question.difficulty === 'medium' ? 'Moyen' : 'Difficile'}
          </span>
        </div>

        {/* Question */}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1230', lineHeight: 1.6, marginBottom: 20 }}>
          {question.question}
        </div>

        {/* Options */}
        {Object.entries(question.options).map(([letter, text]) => (
          <button key={letter} style={S.optionBtn(selected === letter)} onClick={() => setSelected(letter)}>
            <span style={{ fontWeight: 700, marginRight: 10, color: selected === letter ? '#7B2FBE' : '#9CA3AF' }}>{letter}.</span>
            {text}
          </button>
        ))}

        <button
          onClick={handleSubmit}
          disabled={!selected || submitting}
          style={{
            ...S.primaryBtn, marginTop: 16, width: '100%',
            opacity: !selected || submitting ? 0.6 : 1,
            cursor: !selected || submitting ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {submitting ? <><LoaderIcon size={16} /> Analyse…</> : 'Répondre →'}
        </button>
      </div>
      <style>{`.animate-spin{animation:spin 0.7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuizFlowManager({ open, onClose, userId, sessionId }: Props) {
  const [phase, setPhase] = useState<FlowPhase>('mode-select');
  const [profile, setProfile] = useState<string>('cloud');
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [levelData, setLevelData] = useState<LevelData | null>(null);
  const [parsedRoadmap, setParsedRoadmap] = useState<ParsedRoadmap | null>(null);
  const [generatingStatus, setGeneratingStatus] = useState<'searching' | 'reasoning' | 'streaming' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPhase('mode-select');
      setProfile('cloud');
      setProfileData(null);
      setLevelData(null);
      setParsedRoadmap(null);
      setGeneratingStatus(null);
      setError(null);
      setIsLoading(false);
    }
  }, [open]);

  // ── Assessment complete (both classic and adaptive) ───────────────────────
  const handleAssessmentComplete = useCallback((detectedProfile: string, detectedProfileData: ProfileData) => {
    setProfile(detectedProfile);
    setProfileData(detectedProfileData);
    setPhase('quiz');
  }, []);

  // ── Level quiz complete → Phase 3 ─────────────────────────────────────────
  const handleLevelComplete = useCallback(async (evaluatedLevel: LevelData) => {
    setLevelData(evaluatedLevel);
    setPhase('generating');
    setGeneratingStatus('searching');
    setIsLoading(true);
    setError(null);

    // refs for phase accumulation inside async callbacks
    const accPhases = { current: [] as RoadmapPhase[] };
    const roadmapMeta = { current: null as any };

    try {
      setTimeout(() => setGeneratingStatus('reasoning'), 1500);

      const profileResult = {
        primary_profile: profile,
        secondary_profile: profileData?.hybrid || null,
        scores: profileData?.scores || { cloud: 0, cyber: 0, ai: 0, iot: 0 },
        strengths: profileData?.strengths || [],
        weaknesses: [],
        recommended_first_certification: profileData?.recommended_first_certification || 'AZ-900',
        summary: profileData?.summary_fr || '',
        certification_path: [],
      };

      const levelEvaluation = {
        niveau: evaluatedLevel.niveau,
        score: {
          obtenu: evaluatedLevel.score?.obtenu || 0,
          total: evaluatedLevel.score?.total || 1,
          pourcentage: evaluatedLevel.score?.pourcentage || 0,
        },
        analyse: `Niveau: ${evaluatedLevel.niveau}`,
        questions_detail: [],
        recommendations: [],
      };

      const roadmap = await aiAgentService.generateRoadmap(
        {
          profile,
          niveau: evaluatedLevel.niveau,
          profileData: profileResult,
          levelData: levelEvaluation,
          sessionId,
          userId,
          lang: 'fr',
        },
        {
          // Change 10 — meta arrives before phases
          onMeta: (meta) => {
            roadmapMeta.current = meta;
            setGeneratingStatus('streaming');
          },
          // Change 10 — each phase arrives one by one → progressive reveal
          onPhase: (phase, phaseNumber, totalPhases) => {
            accPhases.current = [...accPhases.current, phase];
            // Switch to 'done' view as soon as first phase arrives
            if (roadmapMeta.current && accPhases.current.length >= 1) {
              const partial: ParsedRoadmap = {
                roadmap_title:          roadmapMeta.current.roadmap_title,
                roadmap_summary:        roadmapMeta.current.roadmap_summary,
                total_estimated_weeks:  roadmapMeta.current.total_estimated_weeks,
                total_certifications:   roadmapMeta.current.total_certifications,
                user_level:             roadmapMeta.current.user_level,
                conseil_final:          roadmapMeta.current.conseil_final,
                phases:                 [...accPhases.current],
              };
              setParsedRoadmap(partial);
              setPhase('done');
            }
          },
        },
      );

      // Final: replace with fully validated roadmap
      setParsedRoadmap(roadmap);
      setPhase('done');
    } catch (err: any) {
      console.error('Roadmap generation error:', err);
      setError(err.message || 'Échec de la génération du roadmap');
      setPhase('generating'); // keep generating view to show error
    } finally {
      setIsLoading(false);
      setGeneratingStatus(null);
    }
  }, [profile, profileData, sessionId, userId]);

  if (!open) return null;
  const isLargeModal = phase === 'done' && parsedRoadmap;

  const generatingSteps = [
    { label: 'Analyse du profil et du niveau', done: true, active: false },
    { label: 'Analyse narrative (agent profil)', done: generatingStatus === 'reasoning' || generatingStatus === 'streaming', active: generatingStatus === 'searching' },
    { label: 'Diagnostic d\'apprentissage (agent niveau)', done: generatingStatus === 'streaming', active: generatingStatus === 'reasoning' },
    { label: 'Génération + révision du roadmap (IA)', done: false, active: generatingStatus === 'streaming' },
  ];

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, ...(isLargeModal ? S.modalLarge : {}) }}>

        {/* Mode selection */}
        {phase === 'mode-select' && (
          <ModeSelect
            onSelect={(mode) => setPhase(mode === 'adaptive' ? 'adaptive' : 'assessment')}
            onClose={onClose}
          />
        )}

        {/* Classic Assessment */}
        {phase === 'assessment' && (
          <AssessmentModal
            open={true}
            onClose={onClose}
            onAssessmentComplete={handleAssessmentComplete}
            userId={userId}
            sessionId={sessionId}
          />
        )}

        {/* Adaptive Assessment */}
        {phase === 'adaptive' && (
          <AdaptiveQuiz
            sessionId={sessionId}
            userId={userId}
            onComplete={handleAssessmentComplete}
            onClose={onClose}
          />
        )}

        {/* Level Quiz */}
        {phase === 'quiz' && profileData && (
          <QuizNiv
            open={true}
            onClose={onClose}
            profile={profile}
            profileData={profileData}
            onLevelComplete={handleLevelComplete}
            userId={userId}
            sessionId={sessionId}
          />
        )}

        {/* Generating */}
        {phase === 'generating' && (
          <div style={S.generating}>
            {error ? (
              <>
                <div style={{ color: '#ef4444', fontSize: 40 }}>⚠️</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1230' }}>Erreur de génération</div>
                <div style={{ fontSize: 13, color: '#B0A8C8' }}>{error}</div>
                <button onClick={onClose} style={S.primaryBtn}>Fermer</button>
              </>
            ) : (
              <>
                <div style={S.spinnerBox}><SparklesIcon /></div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1230', marginBottom: 6 }}>Génération de votre roadmap…</div>
                  <div style={{ fontSize: 13, color: '#B0A8C8', lineHeight: 1.6 }}>
                    3 agents IA travaillent en parallèle<br />pour personnaliser votre parcours
                  </div>
                </div>
                <div style={{ width: '100%', maxWidth: 360 }}>
                  {generatingSteps.map(({ label, done, active }, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', borderRadius: 10, marginBottom: 6, transition: 'all 0.3s ease',
                      ...(done
                        ? { background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }
                        : active
                        ? { background: 'rgba(123,47,190,0.08)', border: '1px solid rgba(123,47,190,0.3)', transform: 'scale(1.02)' }
                        : { background: 'rgba(123,47,190,0.04)', border: '1px solid rgba(123,47,190,0.1)', opacity: 0.6 }),
                    }}>
                      <div style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {done ? <CheckCircleIcon /> : active ? <LoaderIcon size={18} /> : <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#B0A8C8' }} />}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: active || done ? 600 : 500, color: done ? '#059669' : active ? '#E91E8C' : '#7B2FBE', opacity: done || active ? 1 : 0.6 }}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Done: error state */}
        {phase === 'done' && error && (
          <div style={S.generating}>
            <div style={{ color: '#ef4444', fontSize: 40 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1230' }}>Erreur de génération</div>
            <div style={{ fontSize: 13, color: '#B0A8C8' }}>{error}</div>
            <button onClick={onClose} style={S.primaryBtn}>Fermer</button>
          </div>
        )}

        {/* Done: Roadmap */}
        {phase === 'done' && parsedRoadmap && !error && (
          <RoadmapView
            roadmap={parsedRoadmap}
            profile={profile}
            levelData={levelData}
            profileData={profileData as any}
            onClose={onClose}
            userId={userId}
            sessionId={sessionId}
          />
        )}
      </div>
      <style>{`.animate-spin{animation:spin 0.7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
