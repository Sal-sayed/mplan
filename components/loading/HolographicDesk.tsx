'use client';

import { useEffect, useRef } from 'react';

interface Props {
  stage: number;
  progress: number;
}

/*
  Glass workspace table rendered in perspective.
  Shows stage-specific content being built on the surface:
  - Stage 0: website wireframe cards appearing
  - Stage 1: tracking pipeline nodes connecting
  - Stage 2: measurement plan rows typing out
  - Stage 3: report compressing into delivery package
*/
export default function HolographicDesk({ stage, progress }: Props) {
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

    const hues = [215, 260, 190, 155];
    const hue = hues[stage] || 215;
    const pNorm = progress / 100;

    let t = 0;
    const animate = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);

      // ─── DESK SURFACE (perspective trapezoid) ───
      const deskTop = h * 0.15;
      const deskBot = h * 0.95;
      const topInset = w * 0.12;
      const botInset = w * 0.02;

      // Glass surface
      const surfaceGrad = ctx.createLinearGradient(0, deskTop, 0, deskBot);
      surfaceGrad.addColorStop(0, `hsla(${hue}, 40%, 20%, 0.08)`);
      surfaceGrad.addColorStop(0.5, `hsla(${hue}, 30%, 15%, 0.05)`);
      surfaceGrad.addColorStop(1, `hsla(${hue}, 20%, 10%, 0.02)`);

      ctx.beginPath();
      ctx.moveTo(topInset, deskTop);
      ctx.lineTo(w - topInset, deskTop);
      ctx.lineTo(w - botInset, deskBot);
      ctx.lineTo(botInset, deskBot);
      ctx.closePath();
      ctx.fillStyle = surfaceGrad;
      ctx.fill();

      // Desk edge glow
      ctx.beginPath();
      ctx.moveTo(topInset, deskTop);
      ctx.lineTo(w - topInset, deskTop);
      ctx.strokeStyle = `hsla(${hue}, 60%, 60%, ${0.12 + Math.sin(t * 1.5) * 0.03})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Side edges
      ctx.beginPath();
      ctx.moveTo(topInset, deskTop); ctx.lineTo(botInset, deskBot);
      ctx.strokeStyle = `hsla(${hue}, 50%, 55%, 0.06)`;
      ctx.lineWidth = 0.5; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w - topInset, deskTop); ctx.lineTo(w - botInset, deskBot);
      ctx.stroke();

      // Perspective grid on desk
      const gridRows = 8;
      const gridCols = 10;
      for (let r = 0; r <= gridRows; r++) {
        const frac = r / gridRows;
        const y = deskTop + frac * (deskBot - deskTop);
        const leftX = topInset + (botInset - topInset) * frac;
        const rightX = (w - topInset) + ((w - botInset) - (w - topInset)) * frac;
        ctx.beginPath(); ctx.moveTo(leftX, y); ctx.lineTo(rightX, y);
        ctx.strokeStyle = `hsla(${hue}, 40%, 50%, 0.02)`;
        ctx.lineWidth = 0.5; ctx.stroke();
      }
      for (let c = 0; c <= gridCols; c++) {
        const frac = c / gridCols;
        const topX = topInset + frac * (w - 2 * topInset);
        const botX = botInset + frac * (w - 2 * botInset);
        ctx.beginPath(); ctx.moveTo(topX, deskTop); ctx.lineTo(botX, deskBot);
        ctx.strokeStyle = `hsla(${hue}, 40%, 50%, 0.015)`;
        ctx.lineWidth = 0.5; ctx.stroke();
      }

      // ─── SCANNING SWEEP across desk ───
      const sweepFrac = (t * 0.12) % 1;
      const sweepY = deskTop + sweepFrac * (deskBot - deskTop);
      const sweepLeftX = topInset + (botInset - topInset) * sweepFrac;
      const sweepRightX = (w - topInset) + ((w - botInset) - (w - topInset)) * sweepFrac;

      const sweepGrad = ctx.createLinearGradient(0, sweepY - 15, 0, sweepY + 15);
      sweepGrad.addColorStop(0, 'transparent');
      sweepGrad.addColorStop(0.5, `hsla(${hue}, 70%, 65%, 0.06)`);
      sweepGrad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.moveTo(sweepLeftX, sweepY - 15);
      ctx.lineTo(sweepRightX, sweepY - 15);
      ctx.lineTo(sweepRightX, sweepY + 15);
      ctx.lineTo(sweepLeftX, sweepY + 15);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // ─── STAGE-SPECIFIC DESK CONTENT ───
      const contentLeft = topInset + 15;
      const contentRight = w - topInset - 15;
      const contentW = contentRight - contentLeft;

      if (stage === 0) {
        // Website wireframe cards
        const cards = [
          { x: 0.05, y: 0.2, w: 0.9, h: 0.08, label: 'HEADER / NAV', d: 0.05 },
          { x: 0.05, y: 0.32, w: 0.55, h: 0.18, label: 'HERO SECTION', d: 0.15 },
          { x: 0.63, y: 0.32, w: 0.32, h: 0.18, label: 'CTA PANEL', d: 0.25 },
          { x: 0.05, y: 0.54, w: 0.28, h: 0.12, label: 'FEATURE', d: 0.35 },
          { x: 0.36, y: 0.54, w: 0.28, h: 0.12, label: 'FEATURE', d: 0.40 },
          { x: 0.67, y: 0.54, w: 0.28, h: 0.12, label: 'FEATURE', d: 0.45 },
          { x: 0.05, y: 0.70, w: 0.42, h: 0.10, label: 'FORM', d: 0.55 },
          { x: 0.52, y: 0.70, w: 0.42, h: 0.10, label: 'SOCIAL PROOF', d: 0.60 },
          { x: 0.05, y: 0.84, w: 0.9, h: 0.07, label: 'FOOTER', d: 0.70 },
        ];

        cards.forEach(card => {
          const visible = pNorm > card.d;
          if (!visible) return;
          const reveal = Math.min(1, (pNorm - card.d) / 0.12);
          const perspFrac = card.y;
          const pLeft = topInset + (botInset - topInset) * perspFrac;
          const pRight = (w - topInset) + ((w - botInset) - (w - topInset)) * perspFrac;
          const pW = pRight - pLeft - 30;

          const cx = pLeft + 15 + card.x * pW;
          const cy = deskTop + card.y * (deskBot - deskTop);
          const cw = card.w * pW * reveal;
          const ch = card.h * (deskBot - deskTop);

          ctx.fillStyle = `hsla(${hue}, 50%, 50%, ${0.04 * reveal})`;
          ctx.strokeStyle = `hsla(${hue}, 60%, 60%, ${0.12 * reveal})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 2); ctx.fill(); ctx.stroke();

          // Corner markers
          const cs = 4;
          ctx.strokeStyle = `hsla(${hue}, 70%, 70%, ${0.25 * reveal})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(cx, cy + cs); ctx.lineTo(cx, cy); ctx.lineTo(cx + cs, cy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + cw - cs, cy); ctx.lineTo(cx + cw, cy); ctx.lineTo(cx + cw, cy + cs); ctx.stroke();

          if (reveal > 0.5) {
            ctx.font = '7px ui-monospace, monospace';
            ctx.fillStyle = `hsla(${hue}, 50%, 70%, ${0.35 * reveal})`;
            ctx.fillText(card.label, cx + 6, cy + ch / 2 + 2.5);
          }
        });
      } else if (stage === 1) {
        // Tracking pipeline nodes
        const nodes = [
          { x: 0.15, y: 0.25, label: 'GA4', d: 0.05 },
          { x: 0.50, y: 0.20, label: 'GTM', d: 0.1 },
          { x: 0.85, y: 0.25, label: 'PIXEL', d: 0.15 },
          { x: 0.30, y: 0.50, label: 'EVENTS', d: 0.25 },
          { x: 0.70, y: 0.50, label: 'CONV', d: 0.30 },
          { x: 0.50, y: 0.75, label: 'DATALAYER', d: 0.45 },
        ];
        const pipes: [number, number][] = [[0,3],[1,3],[1,4],[2,4],[3,5],[4,5]];

        // Draw pipes
        pipes.forEach(([fi, ti]) => {
          const from = nodes[fi], to = nodes[ti];
          if (pNorm < Math.max(from.d, to.d) + 0.1) return;
          const reveal = Math.min(1, (pNorm - Math.max(from.d, to.d) - 0.1) / 0.1);

          const fFrac = from.y, tFrac = to.y;
          const fLeft = topInset + (botInset - topInset) * fFrac;
          const fRight = (w - topInset) + ((w - botInset) - (w - topInset)) * fFrac;
          const tLeft = topInset + (botInset - topInset) * tFrac;
          const tRight = (w - topInset) + ((w - botInset) - (w - topInset)) * tFrac;

          const fx = fLeft + from.x * (fRight - fLeft);
          const fy = deskTop + from.y * (deskBot - deskTop);
          const tx = tLeft + to.x * (tRight - tLeft);
          const ty = deskTop + to.y * (deskBot - deskTop);

          ctx.beginPath(); ctx.moveTo(fx, fy);
          ctx.bezierCurveTo(fx, (fy + ty) / 2, tx, (fy + ty) / 2, tx, ty);
          ctx.strokeStyle = `hsla(${hue}, 60%, 60%, ${0.1 * reveal})`;
          ctx.lineWidth = 1; ctx.stroke();

          // Flow pulse
          const pt = (t * 0.7 + fi * 0.4) % 1;
          const px = fx + (tx - fx) * pt;
          const py = fy + (ty - fy) * pt;
          ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 70%, 70%, ${Math.sin(pt * Math.PI) * 0.4 * reveal})`;
          ctx.fill();
        });

        // Draw nodes
        nodes.forEach(node => {
          if (pNorm < node.d) return;
          const reveal = Math.min(1, (pNorm - node.d) / 0.1);
          const frac = node.y;
          const left = topInset + (botInset - topInset) * frac;
          const right = (w - topInset) + ((w - botInset) - (w - topInset)) * frac;
          const nx = left + node.x * (right - left);
          const ny = deskTop + node.y * (deskBot - deskTop);

          // Glow
          const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, 20);
          glow.addColorStop(0, `hsla(${hue}, 60%, 60%, ${0.1 * reveal})`);
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(nx, ny, 20, 0, Math.PI * 2); ctx.fill();

          // Node box
          const nw = 40, nh = 18;
          ctx.fillStyle = `hsla(${hue}, 40%, 12%, ${0.6 * reveal})`;
          ctx.strokeStyle = `hsla(${hue}, 60%, 60%, ${0.2 * reveal})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.roundRect(nx - nw/2, ny - nh/2, nw, nh, 3); ctx.fill(); ctx.stroke();

          ctx.font = 'bold 7px ui-monospace, monospace';
          ctx.fillStyle = `hsla(${hue}, 60%, 75%, ${0.6 * reveal})`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(node.label, nx, ny);
          ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        });
      } else if (stage === 2) {
        // Measurement plan rows typing out
        const events = [
          'purchase_complete', 'add_to_cart', 'begin_checkout', 'page_view',
          'sign_up', 'form_submit', 'cta_click', 'scroll_depth',
          'video_play', 'search_query', 'nav_click', 'view_item',
          'remove_from_cart', 'select_content', 'share',
        ];

        // Header row
        const headerY = deskTop + (deskBot - deskTop) * 0.12;
        const hLeft = topInset + (botInset - topInset) * 0.12;
        const hRight = (w - topInset) + ((w - botInset) - (w - topInset)) * 0.12;

        ctx.font = 'bold 7px ui-monospace, monospace';
        ctx.fillStyle = `hsla(${hue}, 50%, 65%, 0.35)`;
        const cols = [0.02, 0.30, 0.55, 0.78];
        const headers = ['EVENT', 'TRIGGER', 'PARAMS', 'STATUS'];
        headers.forEach((hdr, i) => {
          ctx.fillText(hdr, hLeft + cols[i] * (hRight - hLeft), headerY);
        });

        // Separator
        ctx.beginPath();
        ctx.moveTo(hLeft, headerY + 6);
        ctx.lineTo(hRight, headerY + 6);
        ctx.strokeStyle = `hsla(${hue}, 50%, 50%, 0.08)`;
        ctx.lineWidth = 0.5; ctx.stroke();

        // Event rows
        events.forEach((ev, i) => {
          const rowDelay = 0.03 + i * 0.05;
          if (pNorm < rowDelay) return;
          const reveal = Math.min(1, (pNorm - rowDelay) / 0.06);

          const rowFrac = 0.18 + i * 0.05;
          if (rowFrac > 0.92) return;
          const ry = deskTop + rowFrac * (deskBot - deskTop);
          const rLeft = topInset + (botInset - topInset) * rowFrac;
          const rRight = (w - topInset) + ((w - botInset) - (w - topInset)) * rowFrac;

          // Row background
          if (i % 2 === 0) {
            ctx.fillStyle = `hsla(${hue}, 40%, 50%, ${0.015 * reveal})`;
            ctx.fillRect(rLeft, ry - 6, rRight - rLeft, 14);
          }

          // Typing effect — reveal characters
          const charCount = Math.floor(reveal * ev.length);
          const displayText = ev.slice(0, charCount) + (reveal < 1 ? '|' : '');

          ctx.font = '7.5px ui-monospace, monospace';
          ctx.fillStyle = `hsla(${hue}, 50%, 72%, ${0.5 * reveal})`;
          ctx.fillText(displayText, rLeft + cols[0] * (rRight - rLeft), ry + 2);

          // Trigger column
          if (reveal > 0.4) {
            ctx.fillStyle = `hsla(${hue}, 40%, 55%, ${0.3 * reveal})`;
            ctx.fillText(i < 3 ? 'click' : i < 6 ? 'submit' : 'auto', rLeft + cols[1] * (rRight - rLeft), ry + 2);
          }

          // Param count
          if (reveal > 0.6) {
            ctx.fillText(`${2 + (i % 4)}p`, rLeft + cols[2] * (rRight - rLeft), ry + 2);
          }

          // Status dot
          if (reveal > 0.8) {
            ctx.beginPath();
            ctx.arc(rLeft + cols[3] * (rRight - rLeft) + 8, ry, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(155, 60%, 55%, ${0.5 * reveal})`;
            ctx.fill();
          }
        });
      } else {
        // Stage 3: delivery — report compressing
        const centerX = w / 2;
        const centerY = deskTop + (deskBot - deskTop) * 0.45;

        // Report glow
        const reportGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 60);
        reportGlow.addColorStop(0, `hsla(155, 60%, 55%, ${0.1 * pNorm})`);
        reportGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = reportGlow;
        ctx.beginPath(); ctx.arc(centerX, centerY, 60, 0, Math.PI * 2); ctx.fill();

        // Report document
        const rw = 70, rh = 90;
        ctx.fillStyle = `hsla(${hue}, 30%, 12%, 0.6)`;
        ctx.strokeStyle = `hsla(155, 60%, 55%, 0.25)`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(centerX - rw/2, centerY - rh/2, rw, rh, 4); ctx.fill(); ctx.stroke();

        // Document lines
        for (let l = 0; l < 6; l++) {
          const ly = centerY - rh/2 + 15 + l * 11;
          const lw = (rw - 20) * (1 - l * 0.08);
          ctx.fillStyle = `hsla(${hue}, 40%, 60%, ${0.1 + Math.sin(t * 2 + l) * 0.03})`;
          ctx.fillRect(centerX - rw/2 + 10, ly, lw, 2);
        }

        // Verification seal
        if (pNorm > 0.85) {
          const sealAlpha = Math.min(1, (pNorm - 0.85) / 0.1);
          ctx.beginPath(); ctx.arc(centerX + 20, centerY + 25, 12, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(155, 70%, 55%, ${0.4 * sealAlpha})`;
          ctx.lineWidth = 1.5; ctx.stroke();
          ctx.font = 'bold 8px ui-monospace, monospace';
          ctx.fillStyle = `hsla(155, 60%, 60%, ${0.5 * sealAlpha})`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('✓', centerX + 20, centerY + 25.5);
          ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        }

        // Export label
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillStyle = `hsla(155, 50%, 65%, 0.4)`;
        ctx.textAlign = 'center';
        ctx.fillText('MEASUREMENT-PLAN.XLSX', centerX, centerY + rh/2 + 18);
        ctx.textAlign = 'start';
      }

      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(frameRef.current);
  }, [stage, progress]);

  return (
    <canvas ref={canvasRef} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
  );
}
