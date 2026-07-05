import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Play, Square, Camera, Clock, AlertTriangle, X } from 'lucide-react';
import { useSessionContext } from '../context/session-context';
import type { Session } from '../context/session-context';
import { VisouraWordmark } from '../components/visoura-wordmark';

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function TerminateConfirmModal({
  session,
  onConfirm,
  onCancel,
}: {
  session: Session;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 16 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="bg-[#0F1624] border border-red-500/30 rounded-2xl shadow-[0_0_40px_rgba(239,68,68,0.2)] w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-[#E5E7EB] text-sm" style={{ fontWeight: 600 }}>Terminate Session</h3>
              <p className="text-[#475569] text-xs mt-0.5">{session.name}</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-[#1E293B] transition-colors">
            <X className="w-4 h-4 text-[#475569]" />
          </button>
        </div>
        <p className="text-[#94A3B8] text-sm mb-5 leading-relaxed">
          This will permanently end this session and remove all associated data. This action cannot be undone.
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-[#1E293B] hover:bg-[#263245] border border-[#3B82F6]/20 text-[#E5E7EB] rounded-xl transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors text-sm"
          >
            Terminate
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CurrentSessionCard({
  session,
  elapsed,
  onOpen,
  onTerminate,
}: {
  session: Session;
  elapsed: number;
  onOpen: () => void;
  onTerminate: () => void;
}) {
  const isRunning = session.status === 'active';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-[#0D1220] border border-[#3B82F6]/25 rounded-2xl p-6 shadow-[0_0_32px_rgba(59,130,246,0.08)]"
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-[#E5E7EB]" style={{ fontSize: 16, fontWeight: 600 }}>{session.name}</h3>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1.5 text-[#475569] text-xs">
              <Camera className="w-3 h-3" />
              {session.cameraCount} camera{session.cameraCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5 text-[#475569] text-xs">
              <Clock className="w-3 h-3" />
              Started {new Date(session.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] shrink-0 ${
          isRunning
            ? 'bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E]'
            : 'bg-[#475569]/10 border border-[#475569]/30 text-[#475569]'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-[#22C55E] animate-pulse' : 'bg-[#475569]'}`} />
          {isRunning ? 'Running' : 'Stopped'}
        </div>
      </div>

      {/* Elapsed timer */}
      <div className="flex items-center justify-center py-4 mb-5 bg-[#080C15] rounded-xl border border-[#3B82F6]/15">
        <div className="flex flex-col items-center">
          <span className="text-[#475569] text-[9px] uppercase tracking-widest mb-1">Elapsed Time</span>
          <span
            className="text-[#3B82F6] tabular-nums"
            style={{ fontSize: 36, fontWeight: 600, letterSpacing: '0.06em' }}
          >
            {formatElapsed(elapsed)}
          </span>
        </div>
      </div>

      {/* Camera segments */}
      <div className="flex gap-1 mb-5">
        {Array.from({ length: session.cameraCount }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full ${isRunning ? 'bg-[#3B82F6]/50' : 'bg-[#1E293B]'}`}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2.5">
        <button
          onClick={onOpen}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-xl transition-colors text-sm shadow-[0_0_16px_rgba(59,130,246,0.3)]"
        >
          <Play className="w-4 h-4" />
          Open Dashboard
        </button>
        {isRunning && (
          <button
            onClick={onTerminate}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 hover:text-red-300 rounded-xl text-sm transition-colors"
          >
            <Square className="w-4 h-4" />
            Terminate
          </button>
        )}
      </div>
    </motion.div>
  );
}

function PastSessionCard({ session }: { session: Session }) {
  const durationSec = session.endedAt
    ? (new Date(session.endedAt).getTime() - new Date(session.createdAt).getTime()) / 1000
    : 0;

  return (
    <div className="bg-[#0D1220] border border-[#3B82F6]/10 rounded-xl p-4 flex items-center justify-between gap-4">
      <div>
        <h4 className="text-[#E5E7EB] text-sm" style={{ fontWeight: 500 }}>{session.name}</h4>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1.5 text-[#475569] text-xs">
            <Camera className="w-3 h-3" />
            {session.cameraCount} camera{session.cameraCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1.5 text-[#475569] text-xs">
            <Clock className="w-3 h-3" />
            {new Date(session.createdAt).toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
          <span className="text-[#475569] text-xs tabular-nums">{formatElapsed(durationSec)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] bg-[#475569]/10 border border-[#475569]/30 text-[#475569] shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-[#475569]" />
        Terminated
      </div>
    </div>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { sessions, terminateSession, getElapsed } = useSessionContext();
  const [terminateTarget, setTerminateTarget] = useState<Session | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Only one session may be active at a time - our backend's active/terminated
  // status is one-way (no pause/resume), so "current session" is simply
  // whichever one, if any, hasn't been terminated yet.
  const activeSession = sessions.find((s) => s.status === 'active') ?? null;
  // Backend orders sessions -created_at, so this is already most-recent-first.
  const pastSessions = sessions.filter((s) => s.status === 'terminated').slice(0, 5);

  // Live elapsed ticker
  useEffect(() => {
    if (!activeSession) { setElapsed(0); return; }
    const tick = () => setElapsed(getElapsed(activeSession));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [activeSession, getElapsed]);

  const handleTerminateConfirm = () => {
    if (terminateTarget) { terminateSession(terminateTarget.id); setTerminateTarget(null); }
  };

  const hasSession = !!activeSession;

  return (
    <div className="min-h-screen bg-[#080C15] text-[#E5E7EB] flex flex-col">

      {/* Top bar */}
      <div className="border-b border-[#3B82F6]/10 px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-[#475569]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
          System Online
        </div>
      </div>

      {/* Hero */}
      <div className="flex flex-col items-center justify-center pt-12 pb-8 px-6 text-center">
        {/* ── Brand wordmark ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1] }}
          className="mb-4 relative flex flex-col items-center"
        >
          <div className="absolute inset-0 blur-3xl opacity-12 bg-[#3B82F6] rounded-full scale-[2] pointer-events-none" />
          <VisouraWordmark
            size="lg"
            style={{ filter: 'drop-shadow(0 0 10px rgba(59,130,246,0.35))', position: 'relative', zIndex: 10 }}
          />
        </motion.div>

        {/* CTA — State 1: enabled; State 2: disabled */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="mt-5 flex flex-col items-center gap-2"
        >
          <motion.button
            whileHover={!hasSession ? { scale: 1.03 } : {}}
            whileTap={!hasSession ? { scale: 0.97 } : {}}
            onClick={() => !hasSession && navigate('/session/new')}
            disabled={hasSession}
            className={`flex items-center gap-2.5 px-8 py-3.5 rounded-2xl transition-all ${
              hasSession
                ? 'bg-[#1E293B] text-[#475569] cursor-not-allowed opacity-50'
                : 'bg-[#3B82F6] hover:bg-[#2563EB] text-white shadow-[0_0_24px_rgba(59,130,246,0.35)]'
            }`}
          >
            <Plus className="w-5 h-5" />
            <span style={{ fontWeight: 500 }}>Start New Session</span>
          </motion.button>

          <AnimatePresence>
            {hasSession && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="text-[#475569] text-xs"
              >
                Terminate the current session to start a new one
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Current Session section */}
      <div className="flex-1 max-w-lg w-full mx-auto px-6 pb-8">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-[#94A3B8] text-xs uppercase tracking-widest">
            {hasSession ? 'Current Session' : 'Active Sessions'}
          </h2>
          <div className="flex-1 h-px bg-[#3B82F6]/10" />
        </div>

        <AnimatePresence mode="wait">
          {!hasSession ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col items-center justify-center py-16 gap-4"
            >
              <div className="w-16 h-16 rounded-full bg-[#0D1220] border border-[#3B82F6]/15 flex items-center justify-center">
                <Camera className="w-7 h-7 text-[#3B82F6]/40" />
              </div>
              <p className="text-[#475569] text-sm">No session running — start one above</p>
            </motion.div>
          ) : (
            <motion.div key="session">
              <CurrentSessionCard
                session={activeSession}
                elapsed={elapsed}
                onOpen={() => navigate(`/session/${activeSession.id}`)}
                onTerminate={() => setTerminateTarget(activeSession)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Past Sessions */}
      {pastSessions.length > 0 && (
        <div className="max-w-lg w-full mx-auto px-6 pb-12">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[#94A3B8] text-xs uppercase tracking-widest">Past Sessions</h2>
            <span className="px-2 py-0.5 bg-[#3B82F6]/10 border border-[#3B82F6]/20 text-[#3B82F6] text-[10px] rounded-full">
              {pastSessions.length}
            </span>
            <div className="flex-1 h-px bg-[#3B82F6]/10" />
          </div>
          <div className="space-y-2">
            {pastSessions.map((s) => (
              <PastSessionCard key={s.id} session={s} />
            ))}
          </div>
        </div>
      )}

      {/* Terminate Modal */}
      <AnimatePresence>
        {terminateTarget && (
          <TerminateConfirmModal
            session={terminateTarget}
            onConfirm={handleTerminateConfirm}
            onCancel={() => setTerminateTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
