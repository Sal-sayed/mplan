'use client';

import { useEffect, useRef } from 'react';

interface Props {
  stage: number;
  progress: number;
  size?: number;
}

export default function AICore({ stage, progress, size = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const cx = size / 2, cy = size / 2;

    // Stage color themes
    const themes = [
      { h: 215, s: 80, core: '#3b82f6', accent: '#60a5fa' },   // scanning: blue
      { h: 260, s: 70, core: '#7c3aed', accent: '#a78bfa' },   // audit: purple
      { h: 190, s: 80, core: '#0891b2', accent: '#22d3ee' },   // generate: cyan
      { h: 155, s: 70, core: '#059669', accent: '#34d399' },   // deliver: emerald
    ];
    const theme = themes[stage] || themes[0];

    // Orbiting particles
    interface Orb { angle: number; radius: number; speed: number; size: number; offset: number; layer: number; }
    const orbs: Orb[] = [];
    for (let i = 0; i < 40; i++) {
      orbs.push({
        angle: Math.random() * Math.PI * 2,
        radius: 35 + Math.random() * 55,
        speed: (0.2 + Math.random() * 0.6) * (Math.random() > 0.5 ? 1 : -1),
        size: 0.5 + Math.random() * 1.5,
        offset: Math.random() * Math.PI * 2,
        layer: Math.floor(Math.random() * 3),
      });
    }

    let t = 0;
    const animate = () => {
      t += 0.016;
      ctx.clearRect(0, 0, size, size);

      const pulse = Math.sin(t * 1.8) * 0.15 + 1;
      const breathe = Math.sin(t * 0.8) * 0.05 + 1;
      const progressNorm = progress / 100;

      // ─── OUTER SCANNING RINGS ───
      for (let ring = 3; ring >= 0; ring--) {
        const r = (38 + ring * 18) * breathe;
        const alpha = 0.04 + ring * 0.015;
        const rotation = t * (0.15 + ring * 0.08) * (ring % 2 === 0 ? 1 : -1);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);

        // Ring arc (partial, not full circle)
        const arcLen = Math.PI * (0.4 + progressNorm * 0.8) + ring * 0.3;
        const gapCount = 2 + ring;
        for (let g = 0; g < gapCount; g++) {
          const startAngle = (g * Math.PI * 2) / gapCount;
          ctx.beginPath();
          ctx.arc(0, 0, r, startAngle, startAngle + arcLen / gapCount);
          ctx.strokeStyle = `hsla(${theme.h}, ${theme.s}%, 65%, ${alpha + Math.sin(t * 2 + ring) * 0.02})`;
          ctx.lineWidth = ring === 0 ? 1.5 : 0.8;
          ctx.stroke();
        }

        // Tick marks on outermost ring
        if (ring === 3) {
          const tickCount = 36;
          for (let tk = 0; tk < tickCount; tk++) {
            const a = (tk / tickCount) * Math.PI * 2;
            const active = tk / tickCount < progressNorm;
            const len = tk % 3 === 0 ? 5 : 2.5;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            ctx.lineTo(Math.cos(a) * (r + len), Math.sin(a) * (r + len));
            ctx.strokeStyle = active
              ? `hsla(${theme.h}, ${theme.s}%, 70%, 0.4)`
              : 'rgba(255,255,255,0.05)';
            ctx.lineWidth = tk % 3 === 0 ? 1 : 0.5;
            ctx.stroke();
          }
        }

        ctx.restore();
      }

      // ─── SCANNING WAVE (expanding ring) ───
      const waveT = (t * 0.5) % 2;
      if (waveT < 1.5) {
        const waveR = waveT * 70;
        const waveAlpha = (1 - waveT / 1.5) * 0.12;
        ctx.beginPath();
        ctx.arc(cx, cy, waveR, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${theme.h}, ${theme.s}%, 65%, ${waveAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // ─── NEURAL CONNECTION LINES ───
      const nodeCount = 6;
      const nodes: [number, number][] = [];
      for (let i = 0; i < nodeCount; i++) {
        const a = (i / nodeCount) * Math.PI * 2 + t * 0.1;
        const r = 55 + Math.sin(t * 0.5 + i * 1.2) * 8;
        nodes.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }

      // Connect nodes to center
      nodes.forEach(([nx, ny], i) => {
        const active = i / nodeCount < progressNorm + 0.2;
        if (!active) return;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        // Bezier curve for organic feel
        const midX = (cx + nx) / 2 + Math.sin(t + i) * 8;
        const midY = (cy + ny) / 2 + Math.cos(t + i) * 8;
        ctx.quadraticCurveTo(midX, midY, nx, ny);
        ctx.strokeStyle = `hsla(${theme.h}, ${theme.s}%, 60%, 0.1)`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Data pulse along line
        const pulseT = (t * 1.2 + i * 0.5) % 1;
        const px = cx + (nx - cx) * pulseT + (midX - (cx + nx) / 2) * 2 * pulseT * (1 - pulseT);
        const py = cy + (ny - cy) * pulseT + (midY - (cy + ny) / 2) * 2 * pulseT * (1 - pulseT);
        const pAlpha = Math.sin(pulseT * Math.PI) * 0.6;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${theme.h}, ${theme.s}%, 75%, ${pAlpha})`;
        ctx.fill();

        // Node dot
        const nodeGlow = ctx.createRadialGradient(nx, ny, 0, nx, ny, 8);
        nodeGlow.addColorStop(0, `hsla(${theme.h}, ${theme.s}%, 70%, 0.25)`);
        nodeGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = nodeGlow;
        ctx.beginPath(); ctx.arc(nx, ny, 8, 0, Math.PI * 2); ctx.fill();

        ctx.beginPath();
        ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${theme.h}, ${theme.s}%, 75%, 0.5)`;
        ctx.fill();
      });

      // ─── ORBITING PARTICLES ───
      orbs.forEach((o) => {
        o.angle += o.speed * 0.016;
        const r = o.radius * breathe;
        const x = cx + Math.cos(o.angle) * r;
        const y = cy + Math.sin(o.angle) * r * 0.85; // slight ellipse
        const layerAlpha = [0.4, 0.25, 0.15][o.layer];
        const alpha = layerAlpha * (0.5 + Math.sin(t * 2 + o.offset) * 0.5);

        ctx.beginPath();
        ctx.arc(x, y, o.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${theme.h + o.layer * 15}, ${theme.s}%, 75%, ${alpha})`;
        ctx.fill();
      });

      // ─── INNER CORE ───
      // Outer glow
      const coreR = 18 * pulse;
      const outerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3);
      outerGlow.addColorStop(0, `hsla(${theme.h}, ${theme.s}%, 60%, 0.15)`);
      outerGlow.addColorStop(0.5, `hsla(${theme.h}, ${theme.s}%, 50%, 0.05)`);
      outerGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = outerGlow;
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2); ctx.fill();

      // Core body
      const coreGrad = ctx.createRadialGradient(cx, cy - 3, 0, cx, cy, coreR);
      coreGrad.addColorStop(0, `hsla(${theme.h}, ${theme.s}%, 85%, 0.6)`);
      coreGrad.addColorStop(0.5, `hsla(${theme.h}, ${theme.s}%, 60%, 0.3)`);
      coreGrad.addColorStop(1, `hsla(${theme.h}, ${theme.s}%, 40%, 0.1)`);
      ctx.fillStyle = coreGrad;
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();

      // Core inner highlight
      const innerGlow = ctx.createRadialGradient(cx, cy - 4, 0, cx, cy, coreR * 0.6);
      innerGlow.addColorStop(0, 'rgba(255,255,255,0.25)');
      innerGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = innerGlow;
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 0.6, 0, Math.PI * 2); ctx.fill();

      // Core ring
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${theme.h}, ${theme.s}%, 70%, ${0.3 + Math.sin(t * 3) * 0.1})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // ─── PROGRESS ARC (around core) ───
      const progR = coreR + 6;
      const progAngle = progressNorm * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, progR, -Math.PI / 2, -Math.PI / 2 + progAngle);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Progress head glow
      if (progressNorm > 0.02) {
        const headAngle = -Math.PI / 2 + progAngle;
        const hx = cx + Math.cos(headAngle) * progR;
        const hy = cy + Math.sin(headAngle) * progR;
        const headGlow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 8);
        headGlow.addColorStop(0, `hsla(${theme.h}, ${theme.s}%, 75%, 0.5)`);
        headGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = headGlow;
        ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2); ctx.fill();
      }

      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(frameRef.current);
  }, [stage, progress, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="shrink-0"
    />
  );
}
