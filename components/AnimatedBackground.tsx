'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Particle {
  x: number; y: number; vy: number; size: number; opacity: number; drift: number; speed: number;
}

interface GlowNode {
  x: number; y: number; vx: number; vy: number; r: number; opacity: number; pulse: number; offset: number;
}

interface Ripple {
  x: number; y: number; r: number; maxR: number; opacity: number;
}

interface Spark {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number;
}

interface TrailPoint {
  x: number; y: number; age: number;
}

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5, px: 0, py: 0, speed: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const nodesRef = useRef<GlowNode[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const trailRef = useRef<TrailPoint[]>([]);
  const frameRef = useRef(0);
  const tRef = useRef(0);
  const startRef = useRef(Date.now());

  const init = useCallback((w: number, h: number) => {
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

    const onMouse = (e: MouseEvent) => {
      const prevX = mouseRef.current.px;
      const prevY = mouseRef.current.py;
      mouseRef.current.px = e.clientX;
      mouseRef.current.py = e.clientY;
      mouseRef.current.x = e.clientX / window.innerWidth;
      mouseRef.current.y = e.clientY / window.innerHeight;
      mouseRef.current.speed = Math.sqrt((e.clientX - prevX) ** 2 + (e.clientY - prevY) ** 2);

      // Add trail point
      trailRef.current.push({ x: e.clientX, y: e.clientY, age: 0 });
      if (trailRef.current.length > 30) trailRef.current.shift();
    };
    window.addEventListener('mousemove', onMouse);

    // Click/touch: spawn ripple + sparks
    const onClick = (e: MouseEvent | TouchEvent) => {
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const y = 'touches' in e ? e.touches[0].clientY : e.clientY;

      // Ripple
      ripplesRef.current.push({ x, y, r: 0, maxR: 120 + Math.random() * 80, opacity: 0.6 });

      // Sparks burst
      const sparkCount = 12 + Math.floor(Math.random() * 8);
      for (let i = 0; i < sparkCount; i++) {
        const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.5;
        const speed = 2 + Math.random() * 4;
        sparksRef.current.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: 40 + Math.random() * 30,
          size: 1 + Math.random() * 2,
          hue: 200 + Math.random() * 40,
        });
      }
    };
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('touchstart', onClick as EventListener);

    const animate = () => {
      if (!ctx || !canvas) return;
      const w = canvas.width, h = canvas.height;
      tRef.current += 0.016;
      const t = tRef.current;
      const elapsed = (Date.now() - startRef.current) / 1000;
      const mx = mouseRef.current.x, my = mouseRef.current.y;
      const mpx = mouseRef.current.px, mpy = mouseRef.current.py;
      const mSpeed = mouseRef.current.speed;

      ctx.clearRect(0, 0, w, h);

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

        const bGrad = ctx.createLinearGradient(bx, by, bx, h);
        bGrad.addColorStop(0, 'rgba(20,30,60,0.6)');
        bGrad.addColorStop(0.3, 'rgba(15,23,50,0.5)');
        bGrad.addColorStop(1, 'rgba(10,17,35,0.3)');
        ctx.fillStyle = bGrad;
        ctx.fillRect(bx, by, bw, bh);

        const sweepX = ((t * 15 + b.x * 500) % (bw + 30)) - 15;
        const rGrad = ctx.createLinearGradient(bx + sweepX, by, bx + sweepX + 15, by);
        rGrad.addColorStop(0, 'rgba(100,160,255,0)');
        rGrad.addColorStop(0.5, 'rgba(100,160,255,0.06)');
        rGrad.addColorStop(1, 'rgba(100,160,255,0)');
        ctx.fillStyle = rGrad;
        ctx.fillRect(bx, by, bw, bh);

        // Window lights — brighten near mouse
        const wRows = Math.floor(bh / 18);
        const wCols = Math.floor(bw / 10);
        for (let r = 0; r < wRows; r++) {
          for (let c = 0; c < wCols; c++) {
            if (Math.sin(b.x * 100 + r * 7 + c * 13) > 0.3) {
              const wx = bx + c * 10 + 3;
              const wy = by + r * 18 + 6;
              const dToMouse = Math.sqrt((wx - mpx) ** 2 + (wy - mpy) ** 2);
              const mouseBoost = Math.max(0, 1 - dToMouse / 200) * 0.25;
              const flicker = 0.15 + Math.sin(t * 0.5 + r + c * b.x * 50) * 0.08 + mouseBoost;
              const blue = mouseBoost > 0.05 ? Math.floor(200 + mouseBoost * 200) : 255;
              ctx.fillStyle = `rgba(180,${blue},255,${flicker})`;
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

        // Mouse proximity boost on bars
        const barCenterX = barStartX + i * barSpacing + barSpacing * 0.275;
        const dToBar = Math.abs(barCenterX - mpx);
        const barBoost = dToBar < 100 ? (1 - dToBar / 100) * 0.12 : 0;

        const barH = maxH * introScale * (breathe + barBoost);
        const bx = barStartX + i * barSpacing;
        const by = barBaseY - barH;
        const bw = barSpacing * 0.55;

        // Bar body — fade to transparent at bottom
        const grad = ctx.createLinearGradient(bx, by, bx, barBaseY);
        const boostAlpha = barBoost > 0 ? 0.1 : 0;
        grad.addColorStop(0, `rgba(60,140,255,${(0.25 + boostAlpha) * introScale})`);
        grad.addColorStop(0.5, `rgba(40,100,220,${(0.15 + boostAlpha * 0.5) * introScale})`);
        grad.addColorStop(0.85, `rgba(25,70,180,${0.06 * introScale})`);
        grad.addColorStop(1, 'rgba(15,40,120,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, barH, [4, 4, 0, 0]);
        ctx.fill();

        // Subtle side edges — only on top half, fade out
        const edgeGrad = ctx.createLinearGradient(bx, by, bx, by + barH * 0.6);
        edgeGrad.addColorStop(0, `rgba(100,180,255,${0.2 * introScale})`);
        edgeGrad.addColorStop(1, 'rgba(100,180,255,0)');
        ctx.strokeStyle = edgeGrad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx, by + 4); ctx.lineTo(bx, by + barH * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx + bw, by + 4); ctx.lineTo(bx + bw, by + barH * 0.6);
        ctx.stroke();

        // Top cap glow
        const capGlow = ctx.createRadialGradient(bx + bw / 2, by, 0, bx + bw / 2, by, bw);
        capGlow.addColorStop(0, `rgba(100,200,255,${(0.3 + barBoost * 2) * introScale})`);
        capGlow.addColorStop(1, 'rgba(100,200,255,0)');
        ctx.fillStyle = capGlow;
        ctx.beginPath(); ctx.arc(bx + bw / 2, by, bw, 0, Math.PI * 2); ctx.fill();

        // Moving shimmer reflection (only in upper portion)
        const refY = by + ((t * 30 + i * 20) % (barH * 0.7));
        if (refY > by && refY < by + barH * 0.7) {
          const refGrad = ctx.createLinearGradient(bx, refY - 10, bx, refY + 10);
          refGrad.addColorStop(0, 'rgba(150,200,255,0)');
          refGrad.addColorStop(0.5, `rgba(150,200,255,${0.06 * introScale})`);
          refGrad.addColorStop(1, 'rgba(150,200,255,0)');
          ctx.fillStyle = refGrad;
          ctx.fillRect(bx, refY - 10, bw, 20);
        }
      }

      // ─── ANIMATED BASELINE (replaces hard bottom edge) ───
      const baseLineY = barBaseY;
      const baseStartX = barStartX - barSpacing * 0.3;
      const baseEndX = barStartX + barCount * barSpacing + barSpacing * 0.3;

      // Flowing dots along the baseline
      const dotCount = 30;
      for (let i = 0; i < dotCount; i++) {
        const frac = ((t * 0.08 + i / dotCount) % 1);
        const dotX = baseStartX + frac * (baseEndX - baseStartX);
        const dotAlpha = Math.sin(frac * Math.PI) * 0.25;
        const dotSize = 1 + Math.sin(frac * Math.PI) * 1;
        ctx.beginPath();
        ctx.arc(dotX, baseLineY, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(80,140,220,${dotAlpha})`;
        ctx.fill();
      }

      // Soft gradient line (barely visible)
      const baseGrad = ctx.createLinearGradient(baseStartX, 0, baseEndX, 0);
      baseGrad.addColorStop(0, 'rgba(60,120,200,0)');
      baseGrad.addColorStop(0.15, 'rgba(60,120,200,0.06)');
      baseGrad.addColorStop(0.5, 'rgba(80,150,220,0.1)');
      baseGrad.addColorStop(0.85, 'rgba(60,120,200,0.06)');
      baseGrad.addColorStop(1, 'rgba(60,120,200,0)');
      ctx.strokeStyle = baseGrad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(baseStartX, baseLineY);
      ctx.lineTo(baseEndX, baseLineY);
      ctx.stroke();

      // Traveling pulse along baseline
      const pulsePos = ((t * 0.15) % 1);
      const pulseX = baseStartX + pulsePos * (baseEndX - baseStartX);
      const pulseGlow = ctx.createRadialGradient(pulseX, baseLineY, 0, pulseX, baseLineY, 40);
      pulseGlow.addColorStop(0, 'rgba(100,180,255,0.15)');
      pulseGlow.addColorStop(1, 'rgba(100,180,255,0)');
      ctx.fillStyle = pulseGlow;
      ctx.beginPath(); ctx.arc(pulseX, baseLineY, 40, 0, Math.PI * 2); ctx.fill();

      // (Growth arrow removed)

      // ─── NETWORK CONNECTIONS + MOUSE INTERACTION ───
      const nodes = nodesRef.current;
      const mouseRadius = 150;

      for (let i = 0; i < nodes.length; i++) {
        // Repel nodes from mouse
        const dxM = nodes[i].x - mpx;
        const dyM = nodes[i].y - mpy;
        const distM = Math.sqrt(dxM * dxM + dyM * dyM);
        if (distM < mouseRadius && distM > 0) {
          const force = (1 - distM / mouseRadius) * 0.8;
          nodes[i].vx += (dxM / distM) * force;
          nodes[i].vy += (dyM / distM) * force;
        }

        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            const a = (1 - dist / 160) * 0.1;
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(80,130,230,${a})`;
            ctx.lineWidth = 0.5; ctx.stroke();

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

        // Draw lines from mouse to nearby nodes
        if (distM < mouseRadius * 1.5) {
          const a = (1 - distM / (mouseRadius * 1.5)) * 0.2;
          ctx.beginPath(); ctx.moveTo(mpx, mpy); ctx.lineTo(nodes[i].x, nodes[i].y);
          ctx.strokeStyle = `rgba(100,180,255,${a})`;
          ctx.lineWidth = 0.8; ctx.stroke();
        }
      }

      // ─── NETWORK NODES ───
      for (const n of nodes) {
        n.vx *= 0.96; n.vy *= 0.96; n.x += n.vx; n.y += n.vy;
        if (n.x < 0) n.x = w; if (n.x > w) n.x = 0; if (n.y < 0) n.y = h; if (n.y > h) n.y = 0;
        const pulse = Math.sin(t * n.pulse * 60 + n.offset) * 0.3 + 0.7;

        // Boost glow near mouse
        const dToM = Math.sqrt((n.x - mpx) ** 2 + (n.y - mpy) ** 2);
        const mBoost = dToM < mouseRadius ? (1 - dToM / mouseRadius) * 0.5 : 0;
        const r = n.r * (pulse + mBoost);

        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 5);
        glow.addColorStop(0, `rgba(80,140,240,${(n.opacity + mBoost) * 0.2})`);
        glow.addColorStop(1, 'rgba(80,140,240,0)');
        ctx.beginPath(); ctx.arc(n.x, n.y, r * 5, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();

        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100,170,255,${(n.opacity + mBoost) * pulse})`;
        ctx.fill();
      }

      // ─── MOUSE CURSOR GLOW ───
      if (mpx > 0 && mpy > 0) {
        const glowSize = 60 + Math.min(mSpeed, 20) * 3;
        const cursorGlow = ctx.createRadialGradient(mpx, mpy, 0, mpx, mpy, glowSize);
        cursorGlow.addColorStop(0, `rgba(80,160,255,${0.08 + Math.min(mSpeed, 15) * 0.005})`);
        cursorGlow.addColorStop(0.5, 'rgba(60,120,220,0.03)');
        cursorGlow.addColorStop(1, 'rgba(60,120,220,0)');
        ctx.fillStyle = cursorGlow;
        ctx.beginPath(); ctx.arc(mpx, mpy, glowSize, 0, Math.PI * 2); ctx.fill();
      }

      // ─── MOUSE TRAIL ───
      const trail = trailRef.current;
      for (let i = 0; i < trail.length; i++) {
        trail[i].age += 0.03;
      }
      // Remove old trail points
      trailRef.current = trail.filter(p => p.age < 1);

      if (trailRef.current.length > 2 && mSpeed > 3) {
        ctx.beginPath();
        ctx.moveTo(trailRef.current[0].x, trailRef.current[0].y);
        for (let i = 1; i < trailRef.current.length; i++) {
          const p = trailRef.current[i];
          ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(100,180,255,${Math.min(mSpeed * 0.01, 0.15)})`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // ─── CLICK RIPPLES ───
      const ripples = ripplesRef.current;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rip = ripples[i];
        rip.r += 3;
        rip.opacity -= 0.015;

        if (rip.opacity <= 0) {
          ripples.splice(i, 1);
          continue;
        }

        // Outer ring
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(100,180,255,${rip.opacity * 0.6})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner ring
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.r * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(150,210,255,${rip.opacity * 0.3})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Fill glow
        const ripGlow = ctx.createRadialGradient(rip.x, rip.y, 0, rip.x, rip.y, rip.r);
        ripGlow.addColorStop(0, `rgba(80,160,255,${rip.opacity * 0.05})`);
        ripGlow.addColorStop(1, 'rgba(80,160,255,0)');
        ctx.fillStyle = ripGlow;
        ctx.beginPath(); ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2); ctx.fill();
      }

      // ─── CLICK SPARKS ───
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx; s.y += s.vy;
        s.vx *= 0.96; s.vy *= 0.96;
        s.vy += 0.03; // slight gravity
        s.life -= 1 / s.maxLife;

        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }

        const alpha = s.life * 0.8;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 80%, 70%, ${alpha})`;
        ctx.fill();

        // Spark glow
        const sGlow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 4 * s.life);
        sGlow.addColorStop(0, `hsla(${s.hue}, 80%, 70%, ${alpha * 0.3})`);
        sGlow.addColorStop(1, `hsla(${s.hue}, 80%, 70%, 0)`);
        ctx.fillStyle = sGlow;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size * 4 * s.life, 0, Math.PI * 2); ctx.fill();
      }

      // ─── FLOATING PARTICLES (mouse-interactive) ───
      for (const p of particlesRef.current) {
        p.x += p.drift + Math.sin(t * 0.3 + p.x * 0.01) * 0.15;
        p.y += p.vy * p.speed;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;

        // Particles scatter away from mouse
        const dpx = (p.x + px * 0.3) - mpx;
        const dpy = (p.y + py * 0.2) - mpy;
        const dpDist = Math.sqrt(dpx * dpx + dpy * dpy);
        let drawX = p.x + px * 0.3;
        let drawY = p.y + py * 0.2;
        if (dpDist < 80 && dpDist > 0) {
          const push = (1 - dpDist / 80) * 15;
          drawX += (dpx / dpDist) * push;
          drawY += (dpy / dpDist) * push;
        }

        // Brighten near mouse
        const brightBoost = dpDist < 120 ? (1 - dpDist / 120) * 0.4 : 0;
        const flicker = (p.opacity + brightBoost) * (0.7 + Math.sin(t * 2 + p.x + p.y) * 0.3);
        ctx.beginPath(); ctx.arc(drawX, drawY, p.size + brightBoost * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,210,255,${flicker})`;
        ctx.fill();
      }

      // ─── SUNLIGHT BLOOM ───
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

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('touchstart', onClick as EventListener);
    };
  }, [init]);

  return (
    <div className="app-backdrop fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="backdrop-fx absolute top-[-5%] right-[10%] w-[700px] h-[700px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(60,100,200,0.08) 0%, transparent 60%)' }} />
      <div className="backdrop-fx absolute bottom-[5%] left-[5%] w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(40,80,180,0.06) 0%, transparent 60%)' }} />
      <div className="backdrop-fx absolute top-[20%] left-[30%] w-[400px] h-[400px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(100,140,240,0.05) 0%, transparent 60%)' }} />
      <div className="backdrop-fx absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(100,160,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(100,160,255,1) 1px, transparent 1px)', backgroundSize: '70px 70px' }} />
      <canvas ref={canvasRef} className="backdrop-fx absolute inset-0 w-full h-full pointer-events-auto" />
    </div>
  );
}
