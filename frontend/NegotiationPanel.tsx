// @ts-nocheck
/**
 * NegotiationPanel.tsx — Multi-turn Roadmap Negotiation UI
 *
 * A full-screen overlay split into two columns:
 *   Left  (55%): Live roadmap summary — updates after each negotiation turn
 *   Right (45%): Chat conversation + suggestion chips + input
 *
 * Features:
 *   - Natural language roadmap modification ("make it faster", "replace AZ-104", etc.)
 *   - Per-turn change log shown as green badge list
 *   - Profile + level recap header
 *   - 💾 Save Roadmap button (persists to backend)
 *   - Works on top of existing roadmap generation — no extra assessment step
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import aiAgentService from './ai-agent.service';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface NegMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  changes?: string[];
  timestamp: Date;
}

interface RoadmapPhase {
  phase_number: number;
  phase_name: string;
  duration_weeks: number;
  level_tier?: string;
  certifications: { nom: string; code?: string; heures_etude: number; niveau_certif: string; pourquoi_cette_certif?: string }[];
}

interface Roadmap {
  roadmap_title?: string;
  roadmap_summary?: string;
  total_estimated_weeks?: number;
  total_certifications?: number;
  conseil_final?: string;
  phases?: RoadmapPhase[];
  [key: string]: unknown;
}

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  sessionId: string;
  initialRoadmap: Roadmap;
  profileData: Record<string, unknown>;
  levelData: Record<string, unknown>;
  profile: string;
  niveau: string;
  /** Called when user confirms a negotiated roadmap — parent updates its state */
  onRoadmapUpdated?: (roadmap: Roadmap) => void;
}

// ─── Suggestion chips ──────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { icon: '⚡', text: 'Rends-le plus rapide' },
  { icon: '📅', text: "J'ai 5h par semaine" },
  { icon: '🔒', text: 'Focus sur la cybersécurité' },
  { icon: '☁️', text: 'Remplace Azure par AWS' },
  { icon: '📉', text: 'Moins de phases' },
  { icon: '🎓', text: 'Ajoute une phase Expert' },
];

// ─── Level tier colour ─────────────────────────────────────────────────────────

const TIER_COLOR: Record<string, string> = {
  Fondamental:   '#059669',
  Associé:       '#2563EB',
  Expert:        '#E91E8C',
  Professionnel: '#7B2FBE',
  Spécialité:    '#B45309',
};

// ─── Compact phase card ────────────────────────────────────────────────────────

function PhaseCard({ phase, isNew }: { phase: RoadmapPhase; isNew: boolean }) {
  const tier   = phase.level_tier || phase.certifications[0]?.niveau_certif || 'Associé';
  const color  = TIER_COLOR[tier] || '#7B2FBE';
  const weeks  = phase.duration_weeks || 0;

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1.5px solid ${color}30`,
        background: `${color}06`,
        padding: '12px 14px',
        marginBottom: 10,
        animation: isNew ? 'negSlideIn .35s ease-out' : undefined,
      }}
    >
      {/* Phase header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: `linear-gradient(135deg,${color},${color}99)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ color: '#fff', fontSize: 10, fontWeight: 800 }}>P{phase.phase_number}</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1230' }}>{phase.phase_name}</span>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, color, padding: '2px 7px',
          borderRadius: 99, background: `${color}12`, border: `1px solid ${color}25`,
        }}>
          {weeks}sem
        </span>
      </div>

      {/* Cert list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {phase.certifications.map((cert, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(123,47,190,0.08)',
          }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1230' }}>{cert.nom}</span>
              {cert.code && (
                <span style={{
                  marginLeft: 5, fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
                  color: '#B0A8C8', background: 'rgba(123,47,190,0.06)',
                  padding: '1px 5px', borderRadius: 4,
                }}>{cert.code}</span>
              )}
            </div>
            <span style={{ fontSize: 10, color: '#7A6E99', flexShrink: 0, marginLeft: 8 }}>
              ⏱ {cert.heures_etude}h
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function NegotiationPanel({
  open,
  onClose,
  userId,
  sessionId,
  initialRoadmap,
  profileData,
  levelData,
  profile,
  niveau,
  onRoadmapUpdated,
}: Props) {
  const [messages,       setMessages]       = useState<NegMsg[]>([]);
  const [currentRoadmap, setCurrentRoadmap] = useState<Roadmap>(initialRoadmap);
  const [input,          setInput]          = useState('');
  const [loading,        setLoading]        = useState(false);
  const [savedId,        setSavedId]        = useState<string | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [newPhaseIdxs,   setNewPhaseIdxs]   = useState<Set<number>>(new Set());
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const negSession = `neg_${sessionId}`;

  // Reset when opened with a new roadmap
  useEffect(() => {
    if (open) {
      setCurrentRoadmap(initialRoadmap);
      setSavedId(null);
      if (messages.length === 0) {
        // Welcome message
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content:
            `Bonjour ! Votre roadmap **${initialRoadmap.roadmap_title || 'personnalisé'}` +
            `** est prêt — **${initialRoadmap.total_estimated_weeks || '?'} semaines**, ` +
            `**${initialRoadmap.total_certifications || '?'} certifications**.\n\n` +
            `Vous pouvez maintenant le personnaliser. Dites-moi ce que vous souhaitez modifier : ` +
            `le rythme, les technologies, les certifications, le nombre de phases…`,
          timestamp: new Date(),
        }]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ─────────────────────────────────────────────────────────────

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput('');
    setSavedId(null);

    const userMsg: NegMsg = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await aiAgentService.negotiateRoadmap(
        negSession,
        userId,
        msg,
        currentRoadmap as any,
        profileData as any,
        levelData as any,
      );

      const updatedRoadmap = result.updated_roadmap as Roadmap;

      // Mark which phase indices changed for animation
      const prevPhases    = currentRoadmap.phases || [];
      const updatedPhases = updatedRoadmap.phases  || [];
      const changed = new Set<number>();
      updatedPhases.forEach((p, i) => {
        const prev = prevPhases[i];
        if (!prev || JSON.stringify(p) !== JSON.stringify(prev)) changed.add(i);
      });
      setNewPhaseIdxs(changed);
      setTimeout(() => setNewPhaseIdxs(new Set()), 1500);

      setCurrentRoadmap(updatedRoadmap);
      onRoadmapUpdated?.(updatedRoadmap);

      const assistantMsg: NegMsg = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        changes: result.changes_made,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: "Désolé, une erreur s'est produite. Veuillez réessayer.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading, currentRoadmap, profileData, levelData, negSession, userId, onRoadmapUpdated]);

  // ── Save roadmap ──────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await aiAgentService.saveRoadmap(
        userId,
        sessionId,
        currentRoadmap as any,
        profile,
        niveau,
      );
      setSavedId(result.saved_id);
    } catch {
      setSavedId('error');
    } finally {
      setSaving(false);
    }
  }, [saving, userId, sessionId, currentRoadmap, profile, niveau]);

  // ── Keyboard shortcut ─────────────────────────────────────────────────────────

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  if (!open) return null;

  const phases = currentRoadmap.phases || [];
  const totalWeeks = currentRoadmap.total_estimated_weeks || 0;
  const totalCerts = currentRoadmap.total_certifications  || 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(10,4,30,0.65)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
      animation: 'negFadeIn .2s ease-out',
    }}>
      <div style={{
        width: '100%', maxWidth: 1160,
        height: '90vh', maxHeight: 820,
        background: '#FAFAFA',
        borderRadius: 20,
        boxShadow: '0 32px 80px rgba(10,4,30,0.35)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          padding: '14px 22px',
          background: 'linear-gradient(135deg,#1A0A3D,#2D0E6B)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>✏️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#FFFFFF', letterSpacing: '.02em' }}>
              Négociation du Roadmap
            </h2>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              Personnalisez votre parcours en langage naturel
            </p>
          </div>

          {/* Profile / level badges */}
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
              background: 'rgba(233,30,140,0.2)', color: '#F48FB1', border: '1px solid rgba(233,30,140,0.35)',
            }}>
              {profile.toUpperCase()}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
              background: 'rgba(123,47,190,0.25)', color: '#CE93D8', border: '1px solid rgba(123,47,190,0.4)',
            }}>
              {niveau}
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8, color: '#fff', cursor: 'pointer',
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, transition: 'background .15s', flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          >×</button>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT — Live roadmap preview ─────────────────────────────────── */}
          <div style={{
            width: '52%', borderRight: '1px solid rgba(123,47,190,0.1)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Roadmap summary bar */}
            <div style={{
              flexShrink: 0, padding: '10px 16px',
              background: 'linear-gradient(90deg,rgba(123,47,190,0.06),rgba(233,30,140,0.04))',
              borderBottom: '1px solid rgba(123,47,190,0.1)',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1230', flex: 1, minWidth: 0 }}>
                {currentRoadmap.roadmap_title || 'Roadmap personnalisé'}
              </span>
              <span style={{ fontSize: 11, color: '#7A6E99', whiteSpace: 'nowrap' }}>
                🗓 {totalWeeks} sem · 🎓 {totalCerts} certs
              </span>
            </div>

            {/* Phases list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
              {phases.length === 0 ? (
                <p style={{ color: '#B0A8C8', textAlign: 'center', marginTop: 40, fontSize: 13 }}>
                  Aucune phase disponible
                </p>
              ) : (
                phases.map((phase, i) => (
                  <PhaseCard key={i} phase={phase} isNew={newPhaseIdxs.has(i)} />
                ))
              )}

              {/* Final expert note */}
              {currentRoadmap.conseil_final && (
                <div style={{
                  marginTop: 8, padding: '10px 14px', borderRadius: 10,
                  background: 'linear-gradient(135deg,rgba(233,30,140,0.04),rgba(123,47,190,0.05))',
                  border: '1px solid rgba(233,30,140,0.15)',
                }}>
                  <p style={{ fontSize: 11, color: '#7A6E99', margin: 0, lineHeight: 1.6 }}>
                    💡 {currentRoadmap.conseil_final}
                  </p>
                </div>
              )}
            </div>

            {/* Save button */}
            <div style={{
              flexShrink: 0, padding: '12px 16px',
              borderTop: '1px solid rgba(123,47,190,0.1)',
              background: '#FFFFFF',
            }}>
              {savedId && savedId !== 'error' ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                  borderRadius: 10, background: 'rgba(5,150,105,0.08)',
                  border: '1px solid rgba(5,150,105,0.25)',
                }}>
                  <span style={{ fontSize: 16 }}>✅</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#059669' }}>Roadmap sauvegardé !</p>
                    <p style={{ margin: 0, fontSize: 10, color: '#7A6E99' }}>ID : {savedId}</p>
                  </div>
                </div>
              ) : savedId === 'error' ? (
                <p style={{ margin: 0, fontSize: 12, color: '#DC2626', textAlign: 'center' }}>
                  Erreur lors de la sauvegarde. Réessayez.
                </p>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10,
                    background: saving
                      ? 'rgba(5,150,105,0.15)'
                      : 'linear-gradient(135deg,#059669,#047857)',
                    border: 'none', color: saving ? '#059669' : '#fff',
                    fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                    boxShadow: saving ? 'none' : '0 4px 14px rgba(5,150,105,0.3)',
                    transition: 'all .2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {saving ? '⏳ Sauvegarde…' : '💾 Sauvegarder ce Roadmap Final'}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT — Chat conversation ────────────────────────────────────── */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    gap: 8, alignItems: 'flex-start',
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg,#E91E8C,#7B2FBE)'
                      : 'linear-gradient(135deg,#7B2FBE,#2D0E6B)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ color: '#fff', fontSize: 12 }}>
                      {msg.role === 'user' ? '👤' : '✏️'}
                    </span>
                  </div>

                  <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {/* Bubble */}
                    <div style={{
                      padding: '9px 13px', borderRadius: msg.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                      background: msg.role === 'user'
                        ? 'linear-gradient(135deg,rgba(233,30,140,0.12),rgba(123,47,190,0.12))'
                        : '#FFFFFF',
                      border: msg.role === 'user'
                        ? '1px solid rgba(233,30,140,0.2)'
                        : '1px solid rgba(123,47,190,0.12)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                    }}>
                      <p style={{
                        margin: 0, fontSize: 12.5, lineHeight: 1.6,
                        color: '#1A1230', whiteSpace: 'pre-wrap',
                      }}>
                        {msg.content}
                      </p>
                    </div>

                    {/* Change badges */}
                    {msg.changes && msg.changes.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {msg.changes.map((c, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '3px 9px', borderRadius: 6,
                            background: 'rgba(5,150,105,0.07)',
                            border: '1px solid rgba(5,150,105,0.2)',
                          }}>
                            <span style={{ fontSize: 9, color: '#059669' }}>✓</span>
                            <span style={{ fontSize: 11, color: '#065f46', fontWeight: 500 }}>{c}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,#7B2FBE,#2D0E6B)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ color: '#fff', fontSize: 12 }}>✏️</span>
                  </div>
                  <div style={{
                    padding: '10px 14px', borderRadius: '4px 14px 14px 14px',
                    background: '#FFFFFF', border: '1px solid rgba(123,47,190,0.12)',
                  }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: '#7B2FBE',
                          animation: `negDot .9s ${i * .3}s infinite ease-in-out`,
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Suggestion chips */}
            {messages.length <= 1 && !loading && (
              <div style={{
                flexShrink: 0, padding: '0 16px 10px',
                display: 'flex', flexWrap: 'wrap', gap: 6,
              }}>
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s.text)}
                    style={{
                      padding: '5px 11px', borderRadius: 99,
                      background: 'rgba(123,47,190,0.06)',
                      border: '1px solid rgba(123,47,190,0.18)',
                      color: '#7B2FBE', fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', transition: 'all .15s',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(123,47,190,0.13)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(123,47,190,0.06)')}
                  >
                    {s.icon} {s.text}
                  </button>
                ))}
              </div>
            )}

            {/* Input bar */}
            <div style={{
              flexShrink: 0,
              padding: '10px 14px',
              borderTop: '1px solid rgba(123,47,190,0.1)',
              background: '#FFFFFF',
              display: 'flex', gap: 8, alignItems: 'flex-end',
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ex: rends-le plus rapide, remplace AZ-104 par AWS SAA, j'ai 5h par semaine…"
                disabled={loading}
                rows={2}
                style={{
                  flex: 1, resize: 'none',
                  border: '1.5px solid rgba(123,47,190,0.2)',
                  borderRadius: 12, padding: '9px 13px',
                  fontSize: 13, color: '#1A1230', outline: 'none',
                  fontFamily: 'inherit', lineHeight: 1.5,
                  background: loading ? 'rgba(0,0,0,0.03)' : '#FAFAFF',
                  transition: 'border-color .2s',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(123,47,190,0.5)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(123,47,190,0.2)')}
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: loading || !input.trim()
                    ? 'rgba(123,47,190,0.1)'
                    : 'linear-gradient(135deg,#E91E8C,#7B2FBE)',
                  border: 'none',
                  cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: loading || !input.trim() ? 'none' : '0 4px 14px rgba(233,30,140,0.35)',
                  transition: 'all .2s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={loading || !input.trim() ? '#7B2FBE' : '#fff'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes negFadeIn   { from { opacity:0 } to { opacity:1 } }
        @keyframes negSlideIn  { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes negDot {
          0%,80%,100% { transform: scale(0.6); opacity:.4 }
          40%         { transform: scale(1.1); opacity:1  }
        }
      `}</style>
    </div>
  );
}
