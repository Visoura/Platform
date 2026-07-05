import { useEffect, useState, useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface IntroSplashProps {
  onComplete: () => void;
}

const TOTAL_MS = 3000;
const RING_R = 96;
const RING_CIRC = 2 * Math.PI * RING_R; // ≈ 603

const STATUS_STEPS = [
  { at: 0,    text: 'Initializing...' },
  { at: 1080, text: 'Connecting cameras...' },
  { at: 1920, text: 'Almost ready...' },
  { at: 2640, text: 'Ready' },
];

// Circumferences for iris ring animations
const R1 = 36, C1 = 2 * Math.PI * R1; // ≈ 226
const R2 = 27, C2 = 2 * Math.PI * R2; // ≈ 170

export function IntroSplash({ onComplete }: IntroSplashProps) {
  const [statusIdx, setStatusIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    STATUS_STEPS.forEach((step, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => setStatusIdx(i), step.at));
    });
    const done = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 400);
    }, TOTAL_MS);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden select-none"
          style={{ background: '#070C18' }}
        >
          {/* ── Background grid ────────────────────────────────────── */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(rgba(6,182,212,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.035) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }} />

          {/* ── Radial glow behind eye ─────────────────────────────── */}
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 560, height: 560,
              background: 'radial-gradient(circle, rgba(6,182,212,0.18) 0%, rgba(6,182,212,0.04) 45%, transparent 70%)',
            }}
            animate={{ opacity: [0.6, 1, 0.6], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* ── Corner decorators ──────────────────────────────────── */}
          {[
            'top-5 left-5 border-t border-l',
            'top-5 right-5 border-t border-r',
            'bottom-5 left-5 border-b border-l',
            'bottom-5 right-5 border-b border-r',
          ].map((cls, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.07, duration: 0.4 }}
              className={`absolute w-10 h-10 border-cyan-500/25 pointer-events-none ${cls}`}
            />
          ))}
          {/* Corner dots */}
          {[
            'top-[18px] left-[18px]',
            'top-[18px] right-[18px]',
            'bottom-[18px] left-[18px]',
            'bottom-[18px] right-[18px]',
          ].map((cls, i) => (
            <motion.div
              key={`dot-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className={`absolute w-1 h-1 rounded-full bg-cyan-500/50 pointer-events-none ${cls}`}
            />
          ))}

          {/* ── Horizontal CRT scanlines (very subtle) ─────────────── */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(6,182,212,0.008) 3px, rgba(6,182,212,0.008) 4px)',
          }} />

          {/* ── Main content ───────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.34, 1.1, 0.64, 1] }}
            className="flex flex-col items-center gap-6 relative z-10"
          >
            {/* ── Eye + progress ring container ─────────────────── */}
            <div className="relative flex items-center justify-center" style={{ width: 280, height: 220 }}>

              {/* Progress ring SVG (behind everything) */}
              <svg
                width="280" height="220"
                viewBox="0 0 280 220"
                className="absolute inset-0"
                style={{ overflow: 'visible' }}
              >
                {/* Track */}
                <circle
                  cx="140" cy="110"
                  r={RING_R}
                  stroke="rgba(6,182,212,0.1)"
                  strokeWidth="1"
                  fill="none"
                />
                {/* Tick marks at 12 positions */}
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
                  const r1 = RING_R - 4, r2 = RING_R + 4;
                  return (
                    <motion.line
                      key={i}
                      x1={140 + r1 * Math.cos(angle)}
                      y1={110 + r1 * Math.sin(angle)}
                      x2={140 + r2 * Math.cos(angle)}
                      y2={110 + r2 * Math.sin(angle)}
                      stroke="rgba(6,182,212,0.2)"
                      strokeWidth="0.8"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 + i * 0.04 }}
                    />
                  );
                })}
                {/* Filled arc */}
                <motion.circle
                  cx="140" cy="110"
                  r={RING_R}
                  stroke="#06B6D4"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  style={{
                    transformOrigin: '140px 110px',
                    rotate: '-90deg',
                    filter: 'drop-shadow(0 0 6px rgba(6,182,212,0.9))',
                  }}
                  initial={{ strokeDashoffset: RING_CIRC }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{ duration: TOTAL_MS / 1000, ease: 'linear' }}
                />
                {/* Moving dot on arc */}
                <motion.circle
                  r="3"
                  fill="#06B6D4"
                  style={{ filter: 'drop-shadow(0 0 5px rgba(6,182,212,1))' }}
                  animate={{
                    cx: Array.from({ length: 61 }, (_, i) => {
                      const t = (i / 60) * Math.PI * 2 - Math.PI / 2;
                      return 140 + RING_R * Math.cos(t);
                    }),
                    cy: Array.from({ length: 61 }, (_, i) => {
                      const t = (i / 60) * Math.PI * 2 - Math.PI / 2;
                      return 110 + RING_R * Math.sin(t);
                    }),
                  }}
                  transition={{ duration: TOTAL_MS / 1000, ease: 'linear' }}
                />
              </svg>

              {/* Eye SVG */}
              <svg
                width="190" height="110"
                viewBox="0 0 190 110"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <clipPath id={`ec-${uid}`}>
                    <path d="M8 55 C32 14, 72 7, 95 7 C118 7, 158 14, 182 55 C158 96, 118 103, 95 103 C72 103, 32 96, 8 55 Z" />
                  </clipPath>
                  <radialGradient id={`ig-${uid}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stopColor="#0E7490" stopOpacity="0.95" />
                    <stop offset="35%"  stopColor="#0C4A6E" />
                    <stop offset="80%"  stopColor="#061220" />
                    <stop offset="100%" stopColor="#030810" />
                  </radialGradient>
                  <radialGradient id={`pg-${uid}`} cx="40%" cy="36%" r="58%">
                    <stop offset="0%"   stopColor="#0A1A30" />
                    <stop offset="100%" stopColor="#010305" />
                  </radialGradient>
                  {/* Glow filter */}
                  <filter id={`glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                {/* Sclera */}
                <path d="M8 55 C32 14, 72 7, 95 7 C118 7, 158 14, 182 55 C158 96, 118 103, 95 103 C72 103, 32 96, 8 55 Z"
                  fill="#050B15" />

                {/* Iris fill */}
                <circle cx="95" cy="55" r="42" fill={`url(#ig-${uid})`} clipPath={`url(#ec-${uid})`} />

                {/* Outer iris ring */}
                <circle cx="95" cy="55" r="42" stroke="#06B6D4" strokeWidth="1" fill="none"
                  clipPath={`url(#ec-${uid})`} opacity="0.7" />

                {/* Rotating dashed ring 1 (clockwise via dashoffset) */}
                <motion.circle
                  cx="95" cy="55" r={R1}
                  stroke="#06B6D4" strokeWidth="0.75" fill="none"
                  strokeDasharray={`3.5 ${C1 / 12 - 3.5}`}
                  animate={{ strokeDashoffset: [0, -C1] }}
                  transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                  clipPath={`url(#ec-${uid})`}
                  opacity="0.55"
                />

                {/* Rotating dashed ring 2 (counter-clockwise) */}
                <motion.circle
                  cx="95" cy="55" r={R2}
                  stroke="#0EA5E9" strokeWidth="0.6" fill="none"
                  strokeDasharray={`5 ${C2 / 8 - 5}`}
                  animate={{ strokeDashoffset: [0, C2] }}
                  transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                  clipPath={`url(#ec-${uid})`}
                  opacity="0.4"
                />

                {/* Aperture hex */}
                <polygon
                  points="107.7,47.5 95,41 82.3,47.5 82.3,62.5 95,69 107.7,62.5"
                  stroke="#06B6D4" strokeWidth="0.7" fill="none" opacity="0.4"
                  clipPath={`url(#ec-${uid})`}
                />

                {/* Pupil */}
                <circle cx="95" cy="55" r="15" fill={`url(#pg-${uid})`} clipPath={`url(#ec-${uid})`} />
                <circle cx="95" cy="55" r="10.5" fill="#0E7490" opacity="0.9" clipPath={`url(#ec-${uid})`} />
                <circle cx="95" cy="55" r="7"   fill="#06B6D4" clipPath={`url(#ec-${uid})`} />

                {/* Catchlights */}
                <circle cx="101" cy="48" r="3"   fill="white" opacity="0.75" clipPath={`url(#ec-${uid})`} />
                <circle cx="89"  cy="61" r="1.2" fill="white" opacity="0.3"  clipPath={`url(#ec-${uid})`} />

                {/* Scanning line (sweeps top→bottom through the eye) */}
                <motion.rect
                  x="10" width="170" height="2"
                  fill="url(#scanline-grad)"
                  clipPath={`url(#ec-${uid})`}
                  animate={{ y: [12, 100], opacity: [0, 0.7, 0.7, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.8, ease: 'linear', times: [0, 0.25, 0.75, 1] }}
                />
                {/* Gradient for scan line */}
                <defs>
                  <linearGradient id={`scanline-grad`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="#06B6D4" stopOpacity="0" />
                    <stop offset="30%"  stopColor="#06B6D4" stopOpacity="1" />
                    <stop offset="70%"  stopColor="#06B6D4" stopOpacity="1" />
                    <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Eye outline (on top) */}
                <path
                  d="M8 55 C32 14, 72 7, 95 7 C118 7, 158 14, 182 55 C158 96, 118 103, 95 103 C72 103, 32 96, 8 55 Z"
                  stroke="#06B6D4" strokeWidth="1.2" fill="none"
                  filter={`url(#glow-${uid})`}
                  opacity="0.85"
                />
              </svg>

              {/* Breathing glow over eye */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: 200, height: 120,
                  background: 'radial-gradient(ellipse, rgba(6,182,212,0.25) 0%, transparent 65%)',
                }}
                animate={{ opacity: [0.5, 1, 0.5], scale: [0.95, 1.05, 0.95] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>

            {/* ── Brand name ─────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="flex flex-col items-center gap-1.5"
            >
              <h1 style={{
                fontWeight: 700,
                fontSize: 34,
                letterSpacing: '0.18em',
                color: '#F0F4F8',
                lineHeight: 1,
              }}>
                VISOURA
              </h1>
              <p style={{
                color: '#06B6D4',
                fontSize: 10,
                letterSpacing: '0.42em',
                fontWeight: 500,
                textTransform: 'uppercase',
                opacity: 0.85,
              }}>
                Intelligent Surveillance
              </p>
            </motion.div>

            {/* ── Status text ────────────────────────────────────── */}
            <div className="relative h-5 flex items-center justify-center" style={{ minWidth: 200 }}>
              <AnimatePresence mode="wait">
                <motion.p
                  key={statusIdx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  style={{
                    color: '#4B6A8A',
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                  }}
                >
                  {STATUS_STEPS[statusIdx].text}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>

        </motion.div>
      )}
    </AnimatePresence>
  );
}
