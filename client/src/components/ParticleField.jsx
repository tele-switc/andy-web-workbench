import React, { useRef, useEffect } from 'react';

// 简洁的粒子场组件（Canvas，低性能设备自动降级）
// 桌面端首页使用；移动端 / reduced-motion 自动减少粒子数量
const COLORS = {
  particle: 'rgba(108, 139, 116, 0.28)',
  particleBright: 'rgba(108, 139, 116, 0.55)',
  line: 'rgba(108, 139, 116, 0.12)',
};

function detectDegrade() {
  if (typeof window === 'undefined') return true;
  const isMobile = window.innerWidth < 720;
  const cores = navigator.hardwareConcurrency || 4;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return isMobile || cores < 4 || reduce;
}

export default function ParticleField({ interactive = true, density = 'normal' }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const particlesRef = useRef([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const degrade = detectDegrade();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    if (!parent || !ctx) return;

    let W = parent.clientWidth;
    let H = parent.clientHeight;
    canvas.width = W;
    canvas.height = H;

    const count = degrade ? 12 : (density === 'dense' ? 42 : 30);
    const particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.14,
        vy: (Math.random() - 0.5) * 0.14,
        r: 1.2 + Math.random() * 1.6,
      });
    }
    particlesRef.current = particles;

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => { mouseRef.current = { x: -9999, y: -9999 }; };
    if (interactive) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseout', onLeave);
    }

    let running = true;
    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      const mouse = mouseRef.current;

      for (const p of particles) {
        // 鼠标排斥
        if (mouse.x > -5000) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const d = Math.hypot(dx, dy);
          if (d < 90 && d > 0.1) {
            const f = 0.055 * (1 - d / 90);
            p.vx -= (dx / d) * f;
            p.vy -= (dy / d) * f;
          }
        }
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -0.85;
        if (p.y < 0 || p.y > H) p.vy *= -0.85;
        p.x = Math.max(2, Math.min(W - 2, p.x));
        p.y = Math.max(2, Math.min(H - 2, p.y));

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.r > 2 ? COLORS.particleBright : COLORS.particle;
        ctx.fill();
      }

      // 鼠标附近粒子连线
      if (mouse.x > -5000) {
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = COLORS.line;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      if (interactive) {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseout', onLeave);
      }
    };
  }, [interactive, density, degrade]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
