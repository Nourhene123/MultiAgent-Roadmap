// @ts-nocheck
/**
 * RoadmapView.tsx — Display generated roadmap with certification cards
 *
 * Change 9:  Cert status buttons (✅ Terminée / 🔄 En cours / ⏭ Ignorer)
 * Change 11: "Coach IA" button opens CoachChat with the roadmap as context
 */

'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import aiAgentService, { CertStatus } from '../services/ai-agent.service';
import CoachChat from './CoachChat';
import NegotiationPanel from './NegotiationPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeeklyPlanItem {
  semaine: number;
  focus: string;
  heures: number;
  ressource?: string;
}

interface CareerOutcome {
  titre_poste: string;
  salaire_moyen_eur?: string;
  entreprises_type: string[];
  niveau_requis: string;
}

interface CertificationItem {
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

interface RoadmapPhase {
  phase_number: number;
  phase_name: string;
  phase_description: string;
  duration_weeks: number;
  level_tier?: string;
  certifications: CertificationItem[];
}

interface ParsedRoadmap {
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

interface LevelData {
  niveau: string;
  score: { pourcentage: number; total: number };
}

interface Props {
  roadmap: ParsedRoadmap;
  profile: string;
  levelData: LevelData | null;
  profileData?: Record<string, unknown> | null;
  onClose: () => void;
  userId: string;
  sessionId: string;
}

// ─── Style configurations ─────────────────────────────────────────────────────

const PROVIDER_STYLES: Record<string, { bg: string; text: string; border: string; label: string; icon: string }> = {
  Microsoft: { bg: 'rgba(0,120,212,0.08)',   text: '#0078D4', border: 'rgba(0,120,212,0.2)',   label: 'Azure',  icon: '🔷' },
  AWS:       { bg: 'rgba(232,119,34,0.08)',  text: '#E87722', border: 'rgba(232,119,34,0.2)',  label: 'AWS',    icon: '🟠' },
  CompTIA:   { bg: 'rgba(220,38,38,0.08)',   text: '#DC2626', border: 'rgba(220,38,38,0.2)',   label: 'CompTIA',icon: '🔴' },
  ISC2:      { bg: 'rgba(16,185,129,0.08)',  text: '#059669', border: 'rgba(16,185,129,0.2)',  label: 'ISC2',   icon: '🟢' },
  Google:    { bg: 'rgba(66,133,244,0.08)',  text: '#4285F4', border: 'rgba(66,133,244,0.2)',  label: 'Google', icon: '🔵' },
};

const LEVEL_TIER_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Fondamental:  { bg: 'rgba(16,185,129,0.08)',  text: '#059669', border: 'rgba(16,185,129,0.2)' },
  Associé:      { bg: 'rgba(59,130,246,0.08)',  text: '#2563EB', border: 'rgba(59,130,246,0.2)' },
  Expert:       { bg: 'rgba(233,30,140,0.08)',  text: '#E91E8C', border: 'rgba(233,30,140,0.2)' },
  Professionnel:{ bg: 'rgba(123,47,190,0.08)', text: '#7B2FBE', border: 'rgba(123,47,190,0.2)' },
  Spécialité:   { bg: 'rgba(245,158,11,0.08)',  text: '#B45309', border: 'rgba(245,158,11,0.2)' },
};

const LEVEL_ORDER: Record<string, number> = {
  Fondamental: 0, Associé: 1, Expert: 2, Professionnel: 3, Spécialité: 4,
};

const CERT_STATUS_CONFIG: Record<CertStatus, { label: string; emoji: string; bg: string; text: string; border: string }> = {
  completed:   { label: 'Terminée',  emoji: '✅', bg: 'rgba(16,185,129,0.12)',  text: '#059669', border: 'rgba(16,185,129,0.35)' },
  in_progress: { label: 'En cours',  emoji: '🔄', bg: 'rgba(59,130,246,0.10)',  text: '#2563EB', border: 'rgba(59,130,246,0.35)' },
  skipped:     { label: 'Ignorée',   emoji: '⏭',  bg: 'rgba(107,114,128,0.10)', text: '#6B7280', border: 'rgba(107,114,128,0.3)' },
};

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const MapPinIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const XIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const BookOpenIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);
const StarIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const ChevronRightIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);
const LockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const CheckCircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const SparklesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: string }) {
  const s = PROVIDER_STYLES[provider] || PROVIDER_STYLES.AWS;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, background: s.bg, color: s.text, border: `1px solid ${s.border}`, fontSize: 10, fontWeight: 700 }}>
      {s.icon} {s.label}
    </span>
  );
}

function LevelBadge({ level }: { level: string }) {
  const s = LEVEL_TIER_STYLES[level] || LEVEL_TIER_STYLES.Associé;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 99, background: s.bg, color: s.text, border: `1px solid ${s.border}`, fontSize: 10, fontWeight: 700 }}>
      {level}
    </span>
  );
}

function XPBadge({ xp }: { xp: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, background: 'rgba(233,30,140,0.07)', color: '#E91E8C', border: '1px solid rgba(233,30,140,0.2)', fontSize: 10, fontWeight: 700 }}>
      <StarIcon /> +{xp} XP
    </span>
  );
}

// ─── Cert Status Buttons (Change 9) ──────────────────────────────────────────

function CertStatusRow({
  certCode,
  currentStatus,
  onStatusChange,
}: {
  certCode?: string;
  currentStatus?: CertStatus;
  onStatusChange: (code: string, status: CertStatus) => void;
}) {
  const [saving, setSaving] = useState<CertStatus | null>(null);
  if (!certCode) return null;

  const handleClick = async (status: CertStatus) => {
    if (saving) return;
    setSaving(status);
    try {
      await onStatusChange(certCode, status);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(123,47,190,0.1)' }}>
      <span style={{ fontSize: 10, color: '#B0A8C8', fontWeight: 600, alignSelf: 'center', marginRight: 4 }}>Statut :</span>
      {(Object.entries(CERT_STATUS_CONFIG) as [CertStatus, typeof CERT_STATUS_CONFIG[CertStatus]][]).map(([status, cfg]) => {
        const isActive = currentStatus === status;
        const isSaving = saving === status;
        return (
          <button
            key={status}
            onClick={() => handleClick(status)}
            disabled={!!saving}
            style={{
              padding: '3px 10px',
              borderRadius: 99,
              border: `1px solid ${isActive ? cfg.border : 'rgba(123,47,190,0.12)'}`,
              background: isActive ? cfg.bg : 'transparent',
              color: isActive ? cfg.text : '#B0A8C8',
              fontSize: 11,
              fontWeight: isActive ? 700 : 500,
              cursor: saving ? 'wait' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {isSaving ? '⏳' : cfg.emoji} {cfg.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── CertCard ─────────────────────────────────────────────────────────────────

function CertCard({
  cert,
  certStatus,
  onStatusChange,
}: {
  cert: CertificationItem;
  certStatus?: CertStatus;
  onStatusChange: (code: string, status: CertStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const isLocked = cert.statut === 'locked';
  const isCurrent = cert.statut === 'current';
  const isDone = certStatus === 'completed';

  return (
    <div style={{
      background: isDone
        ? 'rgba(16,185,129,0.04)'
        : isCurrent
        ? 'linear-gradient(135deg,rgba(233,30,140,0.03),rgba(123,47,190,0.04))'
        : isLocked ? 'rgba(248,246,254,0.6)' : '#FFFFFF',
      border: isDone
        ? '1.5px solid rgba(16,185,129,0.3)'
        : isCurrent
        ? '1.5px solid rgba(233,30,140,0.25)'
        : isLocked ? '1px solid rgba(123,47,190,0.07)' : '1px solid rgba(123,47,190,0.1)',
      borderRadius: 14, padding: '16px 18px',
      transition: 'all .2s',
      opacity: isLocked ? 0.6 : 1,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Stripe: current = pink, done = green */}
      {(isCurrent || isDone) && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: isDone
            ? 'linear-gradient(90deg,#10B981,#059669)'
            : 'linear-gradient(90deg,#E91E8C,#7B2FBE)',
        }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginTop: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isDone
            ? 'linear-gradient(135deg,#10B981,#059669)'
            : isCurrent ? 'linear-gradient(135deg,#E91E8C,#7B2FBE)' : 'rgba(123,47,190,0.1)',
          color: isDone || isCurrent ? '#fff' : '#7B2FBE',
          fontSize: 11, fontWeight: 800,
        }}>
          {isDone ? '✓' : isLocked ? <LockIcon /> : cert.ordre}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6, alignItems: 'center' }}>
            <ProviderBadge provider={cert.provider} />
            <LevelBadge level={cert.niveau_certif} />
            {isCurrent && !isDone && (
              <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(233,30,140,0.12)', color: '#E91E8C', border: '1px solid rgba(233,30,140,0.3)' }}>
                ▶ Recommandé
              </span>
            )}
            {isDone && (
              <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)' }}>
                ✅ Terminée
              </span>
            )}
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1230', lineHeight: 1.3, marginBottom: 4 }}>
            {cert.nom}
            {cert.code && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: '#B0A8C8', fontFamily: 'monospace', background: 'rgba(123,47,190,0.06)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(123,47,190,0.12)' }}>
                {cert.code}
              </span>
            )}
          </div>

          <p style={{ fontSize: 12, color: '#7A6E99', lineHeight: 1.55, margin: '0 0 8px' }}>
            {cert.pourquoi_cette_certif}
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#7A6E99' }}>
              <ClockIcon /> {cert.duree_preparation_semaines} sem.
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#7A6E99' }}>
              <BookOpenIcon /> {cert.heures_etude}h d'étude
            </span>
            <XPBadge xp={cert.xp_reward} />
            {cert.prix_examen_eur && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#059669', background: 'rgba(5,150,105,0.08)', padding: '2px 8px', borderRadius: 99, border: '1px solid rgba(5,150,105,0.2)' }}>
                💳 {cert.prix_examen_eur}
              </span>
            )}
          </div>
          {(cert.lien_formation_officielle || cert.lien_inscription_examen) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {cert.lien_formation_officielle && (
                <a
                  href={cert.lien_formation_officielle}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#7B2FBE', background: 'rgba(123,47,190,0.06)', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(123,47,190,0.18)', textDecoration: 'none', transition: 'background .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(123,47,190,0.13)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(123,47,190,0.06)')}
                >
                  📚 Formation officielle
                </a>
              )}
              {cert.lien_inscription_examen && (
                <a
                  href={cert.lien_inscription_examen}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#E91E8C', background: 'rgba(233,30,140,0.06)', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(233,30,140,0.18)', textDecoration: 'none', transition: 'background .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(233,30,140,0.13)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(233,30,140,0.06)')}
                >
                  📝 S'inscrire à l'examen
                </a>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0A8C8', padding: 4, flexShrink: 0, marginTop: 2, transition: 'color .2s' }}
        >
          <span style={{ display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            <ChevronDownIcon />
          </span>
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(123,47,190,0.08)' }}>
          {cert.competences_acquises?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#B0A8C8', marginBottom: 8 }}>
                Compétences acquises
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {cert.competences_acquises.map((c, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 99, background: 'rgba(123,47,190,0.06)', border: '1px solid rgba(123,47,190,0.12)', color: '#7B2FBE' }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {cert.prerequis?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#B0A8C8', marginBottom: 8 }}>
                Prérequis
              </div>
              {cert.prerequis.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7A6E99', marginBottom: 4 }}>
                  <ChevronRightIcon /> {p}
                </div>
              ))}
            </div>
          )}

          {/* Weekly study plan */}
          {cert.plan_semaine?.length > 0 && (
            <div>
              <button
                onClick={() => setPlanOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8 }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#E91E8C' }}>
                  📅 Plan de révision semaine par semaine
                </span>
                <span style={{ fontSize: 10, color: '#B0A8C8' }}>{planOpen ? '▲' : '▼'}</span>
              </button>
              {planOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cert.plan_semaine.map((w) => (
                    <div key={w.semaine} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: 'rgba(233,30,140,0.04)', border: '1px solid rgba(233,30,140,0.1)' }}>
                      <div style={{ minWidth: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#E91E8C,#7B2FBE)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: 'white', fontSize: 9, fontWeight: 800 }}>S{w.semaine}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#1A1230', margin: '0 0 2px' }}>{w.focus}</p>
                        {w.ressource && <p style={{ fontSize: 11, color: '#7A6E99', margin: 0 }}>📚 {w.ressource}</p>}
                      </div>
                      <span style={{ fontSize: 10, color: '#E91E8C', fontWeight: 700, flexShrink: 0 }}>{w.heures}h</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Change 9 — Cert status buttons */}
      <CertStatusRow
        certCode={cert.code}
        currentStatus={certStatus}
        onStatusChange={onStatusChange}
      />
    </div>
  );
}

function PhaseSection({
  phase,
  certStatuses,
  onCertStatusChange,
  isNew,
}: {
  phase: RoadmapPhase;
  certStatuses: Record<string, CertStatus>;
  onCertStatusChange: (code: string, status: CertStatus) => void;
  isNew?: boolean;
}) {
  const tier = phase.level_tier || phase.certifications[0]?.niveau_certif || 'Associé';
  const ts = LEVEL_TIER_STYLES[tier] || LEVEL_TIER_STYLES.Associé;

  return (
    <div
      style={{
        marginBottom: 28,
        animation: isNew ? 'phaseSlideIn 0.4s ease-out' : undefined,
      }}
    >
      {/* Phase header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(123,47,190,0.08)' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ts.bg, border: `1.5px solid ${ts.border}`, color: ts.text, fontSize: 14, fontWeight: 800 }}>
          {phase.phase_number}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1A1230', letterSpacing: '-.01em' }}>{phase.phase_name}</span>
            <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: ts.bg, color: ts.text, border: `1px solid ${ts.border}` }}>{tier}</span>
          </div>
          <p style={{ fontSize: 12, color: '#7A6E99', margin: '2px 0 0', lineHeight: 1.5 }}>{phase.phase_description}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 11, color: '#B0A8C8', fontWeight: 500 }}>
          <ClockIcon /> {phase.duration_weeks} sem.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {phase.certifications.map((cert, i) => (
          <CertCard
            key={i}
            cert={cert}
            certStatus={cert.code ? certStatuses[cert.code.toUpperCase()] : undefined}
            onStatusChange={onCertStatusChange}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function RoadmapView({ roadmap, profile, levelData, profileData, onClose, userId, sessionId }: Props) {
  const profileIcon = ({ cloud: '☁️', cyber: '🛡️', ai: '🤖', iot: '📡' })[profile] || '🎯';
  const userLevel = roadmap.user_level || levelData?.niveau || 'Intermédiaire';

  // Change 9 — cert status state
  const [certStatuses, setCertStatuses] = useState<Record<string, CertStatus>>({});
  const [certSaveError, setCertSaveError] = useState<string | null>(null);

  // Change 11 — coach state
  const [coachOpen, setCoachOpen] = useState(false);

  // Multi-turn negotiation state
  const [negOpen,     setNegOpen]     = useState(false);
  const [liveRoadmap, setLiveRoadmap] = useState<ParsedRoadmap>(roadmap);

  // Track which phases are "new" (for animation on progressive streaming)
  const [seenPhases, setSeenPhases] = useState<Set<number>>(new Set());

  // Load cert progress on mount
  useEffect(() => {
    if (!userId) return;
    aiAgentService.getCertProgress(userId)
      .then(data => setCertStatuses(data.cert_status ?? {}))
      .catch(() => {}); // Cosmos may be offline — silently ignore
  }, [userId]);

  // Track new phases as they arrive
  useEffect(() => {
    const newNums = roadmap.phases.map(p => p.phase_number);
    setSeenPhases(prev => {
      const next = new Set(prev);
      newNums.forEach(n => next.add(n));
      return next;
    });
  }, [roadmap.phases.length]);

  const handleCertStatusChange = useCallback(async (certCode: string, status: CertStatus) => {
    setCertSaveError(null);
    // Optimistic update
    setCertStatuses(prev => ({ ...prev, [certCode.toUpperCase()]: status }));
    try {
      await aiAgentService.updateCertStatus(userId, certCode, status);
    } catch (err: any) {
      // Revert on failure
      setCertStatuses(prev => {
        const copy = { ...prev };
        delete copy[certCode.toUpperCase()];
        return copy;
      });
      setCertSaveError('Cosmos DB offline — statut non sauvegardé.');
    }
  }, [userId]);

  const sortedPhases = useMemo(() => {
    return [...roadmap.phases].sort((a, b) => {
      const tierA = a.level_tier || a.certifications[0]?.niveau_certif || 'Associé';
      const tierB = b.level_tier || b.certifications[0]?.niveau_certif || 'Associé';
      return (LEVEL_ORDER[tierA] ?? 99) - (LEVEL_ORDER[tierB] ?? 99);
    });
  }, [roadmap.phases]);

  const roadmapContext = JSON.stringify({
    title: roadmap.roadmap_title,
    summary: roadmap.roadmap_summary,
    level: userLevel,
    profile,
    phases: roadmap.phases.map(p => ({
      name: p.phase_name,
      certs: p.certifications.map(c => `${c.nom}${c.code ? ` (${c.code})` : ''}`),
    })),
    conseil_final: roadmap.conseil_final,
  });

  const levelLabel = {
    'Débutant': 'Débutant', 'Débutant+': 'Débutant+',
    'Intermédiaire': 'Intermédiaire', 'Intermédiaire+': 'Intermédiaire+',
    'Expert': 'Expert',
  }[userLevel] || userLevel;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(123,47,190,0.1)', padding: '14px 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#E91E8C,#7B2FBE)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 14px rgba(233,30,140,0.3)' }}>
              <MapPinIcon />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1230', letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {roadmap.roadmap_title}
              </div>
              <div style={{ fontSize: 11, color: '#B0A8C8', marginTop: 1 }}>
                {roadmap.total_certifications} certifications · {roadmap.total_estimated_weeks} semaines
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'rgba(123,47,190,0.08)', border: '1px solid rgba(123,47,190,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#7A6E99' }}>
            <XIcon />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {/* Summary card */}
        <div style={{ background: 'linear-gradient(135deg,rgba(233,30,140,0.04),rgba(123,47,190,0.05))', border: '1px solid rgba(123,47,190,0.12)', borderRadius: 16, padding: '18px 20px', marginBottom: 22 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: 'rgba(233,30,140,0.1)', border: '1px solid rgba(233,30,140,0.25)', color: '#E91E8C' }}>
              {profileIcon} {profile.charAt(0).toUpperCase() + profile.slice(1)}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: 'rgba(123,47,190,0.08)', border: '1px solid rgba(123,47,190,0.2)', color: '#7B2FBE' }}>
              🏆 {levelLabel}
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#7A6E99', lineHeight: 1.7, margin: '0 0 14px' }}>
            {roadmap.roadmap_summary}
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { icon: '🏆', label: `${roadmap.total_certifications} certifications` },
              { icon: '⏱️', label: `${roadmap.total_estimated_weeks} semaines` },
              { icon: '📊', label: `${roadmap.phases.length} phases` },
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#7A6E99' }}>
                <span>{icon}</span> {label}
              </div>
            ))}
          </div>
        </div>

        {/* Level progression bar */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#B0A8C8', marginBottom: 10 }}>
            Parcours niveau
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(123,47,190,0.06)', borderRadius: 99, padding: '3px 4px', border: '1px solid rgba(123,47,190,0.1)' }}>
            {['Fondamental', 'Associé', 'Expert', 'Professionnel'].map(lvl => {
              const available = sortedPhases.some(p => (p.level_tier || p.certifications[0]?.niveau_certif) === lvl);
              const ts = LEVEL_TIER_STYLES[lvl];
              return (
                <div key={lvl} style={{ flex: 1, textAlign: 'center', padding: '5px 4px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: available ? ts.bg : 'transparent', color: available ? ts.text : '#D1C9E8', border: available ? `1px solid ${ts.border}` : '1px solid transparent', transition: 'all .2s' }}>
                  {lvl}
                </div>
              );
            })}
          </div>
        </div>

        {/* Cert save error */}
        {certSaveError && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#B45309', fontSize: 12, marginBottom: 16 }}>
            ⚠️ {certSaveError}
          </div>
        )}

        {/* Phases (animated on stream) */}
        {sortedPhases.map((phase) => (
          <PhaseSection
            key={phase.phase_number}
            phase={phase}
            certStatuses={certStatuses}
            onCertStatusChange={handleCertStatusChange}
            isNew={!seenPhases.has(phase.phase_number)}
          />
        ))}

        {/* Final advice */}
        {roadmap.conseil_final && (
          <div style={{ background: 'linear-gradient(135deg,rgba(233,30,140,0.05),rgba(123,47,190,0.06))', border: '1.5px solid rgba(233,30,140,0.2)', borderRadius: 16, padding: '16px 20px', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <SparklesIcon />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#E91E8C', letterSpacing: '.08em', textTransform: 'uppercase' }}>Conseil final</span>
            </div>
            <p style={{ fontSize: 13, color: '#7A6E99', lineHeight: 1.65, margin: 0 }}>
              {roadmap.conseil_final}
            </p>
          </div>
        )}

        {/* Career outcomes */}
        {(roadmap.debouches?.length > 0 || roadmap.objectifs_carriere) && (
          <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.04),rgba(5,150,105,0.06))', border: '1.5px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: '16px 20px', marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>🚀</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', letterSpacing: '.08em', textTransform: 'uppercase' }}>Débouchés & Carrière</span>
            </div>

            {roadmap.objectifs_carriere && (
              <p style={{ fontSize: 13, color: '#065f46', lineHeight: 1.6, margin: '0 0 14px', fontStyle: 'italic' }}>
                {roadmap.objectifs_carriere}
              </p>
            )}

            {roadmap.debouches?.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
                {roadmap.debouches.map((d, i) => (
                  <div key={i} style={{ background: 'white', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(16,185,129,0.15)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1230', margin: '0 0 4px' }}>{d.titre_poste}</p>
                    {d.salaire_moyen_eur && (
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#059669', margin: '0 0 6px' }}>💰 {d.salaire_moyen_eur}</p>
                    )}
                    <p style={{ fontSize: 10, color: '#B0A8C8', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Niveau requis : {d.niveau_requis}</p>
                    {d.entreprises_type?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {d.entreprises_type.map((e, j) => (
                          <span key={j} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(16,185,129,0.08)', color: '#059669', fontWeight: 600 }}>{e}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, padding: '14px 24px', borderTop: '1px solid rgba(123,47,190,0.1)', display: 'flex', alignItems: 'center', gap: 12, background: '#FFFFFF' }}>
        <CheckCircleIcon />
        <p style={{ flex: 1, fontSize: 12, color: '#7A6E99', margin: 0 }}>
          Roadmap généré. Mettez à jour le statut de chaque certification au fil de votre progression.
        </p>
        {/* Multi-turn Negotiation button */}
        <button
          onClick={() => setNegOpen(true)}
          style={{ padding: '9px 18px', borderRadius: 12, flexShrink: 0, background: 'rgba(233,30,140,0.07)', border: '1px solid rgba(233,30,140,0.22)', color: '#E91E8C', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .2s' }}
          onMouseOver={e => { (e.target as HTMLButtonElement).style.background = 'rgba(233,30,140,0.14)' }}
          onMouseOut={e => { (e.target as HTMLButtonElement).style.background = 'rgba(233,30,140,0.07)' }}
        >
          ✏️ Personnaliser
        </button>

        {/* Change 11 — Coach button */}
        <button
          onClick={() => setCoachOpen(true)}
          style={{ padding: '9px 18px', borderRadius: 12, flexShrink: 0, background: 'rgba(123,47,190,0.08)', border: '1px solid rgba(123,47,190,0.2)', color: '#7B2FBE', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .2s' }}
          onMouseOver={e => { (e.target as HTMLButtonElement).style.background = 'rgba(123,47,190,0.15)' }}
          onMouseOut={e => { (e.target as HTMLButtonElement).style.background = 'rgba(123,47,190,0.08)' }}
        >
          🎓 Coach IA
        </button>
        <button
          onClick={onClose}
          style={{ padding: '9px 22px', borderRadius: 12, flexShrink: 0, background: 'linear-gradient(135deg,#E91E8C,#7B2FBE)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 18px rgba(233,30,140,0.3)' }}
        >
          Terminer
        </button>
      </div>

      {/* Change 11 — Coach Chat Panel */}
      <CoachChat
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        userId={userId}
        sessionId={`coach_${sessionId}`}
        roadmapContext={roadmapContext}
      />

      {/* Multi-turn Negotiation Panel */}
      <NegotiationPanel
        open={negOpen}
        onClose={() => setNegOpen(false)}
        userId={userId}
        sessionId={sessionId}
        initialRoadmap={liveRoadmap as any}
        profileData={profileData || {}}
        levelData={levelData ? { niveau: levelData.niveau, score: levelData.score } : {}}
        profile={profile}
        niveau={levelData?.niveau || 'Débutant'}
        onRoadmapUpdated={(updated) => setLiveRoadmap(updated as unknown as ParsedRoadmap)}
      />

      <style>{`
        @keyframes phaseSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
