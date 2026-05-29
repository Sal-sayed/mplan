'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const BUG_LIFETIME_MS = 3000;
const GAME_OVER_DURATION_MS = 1500;

const TAUNT_MESSAGES = ['Missed me! \ud83d\ude1c', 'Too slow!', 'Catch me!', 'Heh heh!'];

type Bug = {
  id: number;
  x: number;
  y: number;
  type: 'bug' | 'bonus' | 'trap';
  spawnedAt: number;
};

function playSquishSound() {
  if (typeof window === 'undefined') return;
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch { /* silently fail */ }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function WhackABugGame() {
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [popups, setPopups] = useState<{ id: number; x: number; y: number; text: string; color: string }[]>([]);
  const [highScore, setHighScore] = useState(0);
  const [started, setStarted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [escapeSide, setEscapeSide] = useState<'left' | 'right'>('right');
  const [escapeY, setEscapeY] = useState(50);
  const gameOverRef = useRef(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('bugGameHighScore');
      if (saved) setHighScore(parseInt(saved));
    } catch { /* SSR safe */ }
  }, []);

  const showPopup = useCallback((x: number, y: number, text: string, color: string) => {
    const id = Date.now() + Math.random();
    setPopups(prev => [...prev, { id, x, y, text, color }]);
    setTimeout(() => setPopups(prev => prev.filter(p => p.id !== id)), 800);
  }, []);

  const resetGame = useCallback((reason: string, escapedAt?: { x: number; y: number }) => {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    if (escapedAt) {
      setEscapeSide(escapedAt.x < 50 ? 'left' : 'right');
      setEscapeY(Math.max(20, Math.min(80, escapedAt.y)));
    }
    setIsGameOver(true);
    setScore(0);
    setCombo(0);
    setBugs([]);

    setTimeout(() => {
      setIsGameOver(false);
      gameOverRef.current = false;
    }, GAME_OVER_DURATION_MS);
  }, []);

  // Spawn bugs
  useEffect(() => {
    const spawnBug = () => {
      if (gameOverRef.current) return;

      const rand = Math.random();
      let type: 'bug' | 'bonus' | 'trap' = 'bug';
      if (rand > 0.92) type = 'bonus';
      else if (rand > 0.85) type = 'trap';

      const newBug: Bug = {
        id: Date.now() + Math.random(),
        x: 8 + Math.random() * 84,
        y: 15 + Math.random() * 70,
        type,
        spawnedAt: Date.now(),
      };

      setBugs(prev => [...prev, newBug]);
      if (!started) setStarted(true);

      // 3-second survival timer
      setTimeout(() => {
        setBugs(prev => {
          const still = prev.find(b => b.id === newBug.id);
          if (still) {
            if (newBug.type === 'bug' || newBug.type === 'bonus') {
              // Bug escaped — GAME OVER
              resetGame('Bug escaped!', { x: newBug.x, y: newBug.y });
            } else {
              // Trap bugs just disappear silently (missing them is good)
              showPopup(newBug.x, newBug.y, TAUNT_MESSAGES[Math.floor(Math.random() * TAUNT_MESSAGES.length)], 'text-emerald-400');
            }
          }
          return prev.filter(b => b.id !== newBug.id);
        });
      }, BUG_LIFETIME_MS);
    };

    const initial = setTimeout(spawnBug, 1500);
    const interval = setInterval(spawnBug, 1200 + Math.random() * 1300);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [started, resetGame, showPopup]);

  const handleBugClick = useCallback((bug: Bug, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (gameOverRef.current) return;
    setBugs(prev => prev.filter(b => b.id !== bug.id));

    if (bug.type === 'bug') {
      const points = 10 * (combo >= 3 ? 2 : 1);
      setScore(s => {
        const ns = s + points;
        if (ns > highScore) { setHighScore(ns); try { sessionStorage.setItem('bugGameHighScore', String(ns)); } catch {} }
        return ns;
      });
      setCombo(c => c + 1);
      playSquishSound();
      showPopup(bug.x, bug.y, combo >= 3 ? `+${points} \ud83d\udd25` : `+${points}`, 'text-yellow-300');
    } else if (bug.type === 'bonus') {
      setScore(s => {
        const ns = s + 50;
        if (ns > highScore) { setHighScore(ns); try { sessionStorage.setItem('bugGameHighScore', String(ns)); } catch {} }
        return ns;
      });
      setCombo(c => c + 1);
      playSquishSound();
      showPopup(bug.x, bug.y, '+50 BONUS!', 'text-pink-400');
    } else if (bug.type === 'trap') {
      setScore(s => Math.max(0, s - 20));
      setCombo(0);
      showPopup(bug.x, bug.y, '-20 OOPS!', 'text-red-400');
    }
  }, [combo, highScore, showPopup]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[5]">

      {/* Score HUD */}
      <div className="absolute top-4 right-4 pointer-events-auto z-20">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.15] rounded-xl px-4 py-3 text-right min-w-[140px]"
        >
          <div className="text-[9px] text-white/40 uppercase tracking-widest mb-0.5">Whack-a-Bug</div>
          <div className="text-2xl font-bold text-white tabular-nums">{score}</div>
          {combo >= 3 && (
            <motion.div
              key={combo}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-xs text-yellow-300 font-medium mt-1"
            >
              {'\ud83d\udd25'} {combo}x combo
            </motion.div>
          )}
          <div className="text-[9px] text-red-300/80 mt-1.5 flex items-center justify-end gap-1">
            <span>{'\u23f1'}</span>
            <span>3s to tap each bug</span>
          </div>
          {highScore > 0 && score < highScore && (
            <div className="text-[9px] text-white/30 mt-1">Best: {highScore}</div>
          )}
        </motion.div>
      </div>

      {/* Instruction hint */}
      {!started && !isGameOver && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 5, times: [0, 0.15, 0.85, 1] }}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-white/[0.08] backdrop-blur border border-white/[0.15] rounded-full px-5 py-2.5 z-20"
        >
          <div className="text-xs text-white/90">
            {'\ud83d\udc46'} Tap each bug within <span className="text-red-300 font-bold">3 seconds</span> or you lose!
          </div>
        </motion.div>
      )}

      {/* Bugs */}
      <AnimatePresence>
        {bugs.map(bug => (
          <motion.div
            key={bug.id}
            className="absolute pointer-events-auto cursor-pointer"
            style={{ left: `${bug.x}%`, top: `${bug.y}%`, transform: 'translate(-50%, -50%)' }}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0, y: [0, -8, 0, -4, 0] }}
            exit={{ scale: 0, rotate: 360 }}
            transition={{
              scale: { duration: 0.3, type: 'spring' },
              y: { duration: 1.5, repeat: Infinity },
            }}
            onClick={e => handleBugClick(bug, e)}
            onTouchStart={e => { e.stopPropagation(); handleBugClick(bug, e as any); }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.8 }}
          >
            {/* Countdown ring — only on regular and bonus bugs */}
            {bug.type !== 'trap' && (
              <svg
                className="absolute pointer-events-none"
                width="100" height="100" viewBox="0 0 100 100"
                style={{ left: -10, top: -10 }}
              >
                <motion.circle
                  cx="50" cy="50" r="45"
                  fill="none"
                  stroke={bug.type === 'bonus' ? '#FBBF24' : '#EF4444'}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="283"
                  initial={{ strokeDashoffset: 0 }}
                  animate={{ strokeDashoffset: 283 }}
                  transition={{ duration: 3, ease: 'linear' }}
                  transform="rotate(-90 50 50)"
                  opacity="0.7"
                />
              </svg>
            )}

            {bug.type === 'bug' && <RegularBug />}
            {bug.type === 'bonus' && <BonusBug />}
            {bug.type === 'trap' && <TrapBug />}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Score popups */}
      <AnimatePresence>
        {popups.map(p => (
          <motion.div
            key={p.id}
            className={`absolute font-bold text-xl ${p.color} pointer-events-none drop-shadow-lg`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)', fontFamily: 'Impact, sans-serif' }}
            initial={{ opacity: 0, y: 0, scale: 0.5 }}
            animate={{ opacity: 1, y: -40, scale: 1 }}
            exit={{ opacity: 0, y: -60 }}
            transition={{ duration: 0.8 }}
          >
            {p.text}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* GAME OVER overlay \u2014 slides in from the side the bug escaped to */}
      <AnimatePresence>
        {isGameOver && (() => {
          const isRight = escapeSide === 'right';
          const offscreen = isRight ? 120 : -120;
          const restingX = isRight ? -24 : 24;
          const tiltDeg = isRight ? -6 : 6;
          return (
            <motion.div
              key={escapeSide}
              className="absolute pointer-events-none z-30"
              style={{
                top: `${escapeY}%`,
                [isRight ? 'right' : 'left']: 0,
                transform: 'translateY(-50%)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Streak trail behind the card, pointing back where the bug came from */}
              <motion.div
                className="absolute top-1/2 h-[3px] bg-gradient-to-r from-transparent via-red-400/70 to-red-400"
                style={{
                  [isRight ? 'right' : 'left']: '100%',
                  width: 180,
                  transform: `translateY(-50%) ${isRight ? '' : 'scaleX(-1)'}`,
                  transformOrigin: isRight ? 'right' : 'left',
                }}
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: [0, 1, 0.4] }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />

              <motion.div
                initial={{ x: offscreen, opacity: 0, rotate: tiltDeg * 2, scale: 0.85 }}
                animate={{ x: restingX, opacity: 1, rotate: tiltDeg, scale: 1 }}
                exit={{ x: offscreen * 0.6, opacity: 0, rotate: tiltDeg * 1.5, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                className="bg-red-500/20 backdrop-blur-xl border-2 border-red-400 rounded-2xl px-8 py-5 text-center shadow-2xl"
              >
                <div className="text-4xl mb-2 flex items-center justify-center gap-1">
                  <span>{'\ud83d\udc1b'}</span>
                  <motion.span
                    initial={{ x: isRight ? -10 : 10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    style={{ display: 'inline-block', transform: isRight ? 'none' : 'scaleX(-1)' }}
                  >
                    {'\ud83d\udca8'}
                  </motion.span>
                </div>
                <div className="text-2xl font-bold text-red-300 mb-1" style={{ fontFamily: 'Impact, sans-serif', letterSpacing: '0.05em' }}>
                  BUG ESCAPED {isRight ? '\u2192' : '\u2190'}
                </div>
                <div className="text-sm text-white/70">Game restarting...</div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// ─── Bug Variants ─────────────────

function RegularBug() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <ellipse cx="40" cy="72" rx="22" ry="3" fill="black" opacity="0.3" />
      <ellipse cx="40" cy="42" rx="28" ry="22" fill="#10B981" />
      <ellipse cx="40" cy="36" rx="22" ry="14" fill="#34D399" opacity="0.6" />
      <circle cx="30" cy="38" r="3" fill="#065F46" opacity="0.5" />
      <circle cx="48" cy="44" r="2.5" fill="#065F46" opacity="0.5" />
      <circle cx="32" cy="34" r="6" fill="white" />
      <circle cx="48" cy="34" r="6" fill="white" />
      <circle cx="32" cy="35" r="3" fill="black" />
      <circle cx="48" cy="35" r="3" fill="black" />
      <circle cx="33" cy="33" r="1.2" fill="white" />
      <circle cx="49" cy="33" r="1.2" fill="white" />
      <line x1="32" y1="22" x2="26" y2="10" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="48" y1="22" x2="54" y2="10" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="26" cy="10" r="3" fill="#10B981" />
      <circle cx="54" cy="10" r="3" fill="#10B981" />
      <line x1="14" y1="42" x2="6" y2="38" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="14" y1="48" x2="6" y2="52" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="66" y1="42" x2="74" y2="38" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="66" y1="48" x2="74" y2="52" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="40" cy="48" rx="4" ry="3" fill="#1F1937" />
      <ellipse cx="40" cy="47" rx="2" ry="1.5" fill="#FB7185" />
    </svg>
  );
}

function BonusBug() {
  return (
    <svg width="85" height="85" viewBox="0 0 85 85">
      <ellipse cx="42" cy="77" rx="22" ry="3" fill="black" opacity="0.3" />
      <ellipse cx="42" cy="44" rx="28" ry="22" fill="#FBBF24" />
      <ellipse cx="42" cy="38" rx="22" ry="14" fill="#FCD34D" opacity="0.7" />
      <text x="42" y="46" textAnchor="middle" fontSize="20" fill="#92400E">{'\u2B50'}</text>
      <circle cx="32" cy="34" r="6" fill="white" />
      <circle cx="52" cy="34" r="6" fill="white" />
      <circle cx="32" cy="34" r="3" fill="black" />
      <circle cx="52" cy="34" r="3" fill="black" />
      <text x="12" y="20" fontSize="14" fill="#FCD34D">{'\u2728'}</text>
      <text x="68" y="20" fontSize="14" fill="#FCD34D">{'\u2728'}</text>
      <text x="40" y="14" fontSize="12" fill="#FCD34D">{'\u2728'}</text>
      <line x1="32" y1="22" x2="26" y2="10" stroke="#92400E" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="52" y1="22" x2="58" y2="10" stroke="#92400E" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="26" cy="10" r="3" fill="#FCD34D" />
      <circle cx="58" cy="10" r="3" fill="#FCD34D" />
    </svg>
  );
}

function TrapBug() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <ellipse cx="40" cy="72" rx="22" ry="3" fill="black" opacity="0.3" />
      <rect x="20" y="28" width="40" height="32" rx="6" fill="#06B6D4" />
      <rect x="24" y="20" width="32" height="16" rx="4" fill="#06B6D4" />
      <circle cx="32" cy="28" r="3" fill="#FCD34D" />
      <circle cx="48" cy="28" r="3" fill="#FCD34D" />
      <rect x="34" y="32" width="12" height="2" rx="1" fill="#FCD34D" />
      <rect x="22" y="46" width="36" height="10" rx="2" fill="white" />
      <text x="40" y="53" textAnchor="middle" fontSize="6" fill="#06B6D4" fontWeight="bold" fontFamily="monospace">page_view</text>
      <line x1="30" y1="20" x2="28" y2="12" stroke="#0E7490" strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="20" x2="52" y2="12" stroke="#0E7490" strokeWidth="2" strokeLinecap="round" />
      <circle cx="28" cy="12" r="2" fill="#FCD34D" />
      <circle cx="52" cy="12" r="2" fill="#FCD34D" />
    </svg>
  );
}
