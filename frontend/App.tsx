import React, { useState, useMemo } from 'react'
import QuizFlowManager from './QuizFlowManager'
import ProgressDashboard from './ProgressDashboard'
import CoachChat from './CoachChat'

// Persist userId across page reloads so progress is tracked correctly.
function getOrCreateUserId(): string {
  const stored = localStorage.getItem('subul_user_id')
  if (stored) return stored
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  localStorage.setItem('subul_user_id', id)
  return id
}

function getNewSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// Animated background blobs
function BackgroundBlobs() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 0,
    }}>
      {/* Soft purple blob */}
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0) 70%)',
        top: '-200px',
        left: '-100px',
        animation: 'float 8s ease-in-out infinite',
      }} />
      {/* Soft blue blob */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0) 70%)',
        bottom: '-150px',
        right: '-100px',
        animation: 'float 10s ease-in-out infinite reverse',
      }} />
      {/* Soft pink blob */}
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(236,72,153,0.1) 0%, rgba(236,72,153,0) 70%)',
        top: '40%',
        left: '60%',
        animation: 'float 12s ease-in-out infinite',
        animationDelay: '2s',
      }} />
    </div>
  )
}

// Animated domain badge
function DomainBadge({ icon, label, color, delay }: { icon: string; label: string; color: string; delay: number }) {
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <span
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '10px 20px',
        borderRadius: 999,
        background: isHovered 
          ? `linear-gradient(135deg, ${color}20, ${color}40)`
          : 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${isHovered ? color + '60' : 'rgba(255,255,255,0.4)'}`,
        color: isHovered ? color : '#4b5563',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'default',
        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: isHovered ? 'translateY(-3px) scale(1.05)' : 'translateY(0)',
        boxShadow: isHovered 
          ? `0 8px 24px ${color}30`
          : '0 2px 8px rgba(0,0,0,0.04)',
        animation: `slideUp 0.5s ease-out ${delay}ms forwards`,
        opacity: 0,
      }}
    >
      <span style={{ marginRight: 6 }}>{icon}</span>
      {label}
    </span>
  )
}

// Primary CTA button with soft glow
function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false) }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      style={{
        padding: '18px 48px',
        fontSize: 17,
        fontWeight: 600,
        borderRadius: 20,
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
        boxShadow: isHovered 
          ? '0 12px 40px rgba(139,92,246,0.4)'
          : '0 4px 20px rgba(139,92,246,0.25)',
        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: isPressed ? 'scale(0.96)' : isHovered ? 'translateY(-3px) scale(1.02)' : 'scale(1)',
        position: 'relative',
        overflow: 'hidden',
        animation: 'slideUp 0.6s ease-out 0.4s forwards',
        opacity: 0,
      }}
    >
      {/* Shine effect */}
      <span style={{
        position: 'absolute',
        top: 0,
        left: isHovered ? '100%' : '-100%',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
        transition: 'left 0.6s ease',
      }} />
      <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        {children}
      </span>
    </button>
  )
}

// Secondary button (glassmorphism)
function SecondaryButton({ onClick, icon, label }: { onClick: () => void; icon: string; label: string }) {
  const [isHovered, setIsHovered] = useState(false)
  
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '12px 28px',
        fontSize: 14,
        fontWeight: 500,
        borderRadius: 16,
        background: isHovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.6)',
        color: '#4b5563',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: isHovered 
          ? '0 8px 24px rgba(0,0,0,0.08)'
          : '0 2px 8px rgba(0,0,0,0.04)',
        animation: 'slideUp 0.5s ease-out 0.5s forwards',
        opacity: 0,
      }}
    >
      <span style={{ marginRight: 6 }}>{icon}</span>
      {label}
    </button>
  )
}

export default function App() {
  const userId = useMemo(() => getOrCreateUserId(), [])
  const [sessionId, setSessionId] = useState(() => getNewSessionId())
  const [quizOpen, setQuizOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [coachOpen, setCoachOpen] = useState(false)

  function openQuiz() {
    setSessionId(getNewSessionId())
    setQuizOpen(true)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <BackgroundBlobs />
      
      {/* Content */}
      <div style={{ 
        position: 'relative', 
        zIndex: 1, 
        width: '100%', 
        maxWidth: '800px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          {/* Logo with soft glow */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.1))',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(139,92,246,0.2)',
            marginBottom: 28,
            animation: 'float 6s ease-in-out infinite, scaleIn 0.5s ease-out forwards',
            boxShadow: '0 8px 32px rgba(139,92,246,0.15)',
          }}>
            <span style={{ fontSize: 48 }}>🎯</span>
          </div>
          
          <h1 style={{
            fontSize: 'clamp(36px, 8vw, 56px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            marginBottom: 16,
            background: 'linear-gradient(135deg, #1f2937 0%, #4b5563 50%, #6b7280 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'slideUp 0.5s ease-out 0.1s forwards',
            opacity: 0,
          }}>
            Subul
          </h1>
          
          <p style={{
            fontSize: 'clamp(16px, 4vw, 20px)',
            fontWeight: 500,
            color: '#6b7280',
            marginBottom: 8,
            animation: 'slideUp 0.5s ease-out 0.2s forwards',
            opacity: 0,
          }}>
            Votre parcours de certifications personnalisé
          </p>
          
          <p style={{
            fontSize: 15,
            color: '#9ca3af',
            maxWidth: 400,
            lineHeight: 1.6,
            margin: '0 auto',
            animation: 'slideUp 0.5s ease-out 0.25s forwards',
            opacity: 0,
          }}>
            Découvrez votre profil et obtenez un roadmap IA généré spécialement pour vous
          </p>
        </div>

        {/* Domain badges */}
        <div style={{ 
          display: 'flex', 
          gap: 12, 
          flexWrap: 'wrap', 
          justifyContent: 'center', 
          marginBottom: 48,
        }}>
          <DomainBadge icon="☁️" label="Cloud" color="#60a5fa" delay={300} />
          <DomainBadge icon="🔒" label="Cybersécurité" color="#f87171" delay={400} />
          <DomainBadge icon="🤖" label="IA & Data" color="#a78bfa" delay={500} />
          <DomainBadge icon="📡" label="IoT" color="#34d399" delay={600} />
        </div>

        {/* CTA */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          marginBottom: 40,
        }}>
          <PrimaryButton onClick={openQuiz}>
            Démarrer mon évaluation
            <span style={{ fontSize: 20 }}>→</span>
          </PrimaryButton>
          
          <p style={{
            fontSize: 13,
            color: '#9ca3af',
            animation: 'fadeIn 0.5s ease-out 0.6s forwards',
            opacity: 0,
          }}>
            ✨ Gratuit · 5 minutes · Résultats instantanés
          </p>
        </div>

        {/* Secondary action buttons */}
        <div style={{ 
          display: 'flex', 
          gap: 12,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          <SecondaryButton 
            onClick={() => setProgressOpen(true)} 
            icon="📊" 
            label="Mon Progrès" 
          />
          <SecondaryButton 
            onClick={() => setCoachOpen(true)} 
            icon="🎓" 
            label="Coach IA" 
          />
        </div>

        {/* Footer text */}
        <p style={{ 
          color: '#9ca3af', 
          fontSize: 12, 
          marginTop: 48,
          animation: 'fadeIn 0.5s ease-out 0.8s forwards',
          opacity: 0,
        }}>
          Évaluation adaptative · Multi-agents IA · Roadmap 100% personnalisé
        </p>
      </div>

      {/* Quiz flow */}
      <QuizFlowManager
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        userId={userId}
        sessionId={sessionId}
      />

      {/* Progress dashboard */}
      <ProgressDashboard
        open={progressOpen}
        userId={userId}
        onClose={() => setProgressOpen(false)}
        onStartNew={openQuiz}
      />

      {/* Coach chat */}
      <CoachChat
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        userId={userId}
        sessionId={sessionId}
      />
    </div>
  )
}
