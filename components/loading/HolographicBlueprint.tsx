'use client';

import { useEffect, useRef } from 'react';

interface Props {
  stage: number;
  progress: number;
}

export default function HolographicBlueprint({ stage, progress }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;

    const progressNorm = progress / 100;

    // Stage-specific hue
    const hues = [215, 260, 190, 155];
    const hue = hues[stage] || 215;

    interface Block {
      x: number; y: number; w: number; h: number;
      label: string; delay: number; type: 'rect' | 'line' | 'node';
    }

    // Generate blueprint elements per stage
    function getBlocks(): Block[] {
      if (stage === 0) { // Website wireframe
        return [
          { x: w * 0.05, y: h * 0.05, w: w * 0.9, h: h * 0.08, label: 'NAV', delay: 0.1, type: 'rect' },
          { x: w * 0.05, y: h * 0.16, w: w * 0.9, h: h * 0.25, label: 'HERO', delay: 0.2, type: 'rect' },
          { x: w * 0.05, y: h * 0.44, w: w * 0.42, h: h * 0.15, label: 'CTA', delay: 0.35, type: 'rect' },
          { x: w * 0.52, y: h * 0.44, w: w * 0.42, h: h * 0.15, label: 'FORM', delay: 0.4, type: 'rect' },
          { x: w * 0.05, y: h * 0.62, w: w * 0.28, h: h * 0.12, label: 'CARD', delay: 0.5, type: 'rect' },
          { x: w * 0.36, y: h * 0.62, w: w * 0.28, h: h * 0.12, label: 'CARD', delay: 0.55, type: 'rect' },
          { x: w * 0.67, y: h * 0.62, w: w * 0.28, h: h * 0.12, label: 'CARD', delay: 0.6, type: 'rect' },
          { x: w * 0.05, y: h * 0.78, w: w * 0.9, h: h * 0.08, label: 'FOOTER', delay: 0.7, type: 'rect' },
        ];
      }
      if (stage === 1) { // Tracking pipeline
        return [
          { x: w * 0.1, y: h * 0.1, w: 50, h: 28, label: 'GA4', delay: 0.1, type: 'node' },
          { x: w * 0.5, y: h * 0.08, w: 50, h: 28, label: 'GTM', delay: 0.2, type: 'node' },
          { x: w * 0.85, y: h * 0.1, w: 50, h: 28, label: 'META', delay: 0.3, type: 'node' },
          { x: w * 0.3, y: h * 0.4, w: 60, h: 28, label: 'EVENTS', delay: 0.4, type: 'node' },
          { x: w * 0.7, y: h * 0.4, w: 60, h: 28, label: 'CONV', delay: 0.45, type: 'node' },
          { x: w * 0.5, y: h * 0.7, w: 70, h: 28, label: 'DATALAYER', delay: 0.55, type: 'node' },
          { x: w * 0.15, y: h * 0.7, w: 55, h: 28, label: 'CONSENT', delay: 0.6, type: 'node' },
          { x: w * 0.82, y: h * 0.7, w: 50, h: 28, label: 'PIXEL', delay: 0.65, type: 'node' },
        ];
      }
      if (stage === 2) { // Blueprint table
        const rows: Block[] = [];
        const labels = ['purchase_complete', 'add_to_cart', 'page_view', 'sign_up', 'form_submit',
          'cta_click', 'scroll_depth', 'video_play', 'search_query', 'nav_click',
          'checkout_begin', 'view_item'];
        for (let i = 0; i < labels.length; i++) {
          rows.push({
            x: w * 0.05, y: h * 0.05 + i * (h * 0.072),
            w: w * 0.9, h: h * 0.058,
            label: labels[i], delay: 0.08 + i * 0.06, type: 'line',
          });
        }
        return rows;
      }
      // Stage 3: delivery
      return [
        { x: w * 0.15, y: h * 0.2, w: w * 0.7, h: h * 0.15, label: 'MEASUREMENT PLAN', delay: 0.1, type: 'rect' },
        { x: w * 0.2, y: h * 0.42, w: w * 0.25, h: h * 0.1, label: 'XLSX', delay: 0.3, type: 'rect' },
        { x: w * 0.55, y: h * 0.42, w: w * 0.25, h: h * 0.1, label: 'EMAIL', delay: 0.35, type: 'rect' },
        { x: w * 0.3, y: h * 0.6, w: w * 0.4, h: h * 0.12, label: 'VERIFIED', delay: 0.5, type: 'rect' },
      ];
    }

    const blocks = getBlocks();

    // Pipeline connections for stage 1
    const pipes: [number, number][] = stage === 1
      ? [[0, 3], [1, 3], [1, 4], [2, 4], [3, 5], [4, 5], [5, 6], [5, 7]]
      : [];

    let t = 0;
    const animate = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);

      // Blueprint grid background
      ctx.strokeStyle = `hsla(${hue}, 60%, 50%, 0.03)`;
      ctx.lineWidth = 0.5;
      const gridSize = 20;
      for (let gx = 0; gx < w; gx += gridSize) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }

      // Pipeline connections (stage 1)
      pipes.forEach(([from, to]) => {
        const a = blocks[from], b = blocks[to];
        if (!a || !b) return;
        const ax = a.x + (a.w || 0) / 2, ay = a.y + (a.h || 0) / 2;
        const bx = b.x + (b.w || 0) / 2, by = b.y + (b.h || 0) / 2;
        const visible = progressNorm > Math.max(a.delay, b.delay);

        if (visible) {
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          const midY = (ay + by) / 2;
          ctx.bezierCurveTo(ax, midY, bx, midY, bx, by);
          ctx.strokeStyle = `hsla(${hue}, 70%, 60%, 0.12)`;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Flowing pulse
          const pt = (t * 0.8 + from * 0.3) % 1;
          const px = ax + (bx - ax) * pt;
          const py = ay + (by - ay) * pt;
          ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 80%, 70%, ${Math.sin(pt * Math.PI) * 0.5})`;
          ctx.fill();
        }
      });

      // Draw blocks
      blocks.forEach((block) => {
        const visible = progressNorm > block.delay;
        if (!visible) return;

        const revealProgress = Math.min(1, (progressNorm - block.delay) / 0.15);
        const alpha = revealProgress;

        if (block.type === 'line') {
          // Event row (stage 2 blueprint table)
          const lineW = block.w * revealProgress;
          ctx.fillStyle = `hsla(${hue}, 60%, 50%, ${0.04 * alpha})`;
          ctx.fillRect(block.x, block.y, lineW, block.h);
          ctx.strokeStyle = `hsla(${hue}, 60%, 60%, ${0.08 * alpha})`;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(block.x, block.y, lineW, block.h);

          // Label
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillStyle = `hsla(${hue}, 60%, 75%, ${0.5 * alpha})`;
          ctx.textBaseline = 'middle';
          ctx.fillText(block.label, block.x + 8, block.y + block.h / 2);

          // Fake columns
          if (revealProgress > 0.5) {
            const cols = [block.w * 0.45, block.w * 0.65, block.w * 0.8];
            cols.forEach(cx => {
              ctx.beginPath();
              ctx.moveTo(block.x + cx, block.y);
              ctx.lineTo(block.x + cx, block.y + block.h);
              ctx.strokeStyle = `hsla(${hue}, 50%, 50%, 0.05)`;
              ctx.stroke();
            });
            // Status dot
            ctx.beginPath();
            ctx.arc(block.x + block.w - 12, block.y + block.h / 2, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = revealProgress > 0.8 ? `hsla(155, 70%, 55%, ${0.5 * alpha})` : `hsla(${hue}, 60%, 60%, ${0.3 * alpha})`;
            ctx.fill();
          }
        } else if (block.type === 'node') {
          // Tracking node (stage 1)
          const nw = block.w * revealProgress;
          const nh = block.h;
          const nx = block.x - nw / 2, ny = block.y - nh / 2;

          // Glow
          const glow = ctx.createRadialGradient(block.x, block.y, 0, block.x, block.y, 35);
          glow.addColorStop(0, `hsla(${hue}, 70%, 60%, ${0.08 * alpha})`);
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(block.x, block.y, 35, 0, Math.PI * 2); ctx.fill();

          // Box
          ctx.fillStyle = `hsla(${hue}, 50%, 15%, ${0.5 * alpha})`;
          ctx.strokeStyle = `hsla(${hue}, 60%, 60%, ${0.2 * alpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.roundRect(nx, ny, nw, nh, 4); ctx.fill(); ctx.stroke();

          // Label
          ctx.font = 'bold 9px ui-monospace, monospace';
          ctx.fillStyle = `hsla(${hue}, 60%, 75%, ${0.6 * alpha})`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(block.label, block.x, block.y);
          ctx.textAlign = 'start';
        } else {
          // Wireframe block (stage 0, 3)
          const bw = block.w * revealProgress;
          ctx.fillStyle = `hsla(${hue}, 50%, 50%, ${0.03 * alpha})`;
          ctx.strokeStyle = `hsla(${hue}, 60%, 60%, ${0.12 * alpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.roundRect(block.x, block.y, bw, block.h, 3); ctx.fill(); ctx.stroke();

          // Corner brackets
          const cs = 5;
          ctx.strokeStyle = `hsla(${hue}, 70%, 70%, ${0.3 * alpha})`;
          ctx.lineWidth = 1;
          // TL
          ctx.beginPath(); ctx.moveTo(block.x, block.y + cs); ctx.lineTo(block.x, block.y); ctx.lineTo(block.x + cs, block.y); ctx.stroke();
          // TR
          ctx.beginPath(); ctx.moveTo(block.x + bw - cs, block.y); ctx.lineTo(block.x + bw, block.y); ctx.lineTo(block.x + bw, block.y + cs); ctx.stroke();

          // Label
          ctx.font = '8px ui-monospace, monospace';
          ctx.fillStyle = `hsla(${hue}, 50%, 65%, ${0.4 * alpha})`;
          ctx.textBaseline = 'middle';
          ctx.fillText(block.label, block.x + 10, block.y + block.h / 2);
        }
      });

      // Scanning sweep line
      const sweepX = ((t * 40) % (w + 60)) - 30;
      const sweepGrad = ctx.createLinearGradient(sweepX - 30, 0, sweepX + 30, 0);
      sweepGrad.addColorStop(0, 'transparent');
      sweepGrad.addColorStop(0.5, `hsla(${hue}, 70%, 65%, 0.06)`);
      sweepGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = sweepGrad;
      ctx.fillRect(sweepX - 30, 0, 60, h);

      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(frameRef.current);
  }, [stage, progress]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
