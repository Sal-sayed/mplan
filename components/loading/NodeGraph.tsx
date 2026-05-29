'use client';

import { useEffect, useRef } from 'react';

interface Node {
  x: number; y: number; label: string; color: string; active: boolean; r: number;
}

interface Props {
  progress: number;
  stage: number;
}

export default function NodeGraph({ progress, stage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const tRef = useRef(0);

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

    const w = rect.width;
    const h = rect.height;

    // Generate nodes based on stage
    const nodeConfigs: Record<number, Node[]> = {
      0: [ // Scanning - webpage elements
        { x: w * 0.2, y: h * 0.3, label: 'NAV', color: '#60a5fa', active: false, r: 6 },
        { x: w * 0.5, y: h * 0.15, label: 'HERO', color: '#60a5fa', active: false, r: 8 },
        { x: w * 0.8, y: h * 0.3, label: 'CTA', color: '#f59e0b', active: false, r: 7 },
        { x: w * 0.3, y: h * 0.6, label: 'FORM', color: '#818cf8', active: false, r: 6 },
        { x: w * 0.6, y: h * 0.5, label: 'BTN', color: '#22d3ee', active: false, r: 5 },
        { x: w * 0.7, y: h * 0.75, label: 'FOOTER', color: '#60a5fa', active: false, r: 6 },
        { x: w * 0.15, y: h * 0.8, label: 'LINK', color: '#818cf8', active: false, r: 4 },
        { x: w * 0.45, y: h * 0.85, label: 'IMG', color: '#22d3ee', active: false, r: 4 },
      ],
      1: [ // Audit - tracking nodes
        { x: w * 0.15, y: h * 0.2, label: 'GA4', color: '#f59e0b', active: false, r: 9 },
        { x: w * 0.5, y: h * 0.1, label: 'GTM', color: '#60a5fa', active: false, r: 8 },
        { x: w * 0.85, y: h * 0.2, label: 'META', color: '#818cf8', active: false, r: 7 },
        { x: w * 0.3, y: h * 0.5, label: 'EVENT', color: '#22d3ee', active: false, r: 6 },
        { x: w * 0.7, y: h * 0.45, label: 'CONV', color: '#34d399', active: false, r: 7 },
        { x: w * 0.2, y: h * 0.8, label: 'DL', color: '#60a5fa', active: false, r: 5 },
        { x: w * 0.5, y: h * 0.7, label: 'TAG', color: '#f59e0b', active: false, r: 5 },
        { x: w * 0.8, y: h * 0.75, label: 'PIXEL', color: '#818cf8', active: false, r: 6 },
      ],
      2: [ // Blueprint - KPIs and events
        { x: w * 0.5, y: h * 0.1, label: 'PLAN', color: '#60a5fa', active: false, r: 10 },
        { x: w * 0.2, y: h * 0.3, label: 'KPI', color: '#34d399', active: false, r: 8 },
        { x: w * 0.8, y: h * 0.3, label: 'EVENT', color: '#f59e0b', active: false, r: 8 },
        { x: w * 0.1, y: h * 0.6, label: 'DIM', color: '#818cf8', active: false, r: 6 },
        { x: w * 0.35, y: h * 0.55, label: 'GOAL', color: '#22d3ee', active: false, r: 7 },
        { x: w * 0.65, y: h * 0.55, label: 'FUNL', color: '#60a5fa', active: false, r: 7 },
        { x: w * 0.9, y: h * 0.6, label: 'CONV', color: '#34d399', active: false, r: 6 },
        { x: w * 0.3, y: h * 0.85, label: 'IMPL', color: '#f59e0b', active: false, r: 6 },
        { x: w * 0.7, y: h * 0.85, label: 'ROAD', color: '#818cf8', active: false, r: 6 },
      ],
      3: [ // Delivery
        { x: w * 0.5, y: h * 0.4, label: 'DONE', color: '#34d399', active: false, r: 12 },
        { x: w * 0.25, y: h * 0.3, label: 'XLSX', color: '#60a5fa', active: false, r: 7 },
        { x: w * 0.75, y: h * 0.3, label: 'EMAIL', color: '#818cf8', active: false, r: 7 },
        { x: w * 0.35, y: h * 0.65, label: 'SENT', color: '#22d3ee', active: false, r: 6 },
        { x: w * 0.65, y: h * 0.65, label: 'OK', color: '#34d399', active: false, r: 6 },
      ],
    };

    const nodes = nodeConfigs[stage] || nodeConfigs[0];
    // Activate nodes based on progress within stage
    const stageProgress = Math.min(1, (progress % 25) / 25 * 1.5);
    const activeCount = Math.floor(stageProgress * nodes.length);
    nodes.forEach((n, i) => { n.active = i < activeCount; });

    const connections: [number, number][] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < w * 0.5) {
          connections.push([i, j]);
        }
      }
    }

    const animate = () => {
      tRef.current += 0.016;
      const t = tRef.current;
      ctx.clearRect(0, 0, w, h);

      // Draw connections
      connections.forEach(([i, j]) => {
        const a = nodes[i], b = nodes[j];
        const bothActive = a.active && b.active;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = bothActive
          ? `rgba(100,180,255,${0.15 + Math.sin(t * 2 + i) * 0.05})`
          : 'rgba(60,100,180,0.06)';
        ctx.lineWidth = bothActive ? 1.5 : 0.5;
        ctx.stroke();

        // Data pulse along active connections
        if (bothActive) {
          const pulseT = (t * 0.8 + i * 0.3 + j * 0.2) % 1;
          const px = a.x + (b.x - a.x) * pulseT;
          const py = a.y + (b.y - a.y) * pulseT;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(100,200,255,${(pulseT < 0.5 ? pulseT * 2 : (1 - pulseT) * 2) * 0.7})`;
          ctx.fill();
        }
      });

      // Draw nodes
      nodes.forEach((n) => {
        const pulse = n.active ? (1 + Math.sin(t * 3 + n.x) * 0.15) : 0.5;
        const r = n.r * pulse;

        // Outer glow
        if (n.active) {
          const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4);
          glow.addColorStop(0, n.color + '30');
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2); ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.active ? n.color + 'cc' : n.color + '30';
        ctx.fill();

        // Inner highlight
        if (n.active) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fill();
        }

        // Label
        ctx.font = `${n.active ? 'bold ' : ''}9px system-ui`;
        ctx.fillStyle = n.active ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)';
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y + r + 14);
      });

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
