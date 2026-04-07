// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import aiAgentService, { ProfileResult } from './ai-agent.service';

// ─── Simple Icon Components (inline SVG) ─────────────────────────────────────

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const BrainIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
  </svg>
);

const CloudIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
  </svg>
);

const ShieldIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
  </svg>
);

const LoaderIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
    <line x1="12" y1="2" x2="12" y2="6"/>
    <line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="2" y1="12" x2="6" y2="12"/>
    <line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

const StarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/>
    <polyline points="12 19 5 12 12 5"/>
  </svg>
);

const XCircleIcon = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
);

// ─── Quiz Options Sub-component ───────────────────────────────────────────────
// Extracted to avoid hooks-in-loop error

interface QuizOptionsProps {
  q: AssessQuestion;
  currentIndex: number;
  showConfidenceSlider: boolean;
  pct: number;
  questionSource: QuestionSource;
  handleAnswer: (label: string) => void;
  currentQuestionId: number;
}

function QuizOptions({ q, currentIndex, showConfidenceSlider, pct, questionSource, handleAnswer }: QuizOptionsProps) {
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  
  return (
    <div style={{ padding: 28 }}>
      {/* Progress bar with shimmer */}
      <div style={{ 
        height: 8, 
        background: 'linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)', 
        backgroundSize: '200% 100%',
        borderRadius: 999, 
        overflow: 'hidden', 
        marginBottom: 24,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
      }}>
        <div style={{ 
          height: '100%', 
          borderRadius: 999, 
          transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #c4b5fd 0%, #a78bfa 30%, #8b5cf6 60%, #7c3aed 100%)',
          backgroundSize: '200% 100%',
          boxShadow: '0 0 10px rgba(139,92,246,0.3)',
        }} />
      </div>
      
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        marginBottom: 16,
      }}>
        <p style={{ 
          fontSize: 13, 
          fontWeight: 600, 
          color: '#8b5cf6', 
          textTransform: 'uppercase', 
          letterSpacing: '0.05em',
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#8b5cf6',
            animation: 'pulse 2s infinite',
          }} />
          Question {currentIndex + 1}
        </p>
        {questionSource === 'llm' && (
          <span style={{ 
            fontSize: 11, 
            padding: '4px 12px', 
            borderRadius: 999, 
            background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(167,139,250,0.15))',
            color: '#7c3aed', 
            fontWeight: 600,
            border: '1px solid rgba(139,92,246,0.2)',
          }}>
            ✨ IA
          </span>
        )}
      </div>
      
      <p style={{ 
        fontSize: 17, 
        fontWeight: 600, 
        color: '#1f2937', 
        marginBottom: 24, 
        lineHeight: 1.6,
        letterSpacing: '-0.01em',
      }}>
        {q.question}
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(q.options).map(([label, text], index) => {
          const isHovered = hoveredOption === label;
          return (
            <button
              key={label}
              onClick={() => handleAnswer(label)}
              disabled={showConfidenceSlider}
              onMouseEnter={() => setHoveredOption(label)}
              onMouseLeave={() => setHoveredOption(null)}
              style={{ 
                width: '100%', 
                textAlign: 'left', 
                padding: '16px 20px', 
                borderRadius: 16, 
                border: `2px solid ${isHovered ? '#c4b5fd' : '#f3f4f6'}`,
                background: isHovered ? 'linear-gradient(135deg, #f5f3ff, #ede9fe)' : 'white',
                cursor: showConfidenceSlider ? 'not-allowed' : 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 14, 
                fontSize: 15, 
                transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                opacity: showConfidenceSlider ? 0.3 : 1,
                transform: isHovered && !showConfidenceSlider ? 'translateX(4px)' : 'translateX(0)',
                boxShadow: isHovered ? '0 4px 12px rgba(139,92,246,0.1)' : '0 1px 3px rgba(0,0,0,0.02)',
                animation: `slideInRight 0.4s ease-out ${index * 0.08}s forwards`,
              }}
            >
              <span style={{ 
                width: 32, 
                height: 32, 
                borderRadius: 10, 
                background: isHovered ? '#8b5cf6' : '#f3f4f6', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: 13, 
                fontWeight: 700, 
                color: isHovered ? 'white' : '#6b7280',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}>
                {label}
              </span>
              <span style={{ color: '#374151', lineHeight: 1.5, fontWeight: 500 }}>{text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'quiz' | 'analyzing' | 'profile' | 'error';
type QuestionSource = 'llm' | 'static' | null;

interface AssessQuestion {
  id: number;
  question: string;
  options: Record<string, string>;
  domain_mapping: Record<string, string>; // { A: 'cloud', B: 'cyber', C: 'ai' }
}

export interface ProfileData {
  profile: string;
  confidence: number;
  scores: { cloud: number; cyber: number; ai: number; iot: number };
  hybrid: string | null;
  summary_fr: string;
  summary_en: string;
  strengths: string[];
  recommended_first_certification: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAssessmentComplete: (profile: string, profileData: ProfileData, enhancedData?: any) => void;
  userId?: string;
  sessionId?: string;
  enableConfidence?: boolean;
  enableSkillGaps?: boolean;
}

// ─── Profile meta ─────────────────────────────────────────────────────────────

const PROFILE_META: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string; bar: string }> = {
  cloud: { icon: <CloudIcon />, label: 'Cloud & DevOps', color: '#2563EB', bg: 'rgba(37,99,235,0.08)', bar: '#3B82F6' },
  cyber: { icon: <ShieldIcon />, label: 'Cybersécurité', color: '#DC2626', bg: 'rgba(220,38,38,0.08)', bar: '#EF4444' },
  ai:    { icon: <BrainIcon />, label: 'Intelligence Artificielle', color: '#7C3AED', bg: 'rgba(124,58,237,0.08)', bar: '#8B5CF6' },
  iot:   { icon: <span style={{fontSize:20}}>📡</span>, label: 'IoT & Systèmes Embarqués', color: '#059669', bg: 'rgba(5,150,105,0.08)', bar: '#10B981' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AssessmentModal({ 
  open, 
  onClose, 
  onAssessmentComplete, 
  userId: propUserId, 
  sessionId: propSessionId,
  enableConfidence = false,  // confidence slider UI not implemented — keep false
  enableSkillGaps = true
}: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<AssessQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [enhancedData, setEnhancedData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [questionSource, setQuestionSource] = useState<QuestionSource>(null);
  const [showConfidenceSlider, setShowConfidenceSlider] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const [showFallbackOption, setShowFallbackOption] = useState(false);

  const userId = propUserId || (typeof window !== 'undefined' ? localStorage.getItem('user_id') || 'anonymous' : 'anonymous');
  const sessionId = propSessionId || `assess_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Fetch questions on open
  useEffect(() => {
    if (open) {
      setPhase('loading');
      setQuestions([]);
      setCurrentIndex(0);
      setAnswers({});
      setProfileData(null);
      setErrorMsg('');
      fetchQuestions();
    }
  }, [open]);

  const fetchQuestions = async () => {
    setShowFallbackOption(false);
    
    // Longer timeout for LLM generation (15 seconds)
    const timeoutId = setTimeout(() => {
      if (phase === 'loading') {
        console.log('[AssessmentModal] API timeout - offering fallback');
        setShowFallbackOption(true);
      }
    }, 15000);

    try {
      // Classic mode always uses the static 40-question bank — instant, no LLM wait
      const data = await aiAgentService.getAssessmentQuestions('fr', sessionId, true);
      clearTimeout(timeoutId);
      const qs = data.questions || [];
      if (qs.length === 0) throw new Error('Aucune question reçue');
      setQuestions(qs);
      setQuestionSource(data.source ?? 'static');
      setPhase('quiz');
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('[AssessmentModal] fetch error:', err);
      useFallbackQuestions();
    }
  };

  const useFallbackQuestions = () => {
    setQuestions([
      {
        id: 1,
        question: "Quelle technologie vous intéresse le plus ?",
        options: { A: "Déployer des applications sur le cloud", B: "Sécuriser des systèmes et réseaux", C: "Créer des modèles d'intelligence artificielle", D: "Connecter des appareils et objets" }
      },
      {
        id: 2,
        question: "Quel est votre rôle actuel ou souhaité ?",
        options: { A: "DevOps / Cloud Engineer", B: "Analyste en sécurité / SOC", C: "Data Scientist / ML Engineer", D: "Ingénieur IoT / Embedded" }
      },
      {
        id: 3,
        question: "Quelle certification vous attire le plus ?",
        options: { A: "Azure/AWS Solutions Architect", B: "Certified Ethical Hacker / CISSP", C: "TensorFlow / Azure AI Engineer", D: "AWS IoT / Azure IoT Developer" }
      },
      {
        id: 4,
        question: "Quelle tâche préférez-vous ?",
        options: { A: "Automatiser des infrastructures", B: "Auditer des vulnérabilités", C: "Entraîner des modèles ML", D: "Programmer des microcontrôleurs" }
      }
    ]);
    setQuestionSource('static');
    setPhase('quiz');
  };

  const handleAnswer = (label: string) => {
    if (enableConfidence && !showConfidenceSlider) {
      // First click - show confidence slider
      setPendingAnswer(label);
      setShowConfidenceSlider(true);
      return;
    }

    // Second click (or if confidence disabled) - submit with confidence
    const qid = String(questions[currentIndex].id);
    const finalConfidence = enableConfidence ? (confidence[qid] ?? 3) : 3;
    
    const newAnswers = { ...answers, [qid]: label };
    const newConfidence = { ...confidence, [qid]: finalConfidence };
    
    setAnswers(newAnswers);
    setConfidence(newConfidence);
    setShowConfidenceSlider(false);
    setPendingAnswer(null);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      analyzeProfile(newAnswers, newConfidence);
    }
  };

  const handleConfidenceSelect = (level: number) => {
    const qid = String(questions[currentIndex].id);
    setConfidence({ ...confidence, [qid]: level });
    
    // Auto-advance after selecting confidence
    if (pendingAnswer) {
      setTimeout(() => {
        handleAnswer(pendingAnswer);
      }, 200);
    }
  };

  const analyzeProfile = async (finalAnswers: Record<string, string>, finalConfidence: Record<string, number>) => {
    setPhase('analyzing');

    try {
      // Call API with enhanced analysis
      let result;
      if (enableConfidence) {
        result = await aiAgentService.submitAssessmentWithConfidence(
          finalAnswers, finalConfidence, sessionId, userId, 'fr'
        );
      } else {
        result = await aiAgentService.submitAssessment(finalAnswers, sessionId, userId, 'fr');
      }
      
      setEnhancedData(result);
      
      // Transform API result to ProfileData format
      const profileData: ProfileData = {
        profile: result.primary_profile,
        confidence: result.scores[result.primary_profile] / 100,
        scores: result.scores,
        hybrid: result.secondary_profile,
        summary_fr: result.summary,
        summary_en: `${result.primary_profile} profile detected`,
        strengths: result.strengths,
        recommended_first_certification: result.recommended_first_certification,
      };

      setProfileData(profileData);
      setPhase('profile');
    } catch (err) {
      console.error('[AssessmentModal] analyze error:', err);
      // Fallback to regular submit
      try {
        const result = await aiAgentService.submitAssessment(finalAnswers, sessionId, userId, 'fr');
        const profileData: ProfileData = {
          profile: result.primary_profile,
          confidence: result.scores[result.primary_profile] / 100,
          scores: result.scores,
          hybrid: result.secondary_profile,
          summary_fr: result.summary,
          summary_en: `${result.primary_profile} profile detected`,
          strengths: result.strengths,
          recommended_first_certification: result.recommended_first_certification,
        };
        setProfileData(profileData);
        setPhase('profile');
      } catch (fallbackErr) {
        // Final fallback
        handleFallbackProfile(finalAnswers);
      }
    }
  };

  const handleFallbackProfile = (finalAnswers: Record<string, string>) => {
    // Simple fallback scoring based on answer pattern
    const scores = { cloud: 0, cyber: 0, ai: 0, iot: 0 };

    questions.forEach((q) => {
      const answer = finalAnswers[String(q.id)];
      if (answer === 'A') scores.cloud += 10;
      if (answer === 'B') scores.cyber += 10;
      if (answer === 'C') scores.ai += 10;
      if (answer === 'D') scores.iot += 10;
    });

    // Normalize to percentages
    const total = scores.cloud + scores.cyber + scores.ai + scores.iot;
    const normalizedScores = {
      cloud: total > 0 ? Math.round((scores.cloud / total) * 100) : 25,
      cyber: total > 0 ? Math.round((scores.cyber / total) * 100) : 25,
      ai:    total > 0 ? Math.round((scores.ai   / total) * 100) : 25,
      iot:   total > 0 ? Math.round((scores.iot  / total) * 100) : 25,
    };

    const entries = Object.entries(normalizedScores).sort((a, b) => b[1] - a[1]);
    const dominantProfile = entries[0][0] as 'cloud' | 'cyber' | 'ai' | 'iot';
    const certMap: Record<string, string> = { cloud: 'AZ-900', cyber: 'SC-900', ai: 'AI-900', iot: 'AZ-220' };

    const safeData: ProfileData = {
      profile: dominantProfile,
      confidence: entries[0][1] / 100,
      scores: normalizedScores,
      hybrid: entries[1][1] > 25 ? entries[1][0] : null,
      summary_fr: `Profil ${PROFILE_META[dominantProfile]?.label ?? dominantProfile} détecté avec ${entries[0][1]}%`,
      summary_en: `${dominantProfile} profile detected`,
      strengths: ['Motivation', 'Intérêt technique'],
      recommended_first_certification: certMap[dominantProfile] ?? 'AZ-900',
    };

    setProfileData(safeData);
    setPhase('profile');
  };

  if (!open) return null;

  const q = questions[currentIndex];
  const meta = profileData ? PROFILE_META[profileData.profile] : null;
  const pct = questions.length > 0 ? Math.round((currentIndex / questions.length) * 100) : 0;

  // Soft glassmorphism styles
  const glassCard = {
    background: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.6)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.5) inset',
  };

  const progressBarGradient = {
    background: 'linear-gradient(90deg, #c4b5fd 0%, #a78bfa 50%, #8b5cf6 100%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 2s ease-in-out infinite',
  };

  return (
    <div style={{ 
      position: 'fixed', 
      inset: 0, 
      zIndex: 50, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '16px',
      background: 'rgba(139, 92, 246, 0.15)',
      backdropFilter: 'blur(8px)',
      animation: 'fadeIn 0.3s ease-out',
    }}>
      <div style={{ 
        ...glassCard,
        borderRadius: 24, 
        width: '100%', 
        maxWidth: 520, 
        height: 'auto',
        maxHeight: '90vh',
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        animation: 'scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '20px 24px', 
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.05) 0%, rgba(167,139,250,0.02) 100%)',
        }}>
          <div>
            <p style={{ 
              fontWeight: 700, 
              color: '#1f2937', 
              fontSize: 15,
              letterSpacing: '-0.01em',
            }}>Détection de profil</p>
            <p style={{ 
              fontSize: 13, 
              color: '#8b5cf6', 
              marginTop: 4,
              fontWeight: 500,
            }}>
              {phase === 'loading' && 'Génération des questions...'}
              {phase === 'quiz' && `Question ${currentIndex + 1} / ${questions.length}`}
              {phase === 'analyzing' && 'Analyse de votre profil...'}
              {phase === 'profile' && 'Profil détecté ✨'}
              {phase === 'error' && 'Erreur'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              width: 36, 
              height: 36, 
              borderRadius: '50%', 
              background: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(0,0,0,0.08)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer', 
              color: '#6b7280',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(139,92,246,0.1)';
              (e.target as HTMLButtonElement).style.color = '#8b5cf6';
              (e.target as HTMLButtonElement).style.transform = 'rotate(90deg)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.8)';
              (e.target as HTMLButtonElement).style.color = '#6b7280';
              (e.target as HTMLButtonElement).style.transform = 'rotate(0deg)';
            }}
          >
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          
          {/* Loading / Analyzing */}
          {(phase === 'loading' || phase === 'analyzing') && (
            <div style={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: 24, 
              padding: 48,
            }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'pulse 2s ease-in-out infinite',
              }}>
                <LoaderIcon style={{ width: 32, height: 32, color: '#8b5cf6' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ 
                  color: '#4b5563', 
                  fontSize: 15, 
                  fontWeight: 600, 
                  marginBottom: 8,
                }}>
                  {phase === 'loading' ? 'Chargement des questions...' : 'Analyse de votre profil en cours...'}
                </p>
                {phase === 'loading' && (
                  <p style={{ color: '#9ca3af', fontSize: 13, maxWidth: 280, lineHeight: 1.5 }}>
                    40 questions couvrant Cloud, Cyber, IA et IoT
                  </p>
                )}
              </div>
              
              {/* Animated dots */}
              <div style={{ display: 'flex', gap: 6 }}>
                {[0, 1, 2].map((i) => (
                  <span 
                    key={i}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#c4b5fd',
                      animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
                    }}
                  />
                ))}
              </div>

              {/* Fallback option button */}
              {phase === 'loading' && showFallbackOption && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>
                    Le chargement prend plus de temps que prévu...
                  </p>
                  <button
                    onClick={() => {
                      useFallbackQuestions();
                      setShowFallbackOption(false);
                    }}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 12,
                      background: 'rgba(139,92,246,0.1)',
                      border: '1px solid #c4b5fd',
                      color: '#7c3aed',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLButtonElement).style.background = 'rgba(139,92,246,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLButtonElement).style.background = 'rgba(139,92,246,0.1)';
                    }}
                  >
                    Utiliser les questions rapides ⚡
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quiz */}
          {phase === 'quiz' && q && (
            <QuizOptions 
              q={q}
              currentIndex={currentIndex}
              showConfidenceSlider={showConfidenceSlider}
              pct={pct}
              questionSource={questionSource}
              handleAnswer={handleAnswer}
              currentQuestionId={questions[currentIndex]?.id}
            />
          )}

          {/* Profile Result */}
          {phase === 'profile' && profileData && meta && (
            <div style={{ padding: 24 }}>
              <div style={{ borderRadius: 16, padding: 20, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, background: meta.bg }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color }}>
                  {meta.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>Profil détecté</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: meta.color }}>{meta.label}</p>
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Confiance : {Math.round(profileData.confidence * 100)}%</p>
                </div>
              </div>

              {/* Score bars — all 4 domains */}
              <div style={{ marginBottom: 20 }}>
                {(['cloud', 'cyber', 'ai', 'iot'] as const).map((key) => {
                  const m = PROFILE_META[key];
                  const score = (profileData.scores as any)[key] ?? 0;
                  return (
                    <div key={key} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                        <span>{m.label}</span>
                        <span style={{ fontWeight: 600 }}>{score}%</span>
                      </div>
                      <div style={{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: m.bar, borderRadius: 999, transition: 'width 0.5s ease', width: `${score}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6, marginBottom: 16 }}>{profileData.summary_fr}</p>

              {profileData.strengths?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Points forts</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {profileData.strengths.map((s, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 12px', background: '#f3f4f6', color: '#374151', borderRadius: 999 }}>
                        <StarIcon /> {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Skill Gaps Section */}
              {enableSkillGaps && enhancedData?.skill_gap_analysis?.gaps?.length > 0 && (
                <div style={{ marginBottom: 16, background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 12, padding: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                    📚 Parcours de développement recommandé
                  </p>
                  
                  {/* Priority Actions */}
                  {enhancedData.skill_gap_analysis.learning_path?.immediate_actions?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      {enhancedData.skill_gap_analysis.learning_path.immediate_actions.slice(0, 2).map((action: string, i: number) => (
                        <div key={i} style={{ fontSize: 13, color: '#78350f', marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <span style={{ color: '#f59e0b' }}>▸</span>
                          {action}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Time Estimate */}
                  {enhancedData.skill_gap_analysis.learning_path?.total_hours_needed > 0 && (
                    <div style={{ fontSize: 12, color: '#92400e', background: 'rgba(255,255,255,0.5)', padding: '8px 12px', borderRadius: 8 }}>
                      <strong>⏱️ {enhancedData.skill_gap_analysis.learning_path.total_hours_needed}h</strong> d'étude recommandées
                      {enhancedData.skill_gap_analysis.learning_path.recommended_weeks > 0 && (
                        <span> sur <strong>{enhancedData.skill_gap_analysis.learning_path.recommended_weeks} semaines</strong></span>
                      )}
                    </div>
                  )}

                  {/* Critical Gaps Detail */}
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ fontSize: 12, color: '#92400e', cursor: 'pointer', fontWeight: 600 }}>
                      Voir les compétences à développer
                    </summary>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {enhancedData.skill_gap_analysis.gaps
                        .filter((g: any) => g.priority_level !== 'maîtrisé')
                        .slice(0, 3)
                        .map((gap: any, i: number) => (
                          <div key={i} style={{ background: 'white', padding: 12, borderRadius: 8, fontSize: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, color: '#78350f', textTransform: 'capitalize' }}>{gap.domain}</span>
                              <span style={{ 
                                padding: '2px 8px', 
                                borderRadius: 999, 
                                fontSize: 10,
                                fontWeight: 700,
                                background: gap.priority_level === 'critique' ? '#fecaca' : gap.priority_level === 'important' ? '#fde68a' : '#e5e7eb',
                                color: gap.priority_level === 'critique' ? '#991b1b' : gap.priority_level === 'important' ? '#92400e' : '#374151'
                              }}>
                                {gap.priority_level}
                              </span>
                            </div>
                            <div style={{ color: '#6b7280', marginBottom: 4 }}>
                              Score: {gap.current_score}% → Objectif: {gap.target_score}%
                            </div>
                            <div style={{ color: '#92400e' }}>
                              {gap.key_skills_to_acquire?.[0]}
                            </div>
                          </div>
                        ))}
                    </div>
                  </details>
                </div>
              )}

              {/* Confidence Calibration (if available) */}
              {enhancedData?.confidence_analysis?.confidence_metrics && (
                <div style={{ marginBottom: 16, background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 12, padding: 12 }}>
                  <p style={{ fontSize: 11, color: '#1e40af', fontWeight: 600 }}>
                    🎯 Confiance moyenne: {enhancedData.confidence_analysis.confidence_metrics.avg_confidence.toFixed(1)}/5
                  </p>
                </div>
              )}

              {profileData.recommended_first_certification && (
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#374151' }}>
                  <span style={{ fontWeight: 600 }}>1ère certification : </span>
                  {profileData.recommended_first_certification}
                </div>
              )}

              <button 
                onClick={() => onAssessmentComplete(profileData.profile, profileData, enhancedData)} 
                style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'linear-gradient(135deg, #7C3AED, #2563EB)', border: 'none', color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}
              >
                Commencer le test de niveau
                <ChevronRightIcon />
              </button>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <XCircleIcon />
              <p style={{ color: '#374151', fontWeight: 500, textAlign: 'center' }}>{errorMsg}</p>
              <button onClick={fetchQuestions} style={{ padding: '10px 20px', borderRadius: 12, background: '#7C3AED', color: 'white', fontSize: 14, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                Réessayer
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } .animate-spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
