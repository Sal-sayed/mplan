'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const FUNNY_CAPTIONS = [
  "We code, you sip coffee. Deal? \u2615",
  "Typing faster than your last 'urgent' email",
  "Fueled by caffeine and questionable hope",
  "47 events tracked. 1,247 to go. Just kidding (mostly).",
  "Don't worry, we've done this before",
  "Our keyboard is on fire \ud83d\udd25 (not literally, OSHA)",
  "Plot twist: the analytics were inside us all along",
  "Compiling brilliance. Please hold.",
  "Stack Overflow open in 12 tabs",
  "Achievement unlocked: didn't break production",
  "Translating 'make it better' into actual code",
  "If this takes too long, blame the intern (just kidding, no interns here)",
  "Our developer is wearing socks with sandals. We're sorry.",
  "GA4 event names approved by 3 cats and a goldfish",
  "Adding extra magic dust \u2728 (regulated by the FDA)",
  "Definitely not just hitting 'save' really fast",
  "Hot take: bounce rate is overrated. Cold take: tracking it anyway.",
  "Reticulating splines... wait wrong product",
  "Loading: 200 IQ analytics moves",
  "Our coder hasn't blinked in 6 minutes. Send help.",
];

const TERMINAL_LINES = [
  { color: '#10B981', text: '$ npm run analyze-tracking' },
  { color: '#A78BFA', text: '> scanning website structure...' },
  { color: '#A78BFA', text: '> reading buttons, forms, CTAs...' },
  { color: '#FCD34D', text: '> events detected: 23' },
  { color: '#FCD34D', text: '> pixels found: GA4, Meta, GTM' },
  { color: '#10B981', text: '> auditing data quality...' },
  { color: '#06B6D4', text: '> generating KPIs...' },
  { color: '#06B6D4', text: '> writing event schemas...' },
  { color: '#10B981', text: '> building Excel workbook...' },
  { color: '#FCD34D', text: '> compiling magic \u2728' },
];

export default function SpeedCoder() {
  const [captionIdx, setCaptionIdx] = useState(0);
  const [terminalIdx, setTerminalIdx] = useState(0);

  useEffect(() => {
    const capInterval = setInterval(() => {
      setCaptionIdx((i) => (i + 1) % FUNNY_CAPTIONS.length);
    }, 4000);
    return () => clearInterval(capInterval);
  }, []);

  useEffect(() => {
    const termInterval = setInterval(() => {
      setTerminalIdx((i) => (i + 1) % TERMINAL_LINES.length);
    }, 1500);
    return () => clearInterval(termInterval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* The character */}
      <div className="relative">
        <svg width="280" height="220" viewBox="0 0 280 220" className="drop-shadow-2xl">

          {/* Floor shadow */}
          <ellipse cx="140" cy="210" rx="70" ry="5" fill="black" opacity="0.4" />

          {/* Desk */}
          <rect x="40" y="160" width="200" height="6" rx="2" fill="#1F2937" />
          <rect x="50" y="166" width="6" height="40" fill="#374151" />
          <rect x="224" y="166" width="6" height="40" fill="#374151" />

          {/* Laptop base */}
          <rect x="80" y="145" width="120" height="20" rx="3" fill="#1F2937" />
          <rect x="80" y="145" width="120" height="3" fill="#374151" />

          {/* Laptop screen */}
          <rect x="85" y="90" width="110" height="60" rx="4" fill="#0F1419" />
          <rect x="90" y="95" width="100" height="50" fill="#000814" />

          {/* Terminal text */}
          <text x="95" y="108" fontSize="6" fill={TERMINAL_LINES[terminalIdx].color} fontFamily="monospace">
            {TERMINAL_LINES[terminalIdx].text}
          </text>
          <text x="95" y="118" fontSize="6" fill={TERMINAL_LINES[(terminalIdx + 1) % TERMINAL_LINES.length].color} fontFamily="monospace" opacity="0.7">
            {TERMINAL_LINES[(terminalIdx + 1) % TERMINAL_LINES.length].text}
          </text>
          <text x="95" y="128" fontSize="6" fill={TERMINAL_LINES[(terminalIdx + 2) % TERMINAL_LINES.length].color} fontFamily="monospace" opacity="0.5">
            {TERMINAL_LINES[(terminalIdx + 2) % TERMINAL_LINES.length].text}
          </text>
          <text x="95" y="138" fontSize="6" fill="#10B981" fontFamily="monospace">
            {'$ _'}
          </text>

          {/* Person body */}
          <rect x="115" y="105" width="50" height="40" rx="6" fill="#7C3AED" />
          <rect x="115" y="105" width="50" height="6" fill="#6D28D9" />

          {/* Head */}
          <circle cx="140" cy="70" r="22" fill="#FCD8B4" />

          {/* Hair */}
          <path d="M 120 55 Q 122 38 140 35 Q 158 38 160 55 Q 158 50 152 50 Q 148 48 145 50 Q 142 47 140 48 Q 138 47 135 50 Q 132 48 128 50 Q 122 50 120 55 Z" fill="#1F1937" />
          <path d="M 130 45 L 130 38 M 135 42 L 135 35 M 145 42 L 145 35 M 150 45 L 150 38" stroke="#1F1937" strokeWidth="1.5" strokeLinecap="round" />

          {/* Glasses */}
          <circle cx="132" cy="70" r="6" fill="white" opacity="0.95" />
          <circle cx="148" cy="70" r="6" fill="white" opacity="0.95" />
          <circle cx="132" cy="70" r="6" fill="none" stroke="#1F2937" strokeWidth="1.5" />
          <circle cx="148" cy="70" r="6" fill="none" stroke="#1F2937" strokeWidth="1.5" />
          <line x1="138" y1="70" x2="142" y2="70" stroke="#1F2937" strokeWidth="1.5" />

          {/* Eyes — blinking */}
          <motion.g
            animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
            transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.94, 0.96, 1] }}
            style={{ transformOrigin: '140px 70px' }}
          >
            <circle cx="132" cy="71" r="2" fill="black" />
            <circle cx="148" cy="71" r="2" fill="black" />
          </motion.g>

          {/* Concentrated eyebrows */}
          <line x1="125" y1="56" x2="130" y2="55" stroke="#1F2937" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="150" y1="55" x2="155" y2="56" stroke="#1F2937" strokeWidth="1.5" strokeLinecap="round" />

          {/* Focused mouth */}
          <line x1="135" y1="83" x2="145" y2="83" stroke="#1F2937" strokeWidth="1.5" strokeLinecap="round" />

          {/* Left hand — typing fast */}
          <motion.g
            animate={{ y: [0, -3, 0, -2, 0, -3, 0] }}
            transition={{ duration: 0.3, repeat: Infinity }}
          >
            <ellipse cx="108" cy="143" rx="10" ry="5" fill="#FCD8B4" />
            <line x1="103" y1="140" x2="100" y2="138" stroke="#FCD8B4" strokeWidth="3" strokeLinecap="round" />
            <line x1="108" y1="138" x2="108" y2="136" stroke="#FCD8B4" strokeWidth="3" strokeLinecap="round" />
            <line x1="113" y1="139" x2="115" y2="137" stroke="#FCD8B4" strokeWidth="3" strokeLinecap="round" />
          </motion.g>

          {/* Right hand — typing fast (offset) */}
          <motion.g
            animate={{ y: [0, -2, 0, -3, 0, -2, 0] }}
            transition={{ duration: 0.3, repeat: Infinity, delay: 0.1 }}
          >
            <ellipse cx="172" cy="143" rx="10" ry="5" fill="#FCD8B4" />
            <line x1="167" y1="140" x2="165" y2="138" stroke="#FCD8B4" strokeWidth="3" strokeLinecap="round" />
            <line x1="172" y1="138" x2="172" y2="136" stroke="#FCD8B4" strokeWidth="3" strokeLinecap="round" />
            <line x1="177" y1="139" x2="180" y2="137" stroke="#FCD8B4" strokeWidth="3" strokeLinecap="round" />
          </motion.g>

          {/* Speed lines */}
          <motion.g
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.4, repeat: Infinity }}
          >
            <line x1="95" y1="143" x2="88" y2="141" stroke="white" strokeWidth="1" opacity="0.6" />
            <line x1="93" y1="148" x2="86" y2="148" stroke="white" strokeWidth="1" opacity="0.6" />
            <line x1="184" y1="143" x2="191" y2="141" stroke="white" strokeWidth="1" opacity="0.6" />
            <line x1="187" y1="148" x2="193" y2="148" stroke="white" strokeWidth="1" opacity="0.6" />
          </motion.g>

          {/* Coffee mug */}
          <rect x="210" y="148" width="15" height="18" rx="1" fill="white" />
          <rect x="212" y="150" width="11" height="13" fill="#78350F" />
          <path d="M 225 154 Q 230 154 230 160 Q 230 166 225 166" fill="none" stroke="white" strokeWidth="2" />

          {/* Coffee steam */}
          <motion.g
            animate={{ y: [-2, -15], opacity: [0.8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          >
            <path d="M 215 146 Q 215 142 217 138" stroke="#C4B5FD" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
            <path d="M 220 146 Q 220 142 218 138" stroke="#C4B5FD" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
          </motion.g>

          {/* Sweat drop */}
          <motion.ellipse
            cx="158" cy="58" rx="1.5" ry="2.5" fill="#60A5FA"
            animate={{ y: [0, 8, 8], opacity: [0, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          />
        </svg>
      </div>

      {/* Rotating funny caption */}
      <div className="h-14 flex items-center justify-center max-w-md px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={captionIdx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            className="text-center text-base text-white font-medium italic"
          >
            &ldquo;{FUNNY_CAPTIONS[captionIdx]}&rdquo;
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
