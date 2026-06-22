import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Play, Square, Camera, Clock, AlertTriangle, X } from 'lucide-react';
import { useSessionContext } from '../context/session-context';
import type { Session } from '../context/session-context';
import { EyeLogo } from '../components/eye-logo';

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
    <AnimatePresence>
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
    </AnimatePresence>
  );
}

function SessionCard({
  session,
  onResume,
  onTerminate,
}: {
  session: Session;
  onResume: () => void;
  onTerminate: () => void;
}) {
  const isRunning = session.status === 'running';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
      className="bg-[#0D1220] border border-[#3B82F6]/15 hover:border-[#3B82F6]/35 rounded-2xl p-5 transition-colors group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[#E5E7EB] text-sm" style={{ fontWeight: 600 }}>{session.name}</h3>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex items-center gap-1.5 text-[#475569] text-xs">
              <Camera className="w-3 h-3" />
              <span>{session.cameraCount} camera{session.cameraCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#475569] text-xs">
              <Clock className="w-3 h-3" />
              <span>{session.createdAt}</span>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] shrink-0 ${
          isRunning
            ? 'bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E]'
            : 'bg-[#475569]/10 border border-[#475569]/30 text-[#475569]'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-[#22C55E] animate-pulse' : 'bg-[#475569]'}`} />
          {isRunning ? 'Running' : 'Stopped'}
        </div>
      </div>

      {/* Camera mini-icons */}
      <div className="flex gap-1 mb-4">
        {Array.from({ length: Math.min(session.cameraCount, 8) }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full ${
              isRunning ? 'bg-[#3B82F6]/50' : 'bg-[#1E293B]'
            }`}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onResume}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-xl text-xs transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {isRunning ? 'Open Dashboard' : 'Resume Session'}
        </button>
        <button
          onClick={onTerminate}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 rounded-xl text-xs transition-colors"
        >
          <Square className="w-3.5 h-3.5" />
          Terminate
        </button>
      </div>
    </motion.div>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { sessions, terminateSession, resumeSession } = useSessionContext();
  const [terminateTarget, setTerminateTarget] = useState<Session | null>(null);

  const handleTerminateConfirm = () => {
    if (terminateTarget) {
      terminateSession(terminateTarget.id);
      setTerminateTarget(null);
    }
  };

  const handleResume = (session: Session) => {
    if (session.status === 'stopped') resumeSession(session.id);
    navigate(`/session/${session.id}`);
  };

  return (
    <div className="min-h-screen bg-[#080C15] text-[#E5E7EB] flex flex-col">
      {/* Top bar */}
      <div className="border-b border-[#3B82F6]/10 px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-[#475569]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
          System Online
        </div>
      </div>

      {/* Hero section */}
      <div className="flex flex-col items-center justify-center pt-20 pb-16 px-6 text-center">
        {/* Eye logo hero */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1] }}
          className="mb-8 relative"
        >
          <div className="absolute inset-0 blur-3xl opacity-20 bg-[#3B82F6] rounded-full scale-150 pointer-events-none" />
          <motion.div
            className="relative z-10"
            style={{ filter: 'drop-shadow(0 0 20px rgba(59,130,246,0.5))' }}
            animate={{
              scaleY: [1, 1, 0.08, 1, 1, 1, 0.08, 1, 1],
              scaleX: [1, 1, 1.04, 1, 1, 1, 1.04, 1, 1],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: 'easeInOut',
              times: [0, 0.28, 0.32, 0.36, 0.7, 0.82, 0.86, 0.9, 1],
              repeatDelay: 1.5,
            }}
          >
            <EyeLogo className="h-[44px] w-auto" />
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <h1 className="text-[#E5E7EB] mb-2 tracking-wide" style={{ fontSize: 28, fontWeight: 600 }}>
            AI Surveillance System
          </h1>
          <p className="text-[#475569] text-sm max-w-sm mx-auto leading-relaxed">
            Intelligent multi-camera monitoring with real-time person detection and session management
          </p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/session/new')}
          className="mt-8 flex items-center gap-2.5 px-8 py-3.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-2xl transition-colors shadow-[0_0_24px_rgba(59,130,246,0.35)]"
        >
          <Plus className="w-5 h-5" />
          <span style={{ fontWeight: 500 }}>Start New Session</span>
        </motion.button>
      </div>

      {/* Active Sessions */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-6 pb-12">
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-[#94A3B8] text-xs uppercase tracking-widest">Active Sessions</h2>
          {sessions.length > 0 && (
            <span className="px-2 py-0.5 bg-[#3B82F6]/10 border border-[#3B82F6]/20 text-[#3B82F6] text-[10px] rounded-full">
              {sessions.length}
            </span>
          )}
          <div className="flex-1 h-px bg-[#3B82F6]/10" />
        </div>

        {sessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col items-center justify-center py-16 gap-4"
          >
            <div className="w-16 h-16 rounded-full bg-[#0D1220] border border-[#3B82F6]/15 flex items-center justify-center">
              <Camera className="w-7 h-7 text-[#3B82F6]/40" />
            </div>
            <p className="text-[#475569] text-sm">No sessions yet — start one above</p>
          </motion.div>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            layout
          >
            <AnimatePresence mode="sync">
              {sessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onResume={() => handleResume(session)}
                  onTerminate={() => setTerminateTarget(session)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Terminate Modal */}
      {terminateTarget && (
        <TerminateConfirmModal
          session={terminateTarget}
          onConfirm={handleTerminateConfirm}
          onCancel={() => setTerminateTarget(null)}
        />
      )}
    </div>
  );
}