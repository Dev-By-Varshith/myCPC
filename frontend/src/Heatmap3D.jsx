import { useRef, useEffect, useState } from 'react';

const getCfColor = (rating) => {
  if (!rating || rating < 1200) return '#4a4a5a';
  if (rating < 1400) return '#2ecc71';
  if (rating < 1600) return '#1abc9c';
  if (rating < 1900) return '#3498db';
  if (rating < 2100) return '#9b59b6';
  if (rating < 2400) return '#e67e22';
  if (rating < 2600) return '#e74c3c';
  return '#c0392b';
};

const getCfColorBright = (rating) => {
  if (!rating || rating < 1200) return '#808080';
  if (rating < 1400) return '#00ff88';
  if (rating < 1600) return '#00e5cc';
  if (rating < 1900) return '#4488ff';
  if (rating < 2100) return '#cc44ff';
  if (rating < 2400) return '#ffaa00';
  if (rating < 2600) return '#ff4444';
  return '#ff0000';
};

export default function Heatmap3D({ heatmap }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const rotRef = useRef({ x: 35, y: -20 });
  const targetRotRef = useRef({ x: 35, y: -20 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmap || heatmap.length === 0) return;
    const ctx = canvas.getContext('2d');

    const ROWS = 7;
    const COLS = Math.ceil(heatmap.length / ROWS);
    const CELL = 12; // Smaller cells for 52-week view
    const GAP = 2;
    const MAX_H = 70;

    const maxCount = Math.max(1, ...heatmap.map(d => d.count));

    const toIso = (col, row, h, rot) => {
      const rx = rot.x * Math.PI / 180;
      const ry = rot.y * Math.PI / 180;
      // Centering based on dynamic COLS
      const x3 = (col - (COLS - 1) / 2) * (CELL + GAP);
      const z3 = (row - (ROWS - 1) / 2) * (CELL + GAP);
      const y3 = h;
      const cosRY = Math.cos(ry), sinRY = Math.sin(ry);
      const xr = x3 * cosRY + z3 * sinRY;
      const zr = -x3 * sinRY + z3 * cosRY;
      const cosRX = Math.cos(rx), sinRX = Math.sin(rx);
      const yr2 = y3 * cosRX - zr * sinRX;
      const zr2 = y3 * sinRX + zr * cosRX;
      return { sx: xr, sy: -yr2, depth: zr2 };
    };

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Background gradient
      const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W);
      bg.addColorStop(0, 'rgba(18,18,30,0.0)');
      bg.addColorStop(1, 'rgba(8,8,16,0.0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2 + 20;
      const rot = rotRef.current;

      // Sort cells by depth for painter's algo
      const cells = [];
      heatmap.forEach((day, i) => {
        const col = Math.floor(i / ROWS);
        const row = i % ROWS;
        const barH = day.count > 0 ? Math.max(6, (day.count / maxCount) * MAX_H) : 3;
        const color = day.maxRating > 0 ? getCfColorBright(day.maxRating) : '#2a2a3a';
        const iso = toIso(col, row, 0, rot);
        cells.push({ col, row, barH, color, depth: iso.depth, day, i });
      });
      cells.sort((a, b) => b.depth - a.depth);

      cells.forEach(({ col, row, barH, color, day }) => {
        const bot = toIso(col, row, 0, rot);
        const top = toIso(col, row, barH, rot);
        const h2 = CELL / 2;
        const bx = cx + bot.sx, by = cy + bot.sy;
        const tx = cx + top.sx, ty = cy + top.sy;

        // Parse color
        let r = 80, g = 80, b2 = 100;
        if (color !== '#2a2a3a') {
          const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
          if (m) { r = parseInt(m[1], 16); g = parseInt(m[2], 16); b2 = parseInt(m[3], 16); }
        }

        const alpha = day.count > 0 ? Math.min(0.55 + (day.count / maxCount) * 0.45, 1) : 0.18;

        // Left face
        ctx.beginPath();
        ctx.moveTo(tx - h2, ty + h2 * 0.5);
        ctx.lineTo(bx - h2, by + h2 * 0.5);
        ctx.lineTo(bx, by + h2);
        ctx.lineTo(tx, ty + h2);
        ctx.closePath();
        ctx.fillStyle = `rgba(${Math.floor(r * 0.55)},${Math.floor(g * 0.55)},${Math.floor(b2 * 0.55)},${alpha})`;
        ctx.fill();

        // Right face
        ctx.beginPath();
        ctx.moveTo(tx, ty + h2);
        ctx.lineTo(bx, by + h2);
        ctx.lineTo(bx + h2, by + h2 * 0.5);
        ctx.lineTo(tx + h2, ty + h2 * 0.5);
        ctx.closePath();
        ctx.fillStyle = `rgba(${Math.floor(r * 0.7)},${Math.floor(g * 0.7)},${Math.floor(b2 * 0.7)},${alpha})`;
        ctx.fill();

        // Top face
        ctx.beginPath();
        ctx.moveTo(tx - h2, ty + h2 * 0.5);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx + h2, ty + h2 * 0.5);
        ctx.lineTo(tx, ty + h2);
        ctx.closePath();
        const topGrad = ctx.createRadialGradient(tx, ty + h2 * 0.5, 0, tx, ty + h2 * 0.5, h2 * 1.2);
        topGrad.addColorStop(0, `rgba(${Math.min(r + 80, 255)},${Math.min(g + 80, 255)},${Math.min(b2 + 80, 255)},${alpha})`);
        topGrad.addColorStop(1, `rgba(${r},${g},${b2},${alpha * 0.7})`);
        ctx.fillStyle = topGrad;
        ctx.fill();

        // Glow on tall bars
        if (day.count > maxCount * 0.6) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 15;
          ctx.beginPath();
          ctx.moveTo(tx - h2, ty + h2 * 0.5);
          ctx.lineTo(tx, ty);
          ctx.lineTo(tx + h2, ty + h2 * 0.5);
          ctx.lineTo(tx, ty + h2);
          ctx.closePath();
          ctx.fillStyle = `rgba(${r},${g},${b2},0.3)`;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });
    };

    const lerp = (a, b, t) => a + (b - a) * t;
    const animate = () => {
      rotRef.current.x = lerp(rotRef.current.x, targetRotRef.current.x, 0.08);
      rotRef.current.y = lerp(rotRef.current.y, targetRotRef.current.y, 0.08);
      // Slow auto-rotate
      if (!isDragging.current) {
        targetRotRef.current.y += 0.08;
      }
      draw();
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    const onDown = (e) => {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (isDragging.current) {
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        targetRotRef.current.y += dx * 0.4;
        targetRotRef.current.x = Math.max(10, Math.min(70, targetRotRef.current.x + dy * 0.3));
        lastMouse.current = { x: e.clientX, y: e.clientY };
      } else {
        // Simple hit test for tooltip (pick the one closest to mouse in screen space)
        let best = null;
        let minDist = 30;
        const cx = canvas.width / 2, cy = canvas.height / 2 + 20;
        
        // We'll calculate this in the draw loop instead for efficiency or just re-run here
        heatmap.forEach((day, i) => {
          const col = Math.floor(i / ROWS);
          const row = i % ROWS;
          const barH = day.count > 0 ? Math.max(6, (day.count / maxCount) * MAX_H) : 3;
          const top = toIso(col, row, barH, rotRef.current);
          const dist = Math.hypot(mx - (cx + top.sx), my - (cy + top.sy));
          if (dist < minDist) {
            minDist = dist;
            best = { ...day, x: cx + top.sx, y: cy + top.sy };
          }
        });
        setTooltip(best);
      }
    };
    const onUp = () => { isDragging.current = false; };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [heatmap]);

  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: '16px', overflow: 'hidden', background: 'rgba(8,8,16,0.4)' }}>
      <canvas
        ref={canvasRef}
        width={900}
        height={340}
        style={{ width: '100%', height: '300px', display: 'block', cursor: 'grab' }}
      />
      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 10, right: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        {[{ l: '<1200', c: '#808080' }, { l: '1400', c: '#00ff88' }, { l: '1600', c: '#00e5cc' }, { l: '1900', c: '#4488ff' }, { l: '2100', c: '#cc44ff' }, { l: '2400+', c: '#ff4444' }].map((b) => (
          <div key={b.l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: b.c, boxShadow: `0 0 6px ${b.c}` }} />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{b.l}</span>
          </div>
        ))}
      </div>
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x,
          top: tooltip.y - 40,
          transform: 'translateX(-50%)',
          background: 'rgba(28,28,44,0.92)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '6px 10px',
          borderRadius: '8px',
          color: 'white',
          fontSize: '11px',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 100,
          boxShadow: '0 8px 20px rgba(0,0,0,0.4)'
        }}>
          <div style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>{tooltip.date}</div>
          <div>{tooltip.count} problems solved</div>
          {tooltip.maxRating > 0 && <div style={{ color: getCfColorBright(tooltip.maxRating) }}>Max Rating: {tooltip.maxRating}</div>}
        </div>
      )}
      <div style={{ position: 'absolute', top: 10, left: 14, color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}>
        DRAG TO ROTATE
      </div>
    </div>
  );
}
