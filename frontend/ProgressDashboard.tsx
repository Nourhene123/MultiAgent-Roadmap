// @ts-nocheck
/**
 * ProgressDashboard.tsx — User learning history and score trend viewer (Sprint 2)
 *
 * Shows:
 *   - Total sessions completed
 *   - Latest profile / niveau / scores
 *   - Score trend (delta between first and latest session per domain)
 *   - Session history list
 */

'use client';

import React, { useState, useEffect } from 'react';
import aiAgentService, { ProgressResponse, ProgressSession, Profile } from './ai-agent.service';

// ─── Domain config ─────────────────────────────────────────────────────────────

const DOMAINS: { key: Profile; label: string; color: string; emoji: string }[] = [
  { key: 'cloud', label: 'Cloud',          color: '#3B82F6', emoji: '☁️' },
  { key: 'cyber', label: 'Cybersécurité',  color: '#EF4444', emoji: '🔒' },
  { key: 'ai',    label: 'IA & Data',      color: '#8B5CF6', emoji: '🤖' },
  { key: 'iot',   label: 'IoT',            color: '#10B981', emoji: '📡' },
];

const NIVEAU_COLOR: Record<string, string> = {
  'Débutant': '#10B981',
  'Intermédiaire': '#F59E0B',
  'Expert': '#EF4444',
};

const PROFILE_LABEL: Record<string, string> = {
  cloud: 'Cloud & DevOps',
  cyber: 'Cybersécurité',
  ai: 'Intelligence Artificielle',
  iot: 'Internet des Objets',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

function TrendBadge({ value }: { value: number }) {
  if (value === 0) return <span style={{ color: '#9CA3AF', fontSize: 12 }}>—</span>;
  const positive = value > 0;
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
      background: positive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      color: positive ? '#059669' : '#DC2626',
    }}>
      {positive ? `+${value}` : value}%
    </span>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ height: 6, borderRadius: 4, background: '#F3F4F6' }}>
        <div style={{
          height: '100%', borderRadius: 4, background: color,
          width: `${Math.min(value, 100)}%`, transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    background: 'rgba(10,6,25,0.6)', backdropFilter: 'blur(16px)',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  modal: {
    background: '#FFFFFF', borderRadius: 20,
    boxShadow: '0 24px 60px rgba(123,47,190,0.2)',
    width: '100%', maxWidth: 680, maxHeight: '88vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    padding: '20px 24px 16px', borderBottom: '1px solid rgba(123,47,190,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
  },
  body: { padding: '20px 24px', flex: 1, overflowY: 'auto' },
  card: {
    borderRadius: 14, border: '1px solid rgba(123,47,190,0.1)',
    background: 'rgba(123,47,190,0.03)', padding: '16px 20px', marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: 700, color: '#B0A8C8',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
  },
  historyRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderRadius: 10, marginBottom: 8,
    background: '#F9FAFB', border: '1px solid #F3F4F6',
  },
};

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  userId: string;
  onClose: () => void;
  onStartNew: () => void;
}

export default function ProgressDashboard({ open, userId, onClose, onStartNew }: Props) {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    setError(null);
    aiAgentService.getProgress(userId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, userId]);

  if (!open) return null;

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1230' }}>📊 Mon Progrès</div>
            <div style={{ fontSize: 12, color: '#B0A8C8', marginTop: 2 }}>
              Historique de vos évaluations et évolution par domaine
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => { onClose(); onStartNew(); }}
              style={{
                padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: 'linear-gradient(135deg,#E91E8C,#7B2FBE)', color: '#fff',
                border: 'none', cursor: 'pointer',
              }}
            >
              Nouvelle évaluation
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0A8C8', fontSize: 20 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={S.body}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#B0A8C8' }}>
              Chargement de votre historique…
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: 40, color: '#EF4444', fontSize: 13 }}>
              {error}
            </div>
          )}

          {data && data.total_sessions === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🎯</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1230', marginBottom: 8 }}>
                Aucune évaluation encore
              </div>
              <div style={{ fontSize: 13, color: '#B0A8C8', marginBottom: 20 }}>
                Complétez votre première évaluation pour voir votre progression ici.
              </div>
              <button
                onClick={() => { onClose(); onStartNew(); }}
                style={{
                  padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: 'linear-gradient(135deg,#E91E8C,#7B2FBE)', color: '#fff',
                  border: 'none', cursor: 'pointer',
                }}
              >
                Démarrer mon évaluation →
              </button>
            </div>
          )}

          {data && data.total_sessions > 0 && (
            <>
              {/* KPI row */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Sessions', value: data.total_sessions, color: '#7B2FBE' },
                  { label: 'Profil dominant', value: PROFILE_LABEL[data.latest?.profile || ''] || data.latest?.profile, color: '#E91E8C' },
                  { label: 'Dernier niveau', value: data.latest?.niveau, color: NIVEAU_COLOR[data.latest?.niveau || ''] || '#10B981' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ flex: 1, ...S.card, marginBottom: 0, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#B0A8C8', fontWeight: 600, marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Latest scores + trend */}
              <div style={S.card}>
                <div style={S.sectionTitle}>Scores actuels & évolution</div>
                {DOMAINS.map(({ key, label, color, emoji }) => {
                  const score = data.latest?.scores?.[key] ?? 0;
                  const trend = data.trend?.[key] ?? 0;
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 70, fontSize: 12, fontWeight: 700, color }}>{emoji} {label}</div>
                      <ScoreBar value={score} color={color} />
                      <div style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#374151' }}>{score}%</div>
                      <div style={{ width: 52, textAlign: 'right' }}>
                        <TrendBadge value={trend} />
                      </div>
                    </div>
                  );
                })}
                {data.total_sessions < 2 && (
                  <div style={{ fontSize: 11, color: '#B0A8C8', marginTop: 4 }}>
                    * La tendance sera disponible après votre 2ème évaluation.
                  </div>
                )}
              </div>

              {/* Session history */}
              <div style={S.card}>
                <div style={S.sectionTitle}>Historique des sessions ({data.total_sessions})</div>
                {[...data.sessions].reverse().map((s: ProgressSession, i: number) => (
                  <div key={i} style={S.historyRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, fontSize: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(123,47,190,0.08)',
                      }}>
                        {DOMAINS.find(d => d.key === s.profile)?.emoji || '🎓'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1230' }}>
                          {PROFILE_LABEL[s.profile] || s.profile}
                        </div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtDate(s.timestamp)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
                        background: `${NIVEAU_COLOR[s.niveau] || '#10B981'}20`,
                        color: NIVEAU_COLOR[s.niveau] || '#10B981',
                      }}>
                        {s.niveau}
                      </span>
                      <div style={{ fontSize: 11, color: '#9CA3AF', minWidth: 60, textAlign: 'right' }}>
                        {DOMAINS.map(d => `${d.key.toUpperCase()} ${s.scores?.[d.key] ?? 0}%`).join(' · ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
