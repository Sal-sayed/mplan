'use client';

import { useEffect, useRef } from 'react';

interface Props {
  stage: number;
  progress: number;
}

export default function ParticleField({ stage, progress }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const onMouse = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMouse);

    const hues = [215, 260, 190, 155];

    // Ambient particles
    interface P { x: number; y: number; vx: number; vy: number; size: number; alpha: number; hue: number; }
    const particles: P[] = [];
    const maxP = 60;

    // Constellation nodes (persistent)
    interface CN { x: number; y: number; vx: number; vy: number; }
    const constellations: CN[] = [];
    for (let i = 0; i < 25; i++) {
      constellations.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
      });
    }

    let t = 0;
    const animate = () => {
      t += 0.016;
      const w = canvas.width, h = canvas.height;
      const hue = hues[stage] || 215;
      const mx = mouseRef.current.x, my = mouseRef.current.y;

      ctx.clearRect(0, 0, w, h);

      // ─── ANIMATED GRID ───
      ctx.strokeStyle = `hsla(${hue}, 40%, 40%, 0.02)`;
      ctx.lineWidth = 0.5;
      const gridSize = 60;
      const gridOffsetX = (t * 3) % gridSize;
      const gridOffsetY = (t * 2) % gridSize;
      for (let gx = -gridSize + gridOffsetX; gx < w + gridSize; gx += gridSize) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (let gy = -gridSize + gridOffsetY; gy < h + gridSize; gy += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }

      // ─── CONSTELLATION NETWORK ───
      constellations.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0) n.x = w; if (n.x > w) n.x = 0;
        if (n.y < 0) n.y = h; if (n.y > h) n.y = 0;

        // Mouse repulsion
        const dx = n.x - mx, dy = n.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120 && dist > 0) {
          n.vx += (dx / dist) * 0.02;
          n.vy += (dy / dist) * 0.02;
        }
        n.vx *= 0.995; n.vy *= 0.995;
      });

      // Connections
      for (let i = 0; i < constellations.length; i++) {
        for (let j = i + 1; j < constellations.length; j++) {
          const a = constellations[i], b = constellations[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            const alpha = (1 - dist / 180) * 0.06;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `hsla(${hue}, 50%, 60%, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
        // Draw node
        const n = constellations[i];
        const pulse = 0.5 + Math.sin(t * 1.5 + i) * 0.3;
        ctx.beginPath(); ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 60%, 70%, ${0.15 * pulse})`;
        ctx.fill();
      }

      // Mouse-to-nodes connections
      if (mx > 0) {
        constellations.forEach((n) => {
          const dx = n.x - mx, dy = n.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(n.x, n.y);
            ctx.strokeStyle = `hsla(${hue}, 60%, 65%, ${(1 - dist / 150) * 0.08})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      }

      // ─── RISING PARTICLES ───
      if (particles.length < maxP && Math.random() < 0.2) {
        particles.push({
          x: Math.random() * w, y: h + 5,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -(Math.random() * 0.8 + 0.3),
          size: Math.random() * 1.5 + 0.3,
          alpha: Math.random() * 0.3 + 0.1,
          hue: hue + (Math.random() - 0.5) * 25,
        });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx + Math.sin(t * 0.5 + p.x * 0.005) * 0.15;
        p.y += p.vy;
        p.alpha -= 0.001;
        if (p.alpha <= 0 || p.y < -10) { particles.splice(i, 1); continue; }

        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 70%, 70%, ${p.alpha})`;
        ctx.fill();
      }

      // ─── VERTICAL DATA STREAMS ───
      const streams = 4;
      for (let s = 0; s < streams; s++) {
        const sx = w * (0.15 + s * 0.22);
        for (let d = 0; d < 12; d++) {
          const sy = ((t * (25 + s * 8) + d * 25) % (h + 30)) - 15;
          const alpha = Math.sin(d / 12 * Math.PI) * 0.04;
          ctx.beginPath(); ctx.arc(sx + Math.sin(t * 0.8 + d * 0.5) * 2, sy, 0.8, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 50%, 65%, ${alpha})`;
          ctx.fill();
        }
      }

      // ─── HORIZONTAL SCAN LINE ───
      const scanY = ((t * 20) % (h + 80)) - 40;
      const scanGrad = ctx.createLinearGradient(0, scanY - 1, 0, scanY + 1);
      scanGrad.addColorStop(0, 'transparent');
      scanGrad.addColorStop(0.5, `hsla(${hue}, 60%, 60%, 0.025)`);
      scanGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 40, w, 80);

      // ─── CURSOR GLOW ───
      if (mx > 0) {
        const cursorGlow = ctx.createRadialGradient(mx, my, 0, mx, my, 80);
        cursorGlow.addColorStop(0, `hsla(${hue}, 60%, 60%, 0.04)`);
        cursorGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = cursorGlow;
        ctx.beginPath(); ctx.arc(mx, my, 80, 0, Math.PI * 2); ctx.fill();
      }

      // ─── VOLUMETRIC LIGHT COLUMNS ───
      const colCount = 3;
      for (let c = 0; c < colCount; c++) {
        const colX = w * (0.2 + c * 0.3) + Math.sin(t * 0.3 + c) * 20;
        const colGrad = ctx.createLinearGradient(colX - 40, 0, colX + 40, 0);
        colGrad.addColorStop(0, 'transparent');
        colGrad.addColorStop(0.5, `hsla(${hue + c * 20}, 40%, 50%, ${0.008 + Math.sin(t * 0.5 + c) * 0.004})`);
        colGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = colGrad;
        ctx.fillRect(colX - 40, 0, 80, h);
      }

      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
    };
  }, [stage, progress]);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />;
}
