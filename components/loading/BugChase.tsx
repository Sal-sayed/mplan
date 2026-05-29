'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function BugChase() {
  const prefersReducedMotion = useReducedMotion();
  const [dim, setDim] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    const update = () => setDim({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (prefersReducedMotion) return null;

  const { w, h } = dim;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[5]">

      {/* ─── BUG (runs first) ─── */}
      <motion.div
        className="absolute"
        initial={{ x: -60, y: 60 }}
        animate={{
          x: [-60, w + 60, w + 60, w + 60, -60, -60],
          y: [60, 60, h - 120, h - 120, h - 120, 60],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear', times: [0, 0.25, 0.3, 0.5, 0.75, 1] }}
      >
        <motion.div
          animate={{ rotate: [0, -3, 3, -3, 3, 0] }}
          transition={{ duration: 0.3, repeat: Infinity }}
        >
          <svg width="60" height="50" viewBox="0 0 60 50">
            {/* Bug body */}
            <ellipse cx="30" cy="25" rx="18" ry="13" fill="#10B981" />
            <ellipse cx="30" cy="22" rx="14" ry="9" fill="#34D399" opacity="0.6" />

            {/* Scared eyes */}
            <circle cx="22" cy="20" r="4" fill="white" />
            <circle cx="38" cy="20" r="4" fill="white" />
            <circle cx="22" cy="21" r="2" fill="black" />
            <circle cx="38" cy="21" r="2" fill="black" />

            {/* Antennae */}
            <line x1="22" y1="14" x2="18" y2="6" stroke="#065F46" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="38" y1="14" x2="42" y2="6" stroke="#065F46" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="18" cy="6" r="2" fill="#10B981" />
            <circle cx="42" cy="6" r="2" fill="#10B981" />

            {/* Legs */}
            <line x1="14" y1="28" x2="8" y2="32" stroke="#065F46" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="14" y1="32" x2="8" y2="38" stroke="#065F46" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="46" y1="28" x2="52" y2="32" stroke="#065F46" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="46" y1="32" x2="52" y2="38" stroke="#065F46" strokeWidth="1.5" strokeLinecap="round" />

            {/* Scared mouth */}
            <ellipse cx="30" cy="30" rx="3" ry="2" fill="black" />

            {/* AAAH! speech bubble */}
            <g transform="translate(40, -5)">
              <ellipse cx="10" cy="5" rx="14" ry="8" fill="white" />
              <text x="10" y="8" textAnchor="middle" fontSize="9" fill="#EF4444" fontWeight="bold">AAAH!</text>
            </g>

            {/* Speed lines */}
            <line x1="-2" y1="20" x2="-10" y2="18" stroke="white" strokeWidth="1" opacity="0.5" />
            <line x1="-2" y1="25" x2="-12" y2="25" stroke="white" strokeWidth="1" opacity="0.5" />
            <line x1="-2" y1="30" x2="-10" y2="32" stroke="white" strokeWidth="1" opacity="0.5" />
          </svg>
        </motion.div>
      </motion.div>

      {/* ─── HAMMER (chases bug, 1.5s behind) ─── */}
      <motion.div
        className="absolute"
        initial={{ x: -120, y: 60 }}
        animate={{
          x: [-120, w + 60, w + 60, w + 60, -120, -120],
          y: [60, 60, h - 120, h - 120, h - 120, 60],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear', times: [0, 0.25, 0.3, 0.5, 0.75, 1], delay: 1.5 }}
      >
        <motion.div
          animate={{ rotate: [-20, 20, -20] }}
          transition={{ duration: 0.4, repeat: Infinity }}
          style={{ transformOrigin: '30px 60px' }}
        >
          <svg width="70" height="80" viewBox="0 0 70 80">
            {/* Hand */}
            <circle cx="30" cy="60" r="10" fill="#FCD8B4" />
            <circle cx="30" cy="60" r="10" fill="none" stroke="#1F2937" strokeWidth="1" />

            {/* Arm */}
            <rect x="26" y="45" width="8" height="20" fill="#FCD8B4" stroke="#1F2937" strokeWidth="1" />

            {/* Handle */}
            <rect x="24" y="25" width="12" height="25" rx="2" fill="#92400E" stroke="#1F2937" strokeWidth="1" />
            <rect x="26" y="27" width="2" height="20" fill="#78350F" />

            {/* Hammer head */}
            <rect x="10" y="10" width="40" height="22" rx="3" fill="#6B7280" stroke="#1F2937" strokeWidth="1.5" />
            <rect x="10" y="10" width="40" height="6" fill="#9CA3AF" />
            <rect x="14" y="14" width="4" height="14" fill="#374151" opacity="0.6" />
            <rect x="42" y="14" width="4" height="14" fill="#374151" opacity="0.6" />

            {/* Determined eyes */}
            <circle cx="20" cy="40" r="1.5" fill="white" />
            <circle cx="40" cy="40" r="1.5" fill="white" />

            {/* Motion lines */}
            <line x1="55" y1="20" x2="65" y2="18" stroke="#FCD34D" strokeWidth="1.5" opacity="0.6" />
            <line x1="55" y1="25" x2="65" y2="25" stroke="#FCD34D" strokeWidth="1.5" opacity="0.6" />
          </svg>
        </motion.div>
      </motion.div>

      {/* ─── BOINK! at right side ─── */}
      <motion.div
        className="absolute"
        style={{ right: 80, top: 60 }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 0, 1, 0], scale: [0, 0, 1.5, 0] }}
        transition={{ duration: 12, repeat: Infinity, times: [0, 0.22, 0.25, 0.28] }}
      >
        <div className="text-yellow-300 font-bold text-3xl drop-shadow-lg" style={{ fontFamily: 'Impact, sans-serif' }}>
          BOINK!
        </div>
      </motion.div>

      {/* ─── POW! at left side ─── */}
      <motion.div
        className="absolute"
        style={{ left: 80, bottom: 120 }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 0, 1, 0], scale: [0, 0, 1.5, 0] }}
        transition={{ duration: 12, repeat: Infinity, times: [0, 0.72, 0.75, 0.78] }}
      >
        <div className="text-pink-400 font-bold text-3xl drop-shadow-lg" style={{ fontFamily: 'Impact, sans-serif' }}>
          POW!
        </div>
      </motion.div>

      {/* ─── Bug taunt ─── */}
      <motion.div
        className="absolute"
        style={{ left: '50%', top: '30%' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0], y: [0, 0, -20, -40, -60] }}
        transition={{ duration: 12, repeat: Infinity, times: [0, 0.45, 0.48, 0.52, 0.55] }}
      >
        <div className="bg-white rounded-lg px-3 py-1 text-xs font-medium text-emerald-700 shadow-lg whitespace-nowrap">
          Catch me if you can! &#x1f41b;&#x1f4a8;
        </div>
      </motion.div>

    </div>
  );
}
