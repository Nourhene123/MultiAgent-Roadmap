// @ts-nocheck
/**
 * QuizNiv.tsx — Level assessment quiz component
 */

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import aiAgentService from '../services/ai-agent.service';

const QUESTION_TIME = 60; // seconds per question

// Compute live level estimate from running correct/total points
function estimateLevel(earned: number, total: number): { label: string; color: string; pct: number } {
  const pct = total > 0 ? (earned / total) * 100 : 0;
  if (pct < 20)  return { label: 'Débutant',       color: '#6B7280', pct };
  if (pct < 45)  return { label: 'Débutant+',      color: '#3B82F6', pct };
  if (pct < 65)  return { label: 'Intermédiaire',  color: '#F59E0B', pct };
  if (pct < 80)  return { label: 'Intermédiaire+', color: '#8B5CF6', pct };
  return           { label: 'Expert',              color: '#10B981', pct };
}

// Icons
const TrophyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
    <path d="M4 22h16"/>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const XIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

const LoaderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LevelData {
  niveau: string;
  score: {
    obtenu: number;
    total: number;
    pourcentage: number;
  };
  analyse: string;
  feedback: string;
  recommendations: string[];
}

interface Question {
  id: number;
  question: string;
  options: Record<string, string>;
  bonne_reponse: string;
  explication?: string;
  difficulte?: string;
  points?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  profile: string;
  profileData: any;
  onLevelComplete: (level: LevelData, answers: any[]) => void;
  userId: string;
  sessionId: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function QuizNiv({ open, onClose, profile, profileData, onLevelComplete, userId, sessionId }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  // Timer
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchCalledRef = useRef(false);
  // Live level tracking
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);

  // Reset guard when modal opens/profile changes
  useEffect(() => {
    if (open) {
      fetchCalledRef.current = false;
      setEarnedPoints(0);
      setTotalPoints(0);
    }
  }, [open, profile]);

  // Fetch questions — guarded against StrictMode double-invoke
  useEffect(() => {
    if (!open) return;
    if (fetchCalledRef.current) return;
    fetchCalledRef.current = true;
    fetchQuestions();
  }, [open, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer: reset + start on each new question; stop once answered
  useEffect(() => {
    if (!questions.length || evaluation || isLoading) return;
    setTimeLeft(QUESTION_TIME);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Time's up — force a wrong submission
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [currentIndex, questions.length, evaluation, isLoading]);

  const fetchQuestions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await aiAgentService.getLevelQuestions(profile, 'fr');
      setQuestions(response.questions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load questions');
      // Fallback questions
      setQuestions([
        {
          id: 1,
          question: "Quelle est la différence principale entre IaaS, PaaS et SaaS ?",
          options: {
            A: "IaaS = Infrastructure, PaaS = Plateforme, SaaS = Logiciel",
            B: "Ce sont tous des services de stockage",
            C: "IaaS est uniquement pour les bases de données",
            D: "Il n'y a pas de différence significative"
          },
          bonne_reponse: "A"
        },
        {
          id: 2,
          question: "Quel service Azure utilisez-vous pour déployer des conteneurs Docker ?",
          options: {
            A: "Azure Functions",
            B: "Azure Container Instances",
            C: "Azure Blob Storage",
            D: "Azure DevOps"
          },
          bonne_reponse: "B"
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimeUp = () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion || evaluation) return;
    // Treat time-out as a wrong answer with no selection
    const pts = currentQuestion.points ?? 1;
    setTotalPoints(p => p + pts);
    setEvaluation({
      est_correct: false,
      bonne_reponse: currentQuestion.bonne_reponse,
      feedback: `⏱ Temps écoulé ! La bonne réponse était ${currentQuestion.bonne_reponse}. ${currentQuestion.explication || ''}`,
      timeout: true,
    });
    setAnswers(prev => [...prev, {
      question_id: currentQuestion.id,
      question: currentQuestion.question,
      answer: '',
      correct: false,
    }]);
  };

  const submitAnswer = async () => {
    if (!selectedAnswer || !questions[currentIndex]) return;
    clearInterval(timerRef.current!);

    setIsEvaluating(true);
    const currentQuestion = questions[currentIndex];

    try {
      const isCorrect = selectedAnswer === currentQuestion.bonne_reponse;
      const pts = currentQuestion.points ?? 1;
      setTotalPoints(p => p + pts);
      if (isCorrect) setEarnedPoints(p => p + pts);

      setEvaluation({
        est_correct: isCorrect,
        bonne_reponse: currentQuestion.bonne_reponse,
        feedback: currentQuestion.explication
          || (isCorrect ? 'Bonne réponse !' : `La bonne réponse est ${currentQuestion.bonne_reponse}`),
      });

      setAnswers(prev => [...prev, {
        question_id: currentQuestion.id,
        question: currentQuestion.question,
        answer: selectedAnswer,
        correct: isCorrect,
      }]);
    } finally {
      setIsEvaluating(false);
    }
  };

  const nextQuestion = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setEvaluation(null);
    } else {
      // Quiz complete - evaluate level
      await finishQuiz();
    }
  };

  const finishQuiz = async () => {
    setIsLoading(true);
    try {
      // Build answer map {question_id: letter} for the backend
      const answersMap: Record<string, string> = {};
      answers.forEach(a => { answersMap[String(a.question_id)] = a.answer; });

      // Call backend — uses 5-band scoring with difficulty weights
      const result = await aiAgentService.evaluateLevel(
        profile as any,
        questions,
        answersMap,
        sessionId,
        userId,
      );

      const levelData: LevelData = {
        niveau:          result.niveau,
        score:           result.score,
        analyse:         result.analyse,
        feedback:        result.analyse,
        recommendations: result.recommendations,
      };

      onLevelComplete(levelData, answers);
    } catch (err: any) {
      // Fallback to local scoring if backend unavailable
      const correct = answers.filter(a => a.correct).length;
      const pct     = answers.length > 0 ? Math.round((correct / answers.length) * 100) : 0;
      const niveau  = pct < 20 ? 'Débutant'
                    : pct < 45 ? 'Débutant+'
                    : pct < 65 ? 'Intermédiaire'
                    : pct < 80 ? 'Intermédiaire+'
                    : 'Expert';
      onLevelComplete({
        niveau,
        score: { obtenu: correct, total: answers.length, pourcentage: pct },
        analyse: `Niveau local: ${niveau} (${pct}%)`,
        feedback: `Score: ${pct}%`,
        recommendations: [],
      }, answers);
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + (evaluation ? 1 : 0)) / questions.length) * 100 : 0;

  const optionColors = [
    'linear-gradient(135deg, #e0e7ff, #c7d2fe)',
    'linear-gradient(135deg, #f3e8ff, #e9d5ff)',
    'linear-gradient(135deg, #ffedd5, #fed7aa)',
    'linear-gradient(135deg, #ffe4e6, #fecdd3)',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      {(() => {
        const timerPct = (timeLeft / QUESTION_TIME) * 100;
        const timerColor = timeLeft > 30 ? '#10B981' : timeLeft > 15 ? '#F59E0B' : '#EF4444';
        const diff = currentQuestion?.difficulte;
        const diffLabel = diff === 'difficile' ? '🔴 Difficile' : diff === 'moyen' ? '🟡 Moyen' : '🟢 Facile';
        const diffColor = diff === 'difficile' ? 'rgba(239,68,68,0.2)' : diff === 'moyen' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)';
        const live = estimateLevel(earnedPoints, totalPoints);
        const circumference = 2 * Math.PI * 14; // r=14
        return (
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid rgba(123,47,190,0.1)',
            background: 'linear-gradient(135deg, #E91E8C, #7B2FBE)',
            color: 'white',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Left: title + difficulty badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrophyIcon />
                <span style={{ fontSize: 15, fontWeight: 700 }}>Test de Niveau</span>
                {currentQuestion && !isLoading && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: diffColor, letterSpacing: '0.04em' }}>
                    {diffLabel}
                  </span>
                )}
              </div>
              {/* Right: timer ring + close */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {currentQuestion && !evaluation && !isLoading && (
                  <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3"/>
                    <circle cx="18" cy="18" r="14" fill="none" stroke={timerColor} strokeWidth="3"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - timerPct / 100)}
                      style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                    />
                    <text x="18" y="18" textAnchor="middle" dominantBaseline="central"
                      style={{ transform: 'rotate(90deg)', transformOrigin: '18px 18px', fill: 'white', fontSize: '9px', fontWeight: 700 }}>
                      {timeLeft}s
                    </text>
                  </svg>
                )}
                <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                  <XIcon />
                </button>
              </div>
            </div>

            {/* Live level meter */}
            {totalPoints > 0 && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, opacity: 0.8, flexShrink: 0 }}>Niveau estimé :</span>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${live.pct}%`, background: live.color, borderRadius: 999, transition: 'width 0.5s ease' }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{live.label}</span>
              </div>
            )}
            <p style={{ fontSize: 11, marginTop: 4, opacity: 0.75 }}>
              Profil : {profile} • Question {currentIndex + 1} / {questions.length}
            </p>
          </div>
        );
      })()}

      {/* Progress bar */}
      <div style={{ height: 4, background: '#f0f0f0' }}>
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #E91E8C, #7B2FBE)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {isLoading && !currentQuestion ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
            <LoaderIcon />
            <p style={{ fontSize: 14, color: '#666' }}>Chargement du quiz...</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: '#ef4444', marginBottom: 16 }}>{error}</p>
            <button
              onClick={fetchQuestions}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #E91E8C, #7B2FBE)',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Réessayer
            </button>
          </div>
        ) : currentQuestion ? (
          <div>

            {/* Question text */}
            <p style={{ 
              fontSize: 16, 
              fontWeight: 600, 
              color: '#1A1230', 
              marginBottom: 20,
              lineHeight: 1.5 
            }}>
              {currentQuestion.question}
            </p>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(currentQuestion.options).map(([letter, text], idx) => {
                const isSelected = selectedAnswer === letter;
                const isSubmitted = !!evaluation;
                const isCorrect = evaluation?.bonne_reponse === letter;
                const isWrong = isSubmitted && isSelected && !evaluation?.est_correct;

                return (
                  <button
                    key={letter}
                    onClick={() => !isSubmitted && setSelectedAnswer(letter)}
                    disabled={isSubmitted}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: isCorrect 
                        ? '2px solid #10B981'
                        : isWrong 
                        ? '2px solid #ef4444'
                        : isSelected 
                        ? '2px solid #7B2FBE'
                        : '2px solid transparent',
                      background: isCorrect 
                        ? '#d1fae5'
                        : isWrong 
                        ? '#fee2e2'
                        : isSelected 
                        ? '#f3e8ff'
                        : optionColors[idx % 4],
                      cursor: isSubmitted ? 'default' : 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        background: isCorrect 
                          ? '#10B981'
                          : isWrong 
                          ? '#ef4444'
                          : isSelected 
                          ? '#7B2FBE'
                          : 'white',
                        color: isCorrect || isWrong || isSelected ? 'white' : '#666',
                        flexShrink: 0,
                      }}
                    >
                      {isCorrect ? <CheckIcon /> : isWrong ? <XIcon /> : letter}
                    </span>
                    <span style={{ 
                      fontSize: 14, 
                      fontWeight: 500,
                      color: isCorrect ? '#065f46' : isWrong ? '#991b1b' : '#1A1230'
                    }}>
                      {text}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Feedback */}
            {evaluation && (
              <div style={{
                marginTop: 20, padding: 16, borderRadius: 12,
                background: evaluation.est_correct ? '#d1fae5' : evaluation.timeout ? '#fee2e2' : '#fef3c7',
                border: `1px solid ${evaluation.est_correct ? '#10B981' : evaluation.timeout ? '#EF4444' : '#f59e0b'}`,
              }}>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8,
                  color: evaluation.est_correct ? '#065f46' : evaluation.timeout ? '#991b1b' : '#92400e' }}>
                  {evaluation.est_correct ? '✅ Correct !' : evaluation.timeout ? '⏱ Temps écoulé !' : '💡 Réponse incorrecte'}
                </p>
                <p style={{ fontSize: 13, color: '#555' }}>{evaluation.feedback}</p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid rgba(123,47,190,0.1)',
        background: '#f8f6ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <button
          onClick={onClose}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Passer
        </button>

        {!evaluation ? (
          <button
            onClick={submitAnswer}
            disabled={!selectedAnswer || isEvaluating}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              background: !selectedAnswer || isEvaluating ? '#ccc' : 'linear-gradient(135deg, #E91E8C, #7B2FBE)',
              border: 'none',
              color: 'white',
              cursor: !selectedAnswer || isEvaluating ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {isEvaluating ? (
              <>
                <LoaderIcon />
                Évaluation...
              </>
            ) : (
              <>
                Valider
                <ChevronRightIcon />
              </>
            )}
          </button>
        ) : (
          <button
            onClick={nextQuestion}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              background: currentIndex === questions.length - 1 
                ? 'linear-gradient(135deg, #10B981, #059669)'
                : 'linear-gradient(135deg, #E91E8C, #7B2FBE)',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {currentIndex === questions.length - 1 ? (
              <>
                <TrophyIcon />
                Voir mon score
              </>
            ) : (
              <>
                Suivant
                <ChevronRightIcon />
              </>
            )}
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 0.7s linear infinite; }
      `}</style>
    </div>
  );
}
