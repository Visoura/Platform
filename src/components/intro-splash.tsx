import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { EyeLogo } from './eye-logo';

interface IntroSplashProps {
  onComplete: () => void;
}

export function IntroSplash({ onComplete }: IntroSplashProps) {
  const [phase, setPhase] = useState<'open' | 'hold' | 'close' | 'done'>('open');
  const [visible, setVisible] = useState(true);

  const dismiss = useCallback(() => {
    setPhase('close');
    setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 350);
    }, 500);
  }, [onComplete]);

  useEffect(() => {
    // eye open: 700ms
    const t1 = setTimeout(() => setPhase('hold'), 700);
    // hold: 600ms
    const t2 = setTimeout(() => setPhase('close'), 1300);
    // close + fade out overlay: 500ms
    const t3 = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 350);
    }, 1800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="fixed inset-0 z-[100] bg-[#0B0F19] flex items-center justify-center overflow-hidden"
        >
          {/* Radial glow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.4 }}
            animate={
              phase === 'hold'
                ? { opacity: 0.18, scale: 1.4 }
                : phase === 'close'
                ? { opacity: 0, scale: 1.8 }
                : { opacity: 0, scale: 0.4 }
            }
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="absolute w-[500px] h-[500px] rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(59,130,246,0.6) 0%, rgba(59,130,246,0.1) 50%, transparent 75%)',
            }}
          />

          {/* Outer ring pulse */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={
              phase === 'hold'
                ? { opacity: 0.25, scale: 1.2 }
                : phase === 'close'
                ? { opacity: 0, scale: 1.6 }
                : { opacity: 0, scale: 0.5 }
            }
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="absolute w-72 h-72 rounded-full border border-[#3B82F6]/40 pointer-events-none"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={
              phase === 'hold'
                ? { opacity: 0.15, scale: 1 }
                : phase === 'close'
                ? { opacity: 0, scale: 1.4 }
                : { opacity: 0, scale: 0.5 }
            }
            transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
            className="absolute w-48 h-48 rounded-full border border-[#3B82F6]/30 pointer-events-none"
          />

          {/* Eye / Logo — scaleY opens from 0 → 1 */}
          <motion.div
            className="flex flex-col items-center gap-5 relative"
          >
            {/* Clip container for "eyelid" open effect */}
            <motion.div
              initial={{ scaleY: 0.04, opacity: 0.6 }}
              animate={
                phase === 'open'
                  ? { scaleY: 1, opacity: 1 }
                  : phase === 'hold'
                  ? { scaleY: 1, opacity: 1 }
                  : { scaleY: 0.04, opacity: 0.4 }
              }
              transition={{
                duration: phase === 'close' ? 0.45 : 0.65,
                ease: phase === 'close' ? [0.4, 0, 0.2, 1] : [0.34, 1.3, 0.64, 1],
              }}
              style={{ transformOrigin: 'center center' }}
            >
              <EyeLogo
                className="h-[38px] w-auto"
                style={{ filter: 'drop-shadow(0 0 24px rgba(59,130,246,0.7))' }}
              />
            </motion.div>

            {/* Brand label */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={
                phase === 'hold'
                  ? { opacity: 1, y: 0 }
                  : phase === 'close'
                  ? { opacity: 0, y: -4 }
                  : { opacity: 0, y: 8 }
              }
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="text-[#3B82F6] text-xs tracking-[0.35em] uppercase select-none"
            >
              Surveillance System
            </motion.div>
          </motion.div>

          {/* Skip button */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            onClick={dismiss}
            className="absolute bottom-6 right-6 text-[11px] text-[#475569] hover:text-[#94A3B8] transition-colors tracking-wider uppercase select-none"
          >
            Skip ›
          </motion.button>

          {/* Scan line overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={phase === 'hold' ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(59,130,246,0.015) 2px, rgba(59,130,246,0.015) 4px)',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
