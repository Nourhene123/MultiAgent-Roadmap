// @ts-nocheck
/**
 * CoachChat.tsx — Conversational Subul Coach  (Change 11)
 *
 * A floating chat panel that lets the learner ask questions about their
 * roadmap, certifications, and study strategy.
 *
 * Props:
 *   open           — whether the panel is visible
 *   onClose        — called when user dismisses the panel
 *   userId         — persistent user identifier
 *   sessionId      — roadmap session id (used as coach session key)
 *   roadmapContext — JSON string of the current roadmap (injected first turn)
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import aiAgentService from './ai-agent.service';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  content: string;
  timestamp: Date;
}

interface CoachChatProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  sessionId: string;
  roadmapContext?: string;  // JSON string of current roadmap
}

// ─── Suggested questions ───────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Comment préparer AZ-900 en 4 semaines ?',
  'Quelles ressources gratuites pour débuter ?',
  'Combien d\'heures étudier par semaine ?',
  'Comment gérer la pression avant un examen ?',
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function CoachChat({ open, onClose, userId, sessionId, roadmapContext }: CoachChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFirstTurn, setIsFirstTurn] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      // Greet on first open
      if (messages.length === 0) {
        setMessages([{
          id: 'welcome',
          role: 'coach',
          content: 'Bonjour ! Je suis Subul Coach, ton assistant pédagogique. Pose-moi tes questions sur ton roadmap, les certifications ou tes stratégies d\'étude. Je suis là pour t\'aider !',
          timestamp: new Date(),
        }]);
      }
    }
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { reply } = await aiAgentService.coachChat(
        sessionId,
        userId,
        msg,
        isFirstTurn ? roadmapContext : undefined,
      );
      setIsFirstTurn(false);

      setMessages(prev => [...prev, {
        id: `c_${Date.now()}`,
        role: 'coach',
        content: reply,
        timestamp: new Date(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `e_${Date.now()}`,
        role: 'coach',
        content: 'Désolé, une erreur est survenue. Veuillez réessayer.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId, userId, roadmapContext, isFirstTurn]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1100,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'flex-end',
      padding: 24,
      pointerEvents: 'none',
    }}>
      {/* Panel */}
      <div style={{
        width: 400,
        maxWidth: '100vw',
        height: 600,
        maxHeight: '85vh',
        background: 'white',
        borderRadius: 20,
        boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'all',
        animation: 'slideUp 0.25s ease-out',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}>
            🎓
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>Subul Coach</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              {loading ? 'En train de répondre...' : 'Assistant pédagogique IA'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: 'white',
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: 'pointer',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: 8,
                alignItems: 'flex-end',
              }}
            >
              {msg.role === 'coach' && (
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                }}>
                  🎓
                </div>
              )}
              <div style={{
                maxWidth: '78%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user'
                  ? '18px 18px 4px 18px'
                  : '18px 18px 18px 4px',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, #667eea, #764ba2)'
                  : '#F3F4F6',
                color: msg.role === 'user' ? 'white' : '#1F2937',
                fontSize: 13.5,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}>🎓</div>
              <div style={{
                padding: '10px 16px',
                borderRadius: '18px 18px 18px 4px',
                background: '#F3F4F6',
                display: 'flex', gap: 4, alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#9CA3AF',
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick suggestions (shown when no conversation yet) */}
        {messages.length <= 1 && (
          <div style={{ padding: '4px 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  border: '1px solid #E5E7EB',
                  background: 'white',
                  color: '#6B7280',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseOver={e => { (e.target as HTMLButtonElement).style.background = '#F9FAFB' }}
                onMouseOut={e => { (e.target as HTMLButtonElement).style.background = 'white' }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '10px 14px',
          borderTop: '1px solid #F3F4F6',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pose ta question... (Entrée pour envoyer)"
            rows={1}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 14,
              border: '1.5px solid #E5E7EB',
              outline: 'none',
              fontSize: 13.5,
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.4,
              maxHeight: 120,
              overflowY: 'auto',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#667eea' }}
            onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#E5E7EB' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: input.trim() && !loading
                ? 'linear-gradient(135deg, #667eea, #764ba2)'
                : '#E5E7EB',
              border: 'none',
              color: input.trim() && !loading ? 'white' : '#9CA3AF',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            ➤
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
          40%            { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
