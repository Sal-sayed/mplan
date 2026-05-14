'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Particle {
  x: number; y: number; vy: number; size: number; opacity: number; drift: number; speed: number;
}

interface GlowNode {
  x: number; y: number; vx: number; vy: number; r: number; opacity: number; pulse: number; offset: number;
}

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const particlesRef = useRef<Particle[]>([]);
  const nodesRef = useRef<GlowNode[]>([]);
  const frameRef = useRef(0);
  const tRef = useRef(0);
  const startRef = useRef(Date.now());

  const init = useCallback((w: number, h: number) => {
    // Floating particles
    const pCount = Math.min(100, Math.floor((w * h) / 12000));
    const particles: Particle[] = [];
    for (let i = 0; i < pCount; i++) particles.push({
      x: Math.random() * w, y: Math.random() * h,
      vy: -(Math.random() * 0.3 + 0.1),
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.4 + 0.1,
      drift: (Math.random() - 0.5) * 0.3,
      speed: Math.random() * 0.5 + 0.5,
    });
    particlesRef.current = particles;

    // Network nodes
    const nCount = Math.min(40, Math.floor((w * h) / 35000));
    const nodes: GlowNode[] = [];
    for (let i = 0; i < nCount; i++) nodes.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
      r: Math.random() * 2 + 1, opacity: Math.random() * 0.4 + 0.15,
      pulse: Math.random() * 0.015 + 0.008, offset: Math.random() * Math.PI * 2,
    });
    nodesRef.current = nodes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; particlesRef.current = []; nodesRef.current = []; init(canvas.width, canvas.height); };
    resize(); window.addEventListener('resize', resize);

    const onMouse = (e: MouseEvent) => { mouseRef.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight }; };
    window.addEventListener('mousemove', onMouse);

    const animate = () => {
      if (!ctx || !canvas) return;
      const w = canvas.width, h = canvas.height;
      tRef.current += 0.016;
      const t = tRef.current;
      const elapsed = (Date.now() - startRef.current) / 1000;
      const mx = mouseRef.current.x, my = mouseRef.current.y;

      ctx.clearRect(0, 0, w, h);

      // Parallax offset from mouse
      const px = (mx - 0.5) * 20;
      const py = (my - 0.5) * 15;

      // ─── CITYSCAPE SILHOUETTE ───
      const buildings = [
        { x: 0.05, w: 0.04, h: 0.35 }, { x: 0.10, w: 0.035, h: 0.45 },
        { x: 0.15, w: 0.05, h: 0.55 }, { x: 0.21, w: 0.03, h: 0.40 },
        { x: 0.25, w: 0.045, h: 0.62 }, { x: 0.31, w: 0.04, h: 0.48 },
        { x: 0.36, w: 0.05, h: 0.70 }, { x: 0.42, w: 0.035, h: 0.52 },
        { x: 0.46, w: 0.04, h: 0.58 }, { x: 0.51, w: 0.05, h: 0.75 },
        { x: 0.57, w: 0.04, h: 0.50 }, { x: 0.62, w: 0.045, h: 0.65 },
        { x: 0.67, w: 0.035, h: 0.42 }, { x: 0.72, w: 0.05, h: 0.60 },
        { x: 0.78, w: 0.04, h: 0.55 }, { x: 0.83, w: 0.045, h: 0.68 },
        { x: 0.88, w: 0.035, h: 0.45 }, { x: 0.93, w: 0.05, h: 0.38 },
      ];

      for (const b of buildings) {
        const bx = b.x * w + px * 0.5;
        const bw = b.w * w;
        const bh = b.h * h * 0.5;
        const by = h - bh + py * 0.3;

        // Building body
        const bGrad = ctx.createLinearGradient(bx, by, bx, h);
        bGrad.addColorStop(0, 'rgba(20,30,60,0.6)');
        bGrad.addColorStop(0.3, 'rgba(15,23,50,0.5)');
        bGrad.addColorStop(1, 'rgba(10,17,35,0.3)');
        ctx.fillStyle = bGrad;
        ctx.fillRect(bx, by, bw, bh);

        // Glass reflection sweep
        const sweepX = ((t * 15 + b.x * 500) % (bw + 30)) - 15;
        const rGrad = ctx.createLinearGradient(bx + sweepX, by, bx + sweepX + 15, by);
        rGrad.addColorStop(0, 'rgba(100,160,255,0)');
        rGrad.addColorStop(0.5, 'rgba(100,160,255,0.06)');
        rGrad.addColorStop(1, 'rgba(100,160,255,0)');
        ctx.fillStyle = rGrad;
        ctx.fillRect(bx, by, bw, bh);

        // Window lights
        const wRows = Math.floor(bh / 18);
        const wCols = Math.floor(bw / 10);
        for (let r = 0; r < wRows; r++) {
          for (let c = 0; c < wCols; c++) {
            if (Math.sin(b.x * 100 + r * 7 + c * 13) > 0.3) {
              const wx = bx + c * 10 + 3;
              const wy = by + r * 18 + 6;
              const flicker = 0.15 + Math.sin(t * 0.5 + r + c * b.x * 50) * 0.08;
              ctx.fillStyle = `rgba(180,200,255,${flicker})`;
              ctx.fillRect(wx, wy, 5, 8);
            }
          }
        }
      }

      // ─── GROWTH BAR CHART ───
      const barCount = 12;
      const barSpacing = w * 0.06;
      const barStartX = w * 0.15 + px * 0.8;
      const barBaseY = h * 0.85 + py * 0.4;

      for (let i = 0; i < barCount; i++) {
        const growth = Math.pow((i + 1) / barCount, 1.3);
        const maxH = h * 0.45 * growth;
        const introScale = Math.min(1, Math.max(0, (elapsed - 0.5 - i * 0.12) * 2));
        const breathe = 1 + Math.sin(t * 0.8 + i * 0.5) * 0.03;
        const barH = maxH * introScale * breathe;
        const bx = barStartX + i * barSpacing;
        const by = barBaseY - barH;
        const bw = barSpacing * 0.55;

        // Bar gradient (glass effect)
        const grad = ctx.createLinearGradient(bx, by, bx, barBaseY);
        grad.addColorStop(0, `rgba(60,140,255,${0.25 * introScale})`);
        grad.addColorStop(0.4, `rgba(40,100,220,${0.18 * introScale})`);
        grad.addColorStop(1, `rgba(20,60,160,${0.08 * introScale})`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, barH, [4, 4, 0, 0]);
        ctx.fill();

        // Glass edge glow
        const edgeGrad = ctx.createLinearGradient(bx, by, bx + bw, by);
        edgeGrad.addColorStop(0, `rgba(100,180,255,${0.3 * introScale})`);
        edgeGrad.addColorStop(0.1, `rgba(100,180,255,${0.05 * introScale})`);
        edgeGrad.addColorStop(0.9, `rgba(100,180,255,${0.05 * introScale})`);
        edgeGrad.addColorStop(1, `rgba(100,180,255,${0.2 * introScale})`);
        ctx.fillStyle = edgeGrad;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, barH, [4, 4, 0, 0]);
        ctx.fill();

        // Top glow cap
        const capGlow = ctx.createRadialGradient(bx + bw / 2, by, 0, bx + bw / 2, by, bw);
        capGlow.addColorStop(0, `rgba(100,200,255,${0.3 * introScale})`);
        capGlow.addColorStop(1, 'rgba(100,200,255,0)');
        ctx.fillStyle = capGlow;
        ctx.beginPath(); ctx.arc(bx + bw / 2, by, bw, 0, Math.PI * 2); ctx.fill();

        // Moving reflection on bar
        const refY = by + ((t * 30 + i * 20) % barH);
        if (refY > by && refY < barBaseY) {
          const refGrad = ctx.createLinearGradient(bx, refY - 10, bx, refY + 10);
          refGrad.addColorStop(0, 'rgba(150,200,255,0)');
          refGrad.addColorStop(0.5, `rgba(150,200,255,${0.08 * introScale})`);
          refGrad.addColorStop(1, 'rgba(150,200,255,0)');
          ctx.fillStyle = refGrad;
          ctx.fillRect(bx, refY - 10, bw, 20);
        }
      }

      // ─── GROWTH ARROW ───
      const arrowIntro = Math.min(1, Math.max(0, (elapsed - 1.5) * 0.8));
      if (arrowIntro > 0) {
        ctx.save();
        ctx.beginPath();
        const arrowPts: [number, number][] = [];
        const steps = 80;
        for (let i = 0; i <= steps; i++) {
          const frac = i / steps;
          const ax = w * 0.12 + frac * w * 0.72 + px * 1.2;
          const ay = h * 0.82 - frac * h * 0.55 - Math.pow(frac, 1.5) * h * 0.1 + py * 0.6
            + Math.sin(frac * Math.PI * 2 + t * 0.3) * 8;
          arrowPts.push([ax, ay]);
          if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        }

        // Arrow glow trail
        const drawFrac = arrowIntro;
        const drawSteps = Math.floor(drawFrac * steps);

        // Wide glow
        ctx.beginPath();
        for (let i = 0; i <= drawSteps; i++) {
          const [ax, ay] = arrowPts[i];
          if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        }
        ctx.strokeStyle = `rgba(255,255,255,${0.06 * arrowIntro})`;
        ctx.lineWidth = 20;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.stroke();

        // Medium glow
        ctx.beginPath();
        for (let i = 0; i <= drawSteps; i++) {
          const [ax, ay] = arrowPts[i];
          if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        }
        ctx.strokeStyle = `rgba(120,180,255,${0.15 * arrowIntro})`;
        ctx.lineWidth = 8;
        ctx.stroke();

        // Core line
        ctx.beginPath();
        for (let i = 0; i <= drawSteps; i++) {
          const [ax, ay] = arrowPts[i];
          if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        }
        ctx.strokeStyle = `rgba(200,230,255,${0.5 * arrowIntro})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Arrowhead
        if (drawSteps >= 2) {
          const [tx, ty] = arrowPts[drawSteps];
          const [px2, py2] = arrowPts[drawSteps - 2];
          const angle = Math.atan2(ty - py2, tx - px2);
          const headLen = 18;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - headLen * Math.cos(angle - 0.4), ty - headLen * Math.sin(angle - 0.4));
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - headLen * Math.cos(angle + 0.4), ty - headLen * Math.sin(angle + 0.4));
          ctx.strokeStyle = `rgba(200,230,255,${0.6 * arrowIntro})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Arrowhead glow pulse
          const pulseR = 15 + Math.sin(t * 3) * 5;
          const headGlow = ctx.createRadialGradient(tx, ty, 0, tx, ty, pulseR);
          headGlow.addColorStop(0, `rgba(150,210,255,${0.35 * arrowIntro})`);
          headGlow.addColorStop(1, 'rgba(150,210,255,0)');
          ctx.fillStyle = headGlow;
          ctx.beginPath(); ctx.arc(tx, ty, pulseR, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }

      // ─── NETWORK CONNECTIONS ───
      const nodes = nodesRef.current;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            const a = (1 - dist / 160) * 0.1;
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(80,130,230,${a})`;
            ctx.lineWidth = 0.5; ctx.stroke();

            // Data pulse
            const pT = (t * 0.6 + i * 0.2 + j * 0.15) % 2.5;
            if (pT < 1) {
              const ppx = nodes[i].x + (nodes[j].x - nodes[i].x) * pT;
              const ppy = nodes[i].y + (nodes[j].y - nodes[i].y) * pT;
              ctx.beginPath(); ctx.arc(ppx, ppy, 1.2, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(100,180,255,${(pT < 0.5 ? pT * 2 : (1 - pT) * 2) * 0.5})`;
              ctx.fill();
            }
          }
        }
      }

      // ─── NETWORK NODES ───
      for (const n of nodes) {
        n.vx *= 0.99; n.vy *= 0.99; n.x += n.vx; n.y += n.vy;
        if (n.x < 0) n.x = w; if (n.x > w) n.x = 0; if (n.y < 0) n.y = h; if (n.y > h) n.y = 0;
        const pulse = Math.sin(t * n.pulse * 60 + n.offset) * 0.3 + 0.7;
        const r = n.r * pulse;

        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 5);
        glow.addColorStop(0, `rgba(80,140,240,${n.opacity * 0.2})`);
        glow.addColorStop(1, 'rgba(80,140,240,0)');
        ctx.beginPath(); ctx.arc(n.x, n.y, r * 5, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();

        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100,170,255,${n.opacity * pulse})`;
        ctx.fill();
      }

      // ─── FLOATING PARTICLES ───
      for (const p of particlesRef.current) {
        p.x += p.drift + Math.sin(t * 0.3 + p.x * 0.01) * 0.15;
        p.y += p.vy * p.speed;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;

        const flicker = p.opacity * (0.7 + Math.sin(t * 2 + p.x + p.y) * 0.3);
        ctx.beginPath(); ctx.arc(p.x + px * 0.3, p.y + py * 0.2, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,210,255,${flicker})`;
        ctx.fill();
      }

      // ─── SUNLIGHT BLOOM (top-right golden hour) ───
      const sunX = w * 0.82 + px * 2;
      const sunY = h * 0.08 + py * 1.5;
      const bloomR = 200 + Math.sin(t * 0.4) * 30;

      const bloom1 = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, bloomR);
      bloom1.addColorStop(0, 'rgba(255,200,100,0.08)');
      bloom1.addColorStop(0.4, 'rgba(255,180,80,0.03)');
      bloom1.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = bloom1;
      ctx.beginPath(); ctx.arc(sunX, sunY, bloomR, 0, Math.PI * 2); ctx.fill();

      const bloom2 = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, bloomR * 0.4);
      bloom2.addColorStop(0, 'rgba(255,220,150,0.12)');
      bloom2.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = bloom2;
      ctx.beginPath(); ctx.arc(sunX, sunY, bloomR * 0.4, 0, Math.PI * 2); ctx.fill();

      // Lens flare streaks
      for (let i = 0; i < 4; i++) {
        const fAngle = (i * Math.PI / 4) + t * 0.05;
        const fLen = 80 + Math.sin(t * 0.6 + i) * 30;
        ctx.beginPath();
        ctx.moveTo(sunX, sunY);
        ctx.lineTo(sunX + Math.cos(fAngle) * fLen, sunY + Math.sin(fAngle) * fLen);
        ctx.strokeStyle = `rgba(255,210,130,${0.04 + Math.sin(t + i) * 0.02})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // ─── ATMOSPHERIC HAZE ───
      const hazeGrad = ctx.createLinearGradient(0, h * 0.6, 0, h);
      hazeGrad.addColorStop(0, 'rgba(15,25,50,0)');
      hazeGrad.addColorStop(1, 'rgba(15,25,50,0.3)');
      ctx.fillStyle = hazeGrad;
      ctx.fillRect(0, h * 0.6, w, h * 0.4);

      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => { cancelAnimationFrame(frameRef.current); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', onMouse); };
  }, [init]);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" style={{ background: 'linear-gradient(170deg, #0d1525 0%, #0a1028 30%, #0e1530 50%, #091020 80%, #0b1322 100%)' }}>
      {/* Deep ambient orbs */}
      <div className="absolute top-[-5%] right-[10%] w-[700px] h-[700px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(60,100,200,0.08) 0%, transparent 60%)' }} />
      <div className="absolute bottom-[5%] left-[5%] w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(40,80,180,0.06) 0%, transparent 60%)' }} />
      <div className="absolute top-[20%] left-[30%] w-[400px] h-[400px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(100,140,240,0.05) 0%, transparent 60%)' }} />

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(100,160,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(100,160,255,1) 1px, transparent 1px)', backgroundSize: '70px 70px' }} />

      {/* Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-auto" />
    </div>
  );
}
