'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Props {
  stage: number;
  progress: number;
}

/*
  Realistic silhouette hand — enters from the bottom-right,
  performs stage-specific gestures (swipe, tap, drag, push).
  Only the hand/wrist is visible — no arm, no body.
*/
export default function GestureHand({ stage, progress }: Props) {
  const [t, setT] = useState(0);

  useEffect(() => {
    let frame: number;
    const tick = () => { setT(Date.now() / 1000); frame = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  // Breathing micro-motion
  const breatheY = Math.sin(t * 1.2) * 2;
  const breatheR = Math.sin(t * 0.8) * 0.5;

  // Stage-specific gesture positions
  const gestures = [
    { x: 0, y: 0, rotate: -5, finger: 0 },     // scanning: pointing/tapping
    { x: -15, y: -8, rotate: -12, finger: 1 },  // audit: swiping left
    { x: 10, y: -15, rotate: 3, finger: 2 },    // building: dragging up
    { x: 20, y: 5, rotate: 8, finger: 3 },      // delivery: pushing forward
  ];
  const g = gestures[stage] || gestures[0];

  // Gesture animation cycle (slow, deliberate movement)
  const cycleT = t * 0.4;
  const gestureX = g.x + Math.sin(cycleT) * 12;
  const gestureY = g.y + breatheY + Math.cos(cycleT * 0.7) * 6;
  const gestureR = g.rotate + breatheR + Math.sin(cycleT * 0.5) * 2;

  // Finger splay for different actions
  const fingerSplay = [
    Math.sin(cycleT * 1.2) * 3,           // index
    Math.sin(cycleT * 1.2 + 0.3) * 2.5,   // middle
    Math.sin(cycleT * 1.2 + 0.6) * 2,     // ring
    Math.sin(cycleT * 1.2 + 0.9) * 1.5,   // pinky
  ];

  // Touch ripple position (where finger tip is)
  const tipX = 95 + gestureX;
  const tipY = 45 + gestureY;

  return (
    <motion.div
      className="absolute bottom-0 right-0 pointer-events-none"
      initial={{ opacity: 0, y: 60, x: 40 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: 1.5, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
      style={{ width: 280, height: 220 }}
    >
      {/* Touch ripple effect */}
      <motion.div
        className="absolute"
        style={{ left: tipX, top: tipY }}
        animate={{
          scale: [0.5, 1.5, 0.5],
          opacity: [0.3, 0, 0.3],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="w-8 h-8 -ml-4 -mt-4 rounded-full border border-blue-400/20" />
      </motion.div>

      {/* Secondary ripple (delayed) */}
      <motion.div
        className="absolute"
        style={{ left: tipX, top: tipY }}
        animate={{
          scale: [0.3, 2, 0.3],
          opacity: [0.15, 0, 0.15],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      >
        <div className="w-12 h-12 -ml-6 -mt-6 rounded-full border border-blue-400/10" />
      </motion.div>

      <svg
        width="280" height="220" viewBox="0 0 280 220"
        style={{
          transform: `translate(${gestureX}px, ${gestureY}px) rotate(${gestureR}deg)`,
          filter: 'drop-shadow(0 5px 25px rgba(0,0,0,0.5))',
          transition: 'transform 0.15s ease-out',
        }}
      >
        <defs>
          {/* Hand gradient — dark silhouette with subtle skin tone edge */}
          <linearGradient id="handGrad" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#1a1a2e" />
            <stop offset="60%" stopColor="#12121f" />
            <stop offset="100%" stopColor="#0a0a15" />
          </linearGradient>
          {/* Rim light */}
          <linearGradient id="rimGrad" x1="0" y1="0" x2="1" y2="0.5">
            <stop offset="0%" stopColor="rgba(100,160,255,0.25)" />
            <stop offset="100%" stopColor="rgba(100,160,255,0)" />
          </linearGradient>
          {/* Volumetric glow on fingertips */}
          <radialGradient id="tipGlow">
            <stop offset="0%" stopColor="rgba(96,165,250,0.3)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="handBlur">
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>

        {/* Wrist / sleeve (enters from bottom-right) */}
        <path
          d={`M 200,220 L 195,180 Q 190,160 170,145 L 165,140`}
          fill="url(#handGrad)" stroke="none"
        />
        {/* Sleeve cuff accent */}
        <path
          d="M 185,200 Q 200,195 210,205"
          fill="none" stroke="rgba(80,120,200,0.15)" strokeWidth="1"
        />

        {/* Palm */}
        <path
          d={`M 110,140 Q 100,120 95,100 Q 92,85 98,75
              L 105,60 Q 108,52 115,50
              Q 125,48 130,55 L 135,65
              Q 138,58 145,55 Q 152,52 155,58 L 158,70
              Q 162,62 168,60 Q 175,58 178,65 L 178,80
              Q 183,75 188,78 Q 192,82 190,92 L 185,110
              Q 180,130 175,142 L 170,145
              Q 160,148 150,145 Q 135,142 120,142 Z`}
          fill="url(#handGrad)"
          stroke="rgba(100,160,255,0.08)" strokeWidth="0.5"
        />

        {/* Finger details — knuckle lines */}
        <g opacity="0.06" stroke="rgba(180,200,255,1)" strokeWidth="0.5" fill="none">
          <path d="M 103,82 Q 108,80 113,82" />
          <path d="M 135,72 Q 140,70 145,72" />
          <path d="M 157,73 Q 162,71 167,73" />
          <path d="M 180,85 Q 184,83 188,86" />
        </g>

        {/* Index finger — animated splay */}
        <g transform={`rotate(${fingerSplay[0]}, 105, 75)`}>
          {/* Fingertip glow */}
          <circle cx="98" cy="52" r="10" fill="url(#tipGlow)">
            <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* Middle finger tip glow */}
        <g transform={`rotate(${fingerSplay[1]}, 135, 65)`}>
          <circle cx="130" cy="48" r="8" fill="url(#tipGlow)" opacity="0.4">
            <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2.5s" repeatCount="indefinite" begin="0.3s" />
          </circle>
        </g>

        {/* Rim light along hand edge */}
        <path
          d={`M 95,100 Q 92,85 98,75 L 105,60 Q 108,52 115,50`}
          fill="none" stroke="rgba(100,160,255,0.12)" strokeWidth="1.5"
          filter="url(#handBlur)"
        />

        {/* Bottom rim light */}
        <path
          d="M 120,142 Q 135,145 150,145 Q 160,148 170,145"
          fill="none" stroke="rgba(100,160,255,0.08)" strokeWidth="1"
        />

        {/* Holographic interaction line from fingertip */}
        <motion.line
          x1="98" y1="52"
          x2={98 + Math.cos(cycleT) * 35}
          y2={52 + Math.sin(cycleT * 0.8) * 20 - 30}
          stroke="rgba(96,165,250,0.15)"
          strokeWidth="0.8"
          strokeDasharray="3,4"
        />

        {/* Small floating data point from finger */}
        <motion.circle
          cx={98 + Math.cos(cycleT) * 35}
          cy={52 + Math.sin(cycleT * 0.8) * 20 - 30}
          r="2"
          fill="rgba(96,165,250,0.4)"
        >
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.5s" repeatCount="indefinite" />
        </motion.circle>
      </svg>

      {/* Ambient shadow under hand */}
      <div
        className="absolute bottom-4 right-8 w-32 h-6 rounded-full opacity-20 blur-xl"
        style={{ background: 'rgba(0,0,0,0.8)' }}
      />
    </motion.div>
  );
}
