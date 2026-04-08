// @ts-nocheck
'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import aiAgentService, { CertStatus } from '../services/ai-agent.service';
import CoachChat from './CoachChat';
import NegotiationPanel from './NegotiationPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeeklyPlanItem { semaine: number; focus: string; heures: number; ressource?: string; }
interface CareerOutcome { titre_poste: string; salaire_moyen_eur?: string; entreprises_type: string[]; niveau_requis: string; }

interface CertificationItem {
  ordre: number; nom: string; code?: string; provider: string; niveau_certif: string;
  duree_preparation_semaines: number; heures_etude: number; prerequis: string[];
  pourquoi_cette_certif: string; competences_acquises: string[]; statut: 'current' | 'upcoming' | 'locked';
  xp_reward: number; plan_semaine?: WeeklyPlanItem[]; prix_examen_eur?: string;
  lien_formation_officielle?: string; lien_inscription_examen?: string;
}

interface RoadmapPhase {
  phase_number: number; phase_name: string; phase_description: string;
  duration_weeks: number; level_tier?: string; certifications: CertificationItem[];
}

interface ParsedRoadmap {
  roadmap_title: string; roadmap_summary: string; total_estimated_weeks: number;
  total_certifications: number; user_level?: string; phases: RoadmapPhase[];
  conseil_final: string; debouches?: CareerOutcome[]; objectifs_carriere?: string;
}

interface LevelData { niveau: string; score: { pourcentage: number; total: number }; }

interface Props {
  roadmap: ParsedRoadmap; profile: string; certStatuses?: Record<string, CertStatus>;
  levelData?: LevelData | null; profileData?: Record<string, unknown> | null;
  onCertClick?: (cert: CertificationItem) => void; onClose?: () => void;
  userId?: string; sessionId?: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { color: string; bg: string; badge: string }> = {
  Microsoft: { color: '#0078D4', bg: 'rgba(0,120,212,0.1)',   badge: 'MS'  },
  AWS:       { color: '#E87722', bg: 'rgba(232,119,34,0.1)',  badge: 'AWS' },
  CompTIA:   { color: '#C41230', bg: 'rgba(196,18,48,0.1)',   badge: 'CTX' },
  ISC2:      { color: '#006747', bg: 'rgba(0,103,71,0.1)',    badge: 'ISC' },
  Google:    { color: '#4285F4', bg: 'rgba(66,133,244,0.1)',  badge: 'GCP' },
};

const PHASE_PALETTES = [
  { bg: 'linear-gradient(135deg,#1e3a5f 0%,#1a2744 100%)', accent: '#60a5fa', border: 'rgba(96,165,250,0.3)', tag: 'rgba(96,165,250,0.15)' },
  { bg: 'linear-gradient(135deg,#3b1f5e 0%,#2d1449 100%)', accent: '#a78bfa', border: 'rgba(167,139,250,0.3)', tag: 'rgba(167,139,250,0.15)' },
  { bg: 'linear-gradient(135deg,#1a3a3a 0%,#14302a 100%)', accent: '#34d399', border: 'rgba(52,211,153,0.3)', tag: 'rgba(52,211,153,0.15)' },
  { bg: 'linear-gradient(135deg,#3a1f1f 0%,#2d1414 100%)', accent: '#fb7185', border: 'rgba(251,113,133,0.3)', tag: 'rgba(251,113,133,0.15)' },
  { bg: 'linear-gradient(135deg,#1f3a2a 0%,#142d20 100%)', accent: '#4ade80', border: 'rgba(74,222,128,0.3)', tag: 'rgba(74,222,128,0.15)' },
];

const CERT_STATUS_META: Record<CertStatus, { label: string; icon: string; color: string; bg: string; border: string }> = {
  completed:   { label: 'Terminée',  icon: '✓', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' },
  in_progress: { label: 'En cours',  icon: '◐', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.35)' },
  skipped:     { label: 'Ignorée',   icon: '⊘', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)' },
};

const PROFILE_ICON: Record<string, string> = { cloud: '☁️', cyber: '🛡️', ai: '🤖', iot: '📡' };

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const ZapIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const SparkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);
const TrophyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
    <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  </svg>
);
const ArrowRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const BookIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);
const BulbIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
    <path d="M9 18h6"/><path d="M10 22h4"/>
  </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCertDisplayStatus(cert: CertificationItem, certStatuses?: Record<string, CertStatus>): 'completed' | 'current' | 'upcoming' | 'locked' {
  if (certStatuses && cert.code) {
    const s = certStatuses[cert.code.toUpperCase()];
    if (s === 'completed') return 'completed';
    if (s === 'in_progress') return 'current';
  }
  return cert.statut === 'locked' ? 'locked' : cert.statut === 'current' ? 'current' : 'upcoming';
}

// ─── CertStatusRow ────────────────────────────────────────────────────────────

function CertStatusRow({ certCode, currentStatus, onStatusChange }: {
  certCode?: string; currentStatus?: CertStatus; onStatusChange: (code: string, s: CertStatus) => void;
}) {
  const [saving, setSaving] = useState<CertStatus | null>(null);
  if (!certCode) return null;

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 16 }}>
      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Statut :</span>
      {(Object.entries(CERT_STATUS_META) as [CertStatus, typeof CERT_STATUS_META[CertStatus]][]).map(([status, cfg]) => {
        const active = currentStatus === status;
        return (
          <button
            key={status}
            onClick={async () => { setSaving(status); try { await onStatusChange(certCode, status); } finally { setSaving(null); } }}
            disabled={!!saving}
            style={{
              padding: '4px 12px', borderRadius: 99, cursor: saving ? 'wait' : 'pointer',
              border: `1px solid ${active ? cfg.border : 'rgba(255,255,255,0.1)'}`,
              background: active ? cfg.bg : 'transparent',
              color: active ? cfg.color : '#64748b',
              fontSize: 11, fontWeight: active ? 700 : 500,
              transition: 'all 0.2s',
            }}
          >
            {saving === status ? '…' : cfg.icon} {cfg.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Certification Card ───────────────────────────────────────────────────────

function CertCard({ cert, phaseAccent, index, total, certStatuses, onOpen, onStatusChange }: {
  cert: CertificationItem; phaseAccent: string; index: number; total: number;
  certStatuses: Record<string, CertStatus>; onOpen: () => void;
  onStatusChange: (code: string, s: CertStatus) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const status = getCertDisplayStatus(cert, certStatuses);
  const pMeta = PROVIDER_META[cert.provider] || PROVIDER_META.AWS;
  const userCertStatus = cert.code ? certStatuses[cert.code.toUpperCase()] : undefined;

  const isCompleted = status === 'completed';
  const isCurrent = status === 'current';
  const isLocked = status === 'locked';

  const cardBg = isCompleted
    ? 'rgba(16,185,129,0.06)'
    : isCurrent
    ? 'rgba(59,130,246,0.08)'
    : 'rgba(255,255,255,0.04)';

  const cardBorder = isCompleted
    ? 'rgba(16,185,129,0.3)'
    : isCurrent
    ? 'rgba(59,130,246,0.4)'
    : hovered
    ? 'rgba(255,255,255,0.15)'
    : 'rgba(255,255,255,0.07)';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 16,
        background: hovered ? (isCompleted ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.07)') : cardBg,
        border: `1px solid ${cardBorder}`,
        padding: '18px 18px 14px',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered ? '0 12px 32px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.15)',
        position: 'relative',
        overflow: 'hidden',
        opacity: isLocked ? 0.55 : 1,
        animationDelay: `${index * 0.07}s`,
        animation: 'cardEntry 0.5s ease-out both',
      }}
      onClick={onOpen}
    >
      {/* Current pulse glow */}
      {isCurrent && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 16, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.15) 0%, transparent 70%)',
          animation: 'subtleGlow 3s ease-in-out infinite',
        }} />
      )}

      {/* Top row: order badge + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: isCompleted ? 'rgba(16,185,129,0.2)' : isCurrent ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${isCompleted ? 'rgba(16,185,129,0.4)' : isCurrent ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800,
            color: isCompleted ? '#10b981' : isCurrent ? '#60a5fa' : '#64748b',
          }}>
            {isCompleted ? <CheckIcon /> : isLocked ? <LockIcon /> : index + 1}
          </div>
          {/* Provider badge */}
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
            background: pMeta.bg, color: pMeta.color, letterSpacing: '0.05em',
          }}>
            {pMeta.badge}
          </span>
        </div>

        {/* Status indicator */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isCompleted ? '#10b981' : isCurrent ? '#3b82f6' : isLocked ? '#374151' : '#475569',
          boxShadow: isCurrent ? '0 0 0 3px rgba(59,130,246,0.25)' : 'none',
          animation: isCurrent ? 'statusPulse 2s ease-in-out infinite' : 'none',
        }} />
      </div>

      {/* Cert code */}
      {cert.code && (
        <div style={{ marginBottom: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: phaseAccent, letterSpacing: '0.08em',
          }}>
            {cert.code}
          </span>
        </div>
      )}

      {/* Cert name */}
      <h4 style={{
        fontSize: 13, fontWeight: 700, color: isLocked ? '#475569' : '#e2e8f0',
        margin: '0 0 12px', lineHeight: 1.4,
      }}>
        {cert.nom}
      </h4>

      {/* Stats row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
          <ClockIcon /> {cert.duree_preparation_semaines}s
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
          <ZapIcon /> +{cert.xp_reward}
        </span>
        {userCertStatus && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: CERT_STATUS_META[userCertStatus]?.bg,
            color: CERT_STATUS_META[userCertStatus]?.color,
            border: `1px solid ${CERT_STATUS_META[userCertStatus]?.border}`,
          }}>
            {CERT_STATUS_META[userCertStatus]?.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Phase Section ────────────────────────────────────────────────────────────

function PhaseSection({ phase, phaseIndex, certStatuses, onCertOpen, onStatusChange }: {
  phase: RoadmapPhase; phaseIndex: number;
  certStatuses: Record<string, CertStatus>;
  onCertOpen: (cert: CertificationItem, phase: RoadmapPhase) => void;
  onStatusChange: (code: string, s: CertStatus) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const palette = PHASE_PALETTES[phaseIndex % PHASE_PALETTES.length];
  const completedInPhase = phase.certifications.filter(c =>
    getCertDisplayStatus(c, certStatuses) === 'completed'
  ).length;
  const total = phase.certifications.length;
  const pct = total > 0 ? Math.round((completedInPhase / total) * 100) : 0;

  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden',
      border: `1px solid ${palette.border}`,
      boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
      marginBottom: 24,
      animation: `sectionEntry 0.6s ease-out ${phaseIndex * 0.1}s both`,
    }}>
      {/* Phase header */}
      <div
        style={{
          background: palette.bg,
          padding: '20px 24px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Phase number */}
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: `${palette.accent}22`,
              border: `2px solid ${palette.accent}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 900, color: palette.accent,
            }}>
              {phase.phase_number}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#f0f9ff', margin: 0 }}>
                  {phase.phase_name}
                </h3>
                {phase.level_tier && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: palette.tag, color: palette.accent, letterSpacing: '0.06em',
                  }}>
                    {phase.level_tier}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                {phase.duration_weeks} semaines · {total} certification{total > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Phase progress ring */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                position: 'relative', width: 44, height: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="44" height="44" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
                  <circle
                    cx="22" cy="22" r="18" fill="none"
                    stroke={palette.accent} strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 18}`}
                    strokeDashoffset={`${2 * Math.PI * 18 * (1 - pct / 100)}`}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '22px 22px', transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 800, color: palette.accent, zIndex: 1 }}>
                  {pct}%
                </span>
              </div>
            </div>

            {/* Collapse chevron */}
            <div style={{
              color: 'rgba(255,255,255,0.4)',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}>
              <ChevronDownIcon />
            </div>
          </div>
        </div>

        {/* Phase progress bar */}
        {pct > 0 && (
          <div style={{ marginTop: 14, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99, background: palette.accent, width: `${pct}%`,
              transition: 'width 1s ease', boxShadow: `0 0 8px ${palette.accent}80`,
            }} />
          </div>
        )}
      </div>

      {/* Phase description */}
      {!collapsed && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px 24px 0' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
            {phase.phase_description}
          </p>
        </div>
      )}

      {/* Cert grid */}
      {!collapsed && (
        <div style={{
          background: 'rgba(0,0,0,0.2)',
          padding: '16px 20px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}>
          {phase.certifications.map((cert, idx) => (
            <CertCard
              key={cert.nom}
              cert={cert}
              phaseAccent={palette.accent}
              index={idx}
              total={phase.certifications.length}
              certStatuses={certStatuses}
              onOpen={() => onCertOpen(cert, phase)}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function CertDetailDrawer({ cert, phase, certStatuses, onClose, onStatusChange }: {
  cert: CertificationItem; phase: RoadmapPhase;
  certStatuses: Record<string, CertStatus>;
  onClose: () => void;
  onStatusChange: (code: string, s: CertStatus) => void;
}) {
  const pMeta = PROVIDER_META[cert.provider] || PROVIDER_META.AWS;
  const status = getCertDisplayStatus(cert, certStatuses);
  const userCertStatus = cert.code ? certStatuses[cert.code.toUpperCase()] : undefined;

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, zIndex: 1100,
      display: 'flex', flexDirection: 'column',
      background: '#0f172a', boxShadow: '-8px 0 48px rgba(0,0,0,0.5)',
      animation: 'drawerIn 0.3s cubic-bezier(0.4,0,0.2,1)',
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 24px 20px',
        background: 'linear-gradient(135deg, #1e3a5f, #1a2744)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            <TrophyIcon /> Phase {phase.phase_number} · {phase.phase_name}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: 6, cursor: 'pointer', color: '#94a3b8',
              display: 'flex', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            <XIcon />
          </button>
        </div>

        {/* Provider + Code */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8,
            background: pMeta.bg, color: pMeta.color, letterSpacing: '0.04em',
          }}>
            {pMeta.badge}
          </span>
          {cert.code && (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>{cert.code}</span>
          )}
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
            background: status === 'completed' ? 'rgba(16,185,129,0.15)' : status === 'current' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.07)',
            color: status === 'completed' ? '#10b981' : status === 'current' ? '#60a5fa' : '#64748b',
          }}>
            {status === 'completed' ? '✓ Terminée' : status === 'current' ? '● En cours' : status === 'locked' ? '🔒 Verrouillée' : '○ À venir'}
          </span>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f0f9ff', margin: 0, lineHeight: 1.3 }}>
          {cert.nom}
        </h2>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
          {[
            { label: 'Durée', value: `${cert.duree_preparation_semaines} sem`, icon: '⏱' },
            { label: 'Étude', value: `${cert.heures_etude}h`, icon: '📖' },
            { label: 'XP', value: `+${cert.xp_reward}`, icon: '⚡' },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, padding: '10px', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 15, marginBottom: 2 }}>{s.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* Why this cert */}
        <Section title="Pourquoi cette certification ?" emoji="🎯" accent="#34d399">
          <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>
            {cert.pourquoi_cette_certif}
          </p>
        </Section>

        {/* Skills */}
        {cert.competences_acquises?.length > 0 && (
          <Section title="Compétences acquises" emoji="✨" accent="#a78bfa">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cert.competences_acquises.map((c, i) => (
                <span key={i} style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 99,
                  background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)',
                  color: '#a78bfa',
                }}>
                  {c}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Prerequisites */}
        {cert.prerequis?.length > 0 && (
          <Section title="Prérequis" emoji="📋" accent="#fb923c">
            {cert.prerequis.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                <span style={{ color: '#fb923c', flexShrink: 0, marginTop: 1 }}>▸</span> {p}
              </div>
            ))}
          </Section>
        )}

        {/* Weekly plan */}
        {cert.plan_semaine?.length > 0 && (
          <Section title="Plan de révision hebdomadaire" emoji="📅" accent="#60a5fa">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cert.plan_semaine.map(w => (
                <div key={w.semaine} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800, color: '#60a5fa',
                  }}>
                    S{w.semaine}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', margin: '0 0 2px' }}>{w.focus}</p>
                    {w.ressource && <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>📚 {w.ressource}</p>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', flexShrink: 0 }}>{w.heures}h</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Phase info */}
        <Section title="Phase" emoji="🗂" accent="#6b7280">
          <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, margin: 0 }}>
            {phase.phase_description}
          </p>
          <p style={{ fontSize: 11, color: '#374151', marginTop: 8, marginBottom: 0 }}>
            Durée de la phase : <strong style={{ color: '#94a3b8' }}>{phase.duration_weeks} semaines</strong>
          </p>
        </Section>

        {/* External links */}
        {(cert.lien_formation_officielle || cert.lien_inscription_examen) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {cert.lien_formation_officielle && (
              <a href={cert.lien_formation_officielle} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                  color: '#60a5fa', background: 'rgba(59,130,246,0.1)', padding: '8px 14px',
                  borderRadius: 8, border: '1px solid rgba(59,130,246,0.25)', textDecoration: 'none',
                  transition: 'all 0.2s',
                }}
              >
                <BookIcon /> Formation officielle <ArrowRightIcon />
              </a>
            )}
            {cert.lien_inscription_examen && (
              <a href={cert.lien_inscription_examen} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                  color: '#f472b6', background: 'rgba(244,114,182,0.1)', padding: '8px 14px',
                  borderRadius: 8, border: '1px solid rgba(244,114,182,0.25)', textDecoration: 'none',
                }}
              >
                📝 S'inscrire à l'examen <ArrowRightIcon />
              </a>
            )}
          </div>
        )}

        {/* Status buttons */}
        <div style={{
          padding: '16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <CertStatusRow
            certCode={cert.code}
            currentStatus={userCertStatus}
            onStatusChange={onStatusChange}
          />
        </div>
      </div>
    </div>
  );
}

function Section({ title, emoji, accent, children }: { title: string; emoji: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>{emoji}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RoadmapPathView({
  roadmap, profile, certStatuses: initialCertStatuses,
  levelData, profileData, onCertClick, onClose,
  userId = 'demo-user', sessionId = 'demo-session',
}: Props) {
  const [certStatuses, setCertStatuses] = useState<Record<string, CertStatus>>(initialCertStatuses || {});
  const [selectedCert, setSelectedCert] = useState<{ cert: CertificationItem; phase: RoadmapPhase } | null>(null);
  const [certSaveError, setCertSaveError] = useState<string | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [negOpen, setNegOpen] = useState(false);
  const [liveRoadmap, setLiveRoadmap] = useState<ParsedRoadmap>(roadmap);

  useEffect(() => {
    aiAgentService.getCertProgress(userId).then(d => setCertStatuses(d.cert_status ?? {})).catch(() => {});
  }, [userId]);

  useEffect(() => { if (initialCertStatuses) setCertStatuses(initialCertStatuses); }, [initialCertStatuses]);
  useEffect(() => { setLiveRoadmap(roadmap); }, [roadmap]);

  const handleCertStatusChange = useCallback(async (certCode: string, status: CertStatus) => {
    setCertSaveError(null);
    setCertStatuses(prev => ({ ...prev, [certCode.toUpperCase()]: status }));
    try {
      await aiAgentService.updateCertStatus(userId, certCode, status);
    } catch {
      setCertStatuses(prev => { const c = { ...prev }; delete c[certCode.toUpperCase()]; return c; });
      setCertSaveError('Erreur de sauvegarde');
    }
  }, [userId]);

  const allCerts = useMemo(() =>
    liveRoadmap.phases.flatMap(p => p.certifications)
  , [liveRoadmap.phases]);

  const completedCount = useMemo(() =>
    allCerts.filter(c => getCertDisplayStatus(c, certStatuses) === 'completed').length
  , [allCerts, certStatuses]);

  const progressPct = allCerts.length > 0 ? Math.round((completedCount / allCerts.length) * 100) : 0;
  const userLevel = liveRoadmap.user_level || levelData?.niveau || 'Intermédiaire';
  const profileIcon = PROFILE_ICON[profile] || '🎯';

  const roadmapContext = JSON.stringify({
    title: liveRoadmap.roadmap_title,
    summary: liveRoadmap.roadmap_summary,
    level: userLevel, profile,
    phases: liveRoadmap.phases.map(p => ({
      name: p.phase_name,
      certs: p.certifications.map(c => `${c.nom}${c.code ? ` (${c.code})` : ''}`),
    })),
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #060b18 0%, #0c1628 40%, #080e1d 100%)',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      color: '#e2e8f0',
    }}>

      {/* ── Hero / Stats Header ──────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(30,58,95,0.7) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '40px 40px 32px',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(96,165,250,0.2), rgba(167,139,250,0.15))',
              border: '1px solid rgba(96,165,250,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26,
            }}>
              {profileIcon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 24, fontWeight: 900, color: '#f0f9ff', margin: 0, letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                  {liveRoadmap.roadmap_title}
                </h1>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                  background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)',
                }}>
                  {profileIcon} {profile.charAt(0).toUpperCase() + profile.slice(1)}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                  background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)',
                }}>
                  🏆 {userLevel}
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
                {liveRoadmap.roadmap_summary}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Progression globale</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: progressPct === 100 ? '#10b981' : '#60a5fa' }}>
                {completedCount} / {allCerts.length} certifications · {progressPct}%
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: progressPct === 100
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : 'linear-gradient(90deg, #3b82f6, #60a5fa, #a78bfa)',
                width: `${progressPct}%`,
                transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
                boxShadow: '0 0 12px rgba(96,165,250,0.4)',
              }} />
            </div>
          </div>

          {/* Stats chips */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { icon: '📅', value: `${liveRoadmap.total_estimated_weeks} semaines`, label: 'durée totale' },
              { icon: '🎯', value: `${liveRoadmap.total_certifications}`, label: 'certifications' },
              { icon: '🗂', value: `${liveRoadmap.phases.length}`, label: 'phases' },
              { icon: '✅', value: `${completedCount}`, label: 'terminées' },
            ].map(s => (
              <div key={s.label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <span style={{ fontSize: 14 }}>{s.icon}</span>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{s.value}</span>
                  <span style={{ fontSize: 11, color: '#475569', marginLeft: 4 }}>{s.label}</span>
                </div>
              </div>
            ))}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button onClick={() => setNegOpen(true)} style={{
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.25)',
                color: '#f472b6', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(244,114,182,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(244,114,182,0.1)'}
              >
                ✏️ Personnaliser
              </button>
              <button onClick={() => setCoachOpen(true)} style={{
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)',
                color: '#a78bfa', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(167,139,250,0.1)'}
              >
                🎓 Coach IA
              </button>
              {onClose && (
                <button onClick={onClose} style={{
                  padding: '8px 20px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                  background: 'linear-gradient(135deg, #2563EB, #3b82f6)', border: 'none',
                  color: 'white', fontSize: 12, fontWeight: 700, boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
                  transition: 'all 0.2s',
                }}>
                  Terminer
                </button>
              )}
            </div>
          </div>

          {certSaveError && (
            <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: 12 }}>
              ⚠️ {certSaveError}
            </div>
          )}
        </div>
      </div>

      {/* ── Phases ──────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 40px' }}>
        {liveRoadmap.phases.map((phase, phaseIdx) => (
          <PhaseSection
            key={phase.phase_number}
            phase={phase}
            phaseIndex={phaseIdx}
            certStatuses={certStatuses}
            onCertOpen={(cert, p) => { setSelectedCert({ cert, phase: p }); onCertClick?.(cert); }}
            onStatusChange={handleCertStatusChange}
          />
        ))}

        {/* ── Career Outcomes ──────────────────────────────────────────────── */}
        {(liveRoadmap.debouches?.length > 0 || liveRoadmap.objectifs_carriere) && (
          <div style={{
            borderRadius: 20, padding: '28px 28px 24px',
            background: 'rgba(16,185,129,0.05)',
            border: '1px solid rgba(16,185,129,0.2)',
            marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 16 }}>🚀</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Débouchés & Carrière
              </span>
            </div>
            {liveRoadmap.objectifs_carriere && (
              <p style={{ fontSize: 13, color: '#6ee7b7', lineHeight: 1.7, margin: '0 0 20px', fontStyle: 'italic' }}>
                {liveRoadmap.objectifs_carriere}
              </p>
            )}
            {liveRoadmap.debouches?.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {liveRoadmap.debouches.map((d, i) => (
                  <div key={i} style={{
                    padding: '16px 18px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(16,185,129,0.15)',
                  }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px' }}>{d.titre_poste}</p>
                    {d.salaire_moyen_eur && <p style={{ fontSize: 12, fontWeight: 700, color: '#34d399', margin: '0 0 6px' }}>💰 {d.salaire_moyen_eur}</p>}
                    <p style={{ fontSize: 10, color: '#475569', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Niveau : {d.niveau_requis}
                    </p>
                    {d.entreprises_type?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {d.entreprises_type.map((e, j) => (
                          <span key={j} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(16,185,129,0.1)', color: '#34d399', fontWeight: 600 }}>
                            {e}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Final Advice ──────────────────────────────────────────────────── */}
        <div style={{
          borderRadius: 20, padding: '28px 28px 24px',
          background: 'linear-gradient(135deg, rgba(96,165,250,0.06), rgba(167,139,250,0.06))',
          border: '1px solid rgba(96,165,250,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(96,165,250,0.2), rgba(167,139,250,0.2))',
              border: '1px solid rgba(96,165,250,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa',
            }}>
              <BulbIcon />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#93c5fd', margin: '0 0 10px' }}>
                Conseil Final
              </h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7, margin: 0 }}>
                {liveRoadmap.conseil_final}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Detail Drawer backdrop ────────────────────────────────────────────── */}
      {selectedCert && (
        <>
          <div
            onClick={() => setSelectedCert(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1099,
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
              animation: 'fadeIn 0.2s ease',
            }}
          />
          <CertDetailDrawer
            cert={selectedCert.cert}
            phase={selectedCert.phase}
            certStatuses={certStatuses}
            onClose={() => setSelectedCert(null)}
            onStatusChange={handleCertStatusChange}
          />
        </>
      )}

      {/* ── Coach & Negotiation ───────────────────────────────────────────────── */}
      <CoachChat
        open={coachOpen} onClose={() => setCoachOpen(false)}
        userId={userId} sessionId={`coach_${sessionId}`}
        roadmapContext={roadmapContext}
      />
      <NegotiationPanel
        open={negOpen} onClose={() => setNegOpen(false)}
        userId={userId} sessionId={sessionId}
        initialRoadmap={liveRoadmap as any}
        profileData={profileData || {}} levelData={levelData ? { niveau: levelData.niveau, score: levelData.score } : {}}
        profile={profile} niveau={levelData?.niveau || 'Débutant'}
        onRoadmapUpdated={updated => setLiveRoadmap(updated as unknown as ParsedRoadmap)}
      />

      {/* ── Global CSS ───────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes cardEntry { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes sectionEntry { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes drawerIn { from { transform:translateX(100%); } to { transform:translateX(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes subtleGlow { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
        @keyframes statusPulse { 0%,100% { box-shadow:0 0 0 3px rgba(59,130,246,0.25); } 50% { box-shadow:0 0 0 6px rgba(59,130,246,0.1); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); }
        ::-webkit-scrollbar-thumb { background: rgba(96,165,250,0.3); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(96,165,250,0.5); }
      `}</style>
    </div>
  );
}
