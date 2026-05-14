'use client';

import { motion } from 'framer-motion';

const nodes = [
  { x: 30, y: 30, delay: 0 },
  { x: 110, y: 25, delay: 0.15 },
  { x: 130, y: 70, delay: 0.3 },
  { x: 110, y: 115, delay: 0.45 },
  { x: 30, y: 115, delay: 0.6 },
  { x: 10, y: 70, delay: 0.75 },
];

export default function EventNetworkAnimation() {
  return (
    <div className="flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140">
        {nodes.map((node, i) => (
          <motion.line
            key={`line-${i}`}
            x1={node.x} y1={node.y} x2={70} y2={70}
            stroke="#8b5cf6"
            strokeWidth="1"
            strokeOpacity="0.3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: node.delay, times: [0, 0.3, 0.7, 1], ease: 'easeInOut' }}
          />
        ))}

        {nodes.map((node, i) => (
          <motion.circle
            key={`node-${i}`}
            cx={node.x} cy={node.y} r="4"
            fill="#8b5cf6"
            initial={{ scale: 0.6, opacity: 0.5 }}
            animate={{ scale: [0.6, 1.2, 0.6], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: node.delay, ease: 'easeInOut' }}
            style={{ transformOrigin: `${node.x}px ${node.y}px` }}
          />
        ))}

        <motion.circle
          cx="70" cy="70" r="8"
          fill="#8b5cf6"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '70px 70px' }}
        />

        {[0, 0.5, 1].map((delay, i) => (
          <motion.circle
            key={`ring-${i}`}
            cx="70" cy="70" r="8"
            fill="none" stroke="#8b5cf6" strokeWidth="1.5"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: [1, 4], opacity: [0.8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay }}
            style={{ transformOrigin: '70px 70px' }}
          />
        ))}
      </svg>
    </div>
  );
}
