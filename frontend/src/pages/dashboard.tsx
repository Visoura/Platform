import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Square, Home } from 'lucide-react';
import { CameraFeed } from '../components/camera-feed';
import { TerminateModal } from '../components/terminate-modal';
import { useSessionContext } from '../context/session-context';
import { useSessionFeed } from '../hooks/use-session-feed';
import { api, TrackingCandidate } from '../lib/api';
import { EyeLogo } from '../components/eye-logo';

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface PendingCandidates {
  cameraId: number;
  token: string;
  candidates: TrackingCandidate[];
}

export function Dashboard() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { sessions, loading, terminateSession, getElapsed } = useSessionContext();

  const session = sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    if (!loading && !session) navigate('/');
  }, [loading, session, navigate]);

  const { framesByCamera } = useSessionFeed(session?.id);

  // ── Session elapsed timer ─────────────────────────────────────────────
  const [sessionElapsed, setSessionElapsed] = useState(0);
  useEffect(() => {
    if (!session) return;
    const update = () => setSessionElapsed(getElapsed(session));
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [session, getElapsed]);

  // ── Click-to-track ────────────────────────────────────────────────────
  const [selectedCamera, setSelectedCamera] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingCandidates | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  const handleTrackClick = useCallback(
    async (cameraId: number, frameBase64: string, xFrac: number, yFrac: number) => {
      try {
        const res = await api.startTracking({ camera_id: cameraId, frame: frameBase64, x: xFrac, y: yFrac });
        if (res.status === 'tracked') {
          setFeedback('Target added to tracking');
        } else if (res.status === 'no_detection') {
          setFeedback('No person detected there');
        } else {
          setPending({ cameraId, token: res.token, candidates: res.candidates });
        }
      } catch {
        setFeedback('Tracking request failed');
      }
    },
    []
  );

  const handlePickCandidate = useCallback(
    async (index: number) => {
      if (!pending) return;
      try {
        const res = await api.confirmTracking({ token: pending.token, index });
        setFeedback(res.status === 'tracked' ? 'Target added to tracking' : 'Could not confirm target');
      } catch {
        setFeedback('Tracking request failed');
      } finally {
        setPending(null);
      }
    },
    [pending]
  );

  // ── Session controls ──────────────────────────────────────────────────
  const [showTerminateModal, setShowTerminateModal] = useState(false);

  const handleTerminate = async () => {
    if (!session) return;
    await terminateSession(session.id);
    setShowTerminateModal(false);
    navigate('/');
  };

  if (!session) return null;

  return (
    <>
      <div className="min-h-screen bg-[#080C15] text-[#E5E7EB] flex flex-col">

        {/* ── Top Navigation ──────────────────────────────────────────── */}
        <nav className="bg-[#0F1624] border-b border-[#3B82F6]/15 px-5 py-2 shrink-0">
          <div className="flex items-center justify-between gap-4">

            {/* Left: Logo + Nav buttons */}
            <div className="flex items-center gap-5">
              <motion.div
                animate={{ opacity: [1, 0.35, 1, 0.35, 1] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', times: [0, 0.08, 0.2, 0.28, 0.4] }}
                style={{ filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.5))' }}
                className="shrink-0"
              >
                <EyeLogo className="h-[18px] w-auto" />
              </motion.div>

              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#080C15] hover:bg-[#0B0F19] border border-[#3B82F6]/20 text-[#94A3B8] hover:text-[#E5E7EB] rounded-lg transition-colors text-sm"
              >
                <Home className="w-3.5 h-3.5" />
                Home
              </button>
            </div>

            {/* Center: Session info */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <span className="text-[#475569] text-[9px] uppercase tracking-widest">Session</span>
                <span className="text-[#94A3B8] text-xs" style={{ fontWeight: 500 }}>{session.name}</span>
              </div>

              <div className="flex flex-col items-center px-4 py-1.5 bg-[#080C15] border border-[#3B82F6]/20 rounded-xl">
                <span className="text-[#475569] text-[8px] uppercase tracking-widest mb-0.5">Elapsed</span>
                <span
                  className="text-[#3B82F6] tabular-nums"
                  style={{ fontWeight: 600, fontSize: 17, letterSpacing: '0.05em' }}
                >
                  {formatTime(sessionElapsed)}
                </span>
              </div>

              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                session.status === 'active'
                  ? 'border-[#22C55E]/30 bg-[#22C55E]/8 text-[#22C55E]'
                  : 'border-[#475569]/30 bg-[#475569]/8 text-[#475569]'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${session.status === 'active' ? 'bg-[#22C55E] animate-pulse' : 'bg-[#475569]'}`} />
                {session.status === 'active' ? 'Live' : 'Terminated'}
              </div>
            </div>

            {/* Right: Session controls */}
            <div className="flex items-center gap-2">
              {session.status === 'active' && (
                <button
                  onClick={() => setShowTerminateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 hover:text-red-300 rounded-lg transition-colors text-sm"
                  title="Terminate Session"
                >
                  <Square className="w-3.5 h-3.5" />
                  Terminate
                </button>
              )}
            </div>
          </div>
        </nav>

        {/* ── Main Content ────────────────────────────────────────────── */}
        <div className="flex-1 flex p-3 overflow-hidden min-h-0">
          <div className="flex-1 flex rounded-2xl overflow-hidden border border-[#3B82F6]/15 bg-[#0D1220] min-w-0">
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <div className="flex-1 p-3 overflow-auto min-h-0">
                <div
                  className={`grid gap-3 h-full ${
                    session.cameras.length <= 1 ? 'grid-cols-1' : 'grid-cols-2'
                  }`}
                >
                  {session.cameras.map((camera) => (
                    <CameraFeed
                      key={camera.id}
                      cameraId={camera.id}
                      cameraName={camera.name}
                      isSelected={selectedCamera === camera.id}
                      onSelect={() => setSelectedCamera(camera.id)}
                      frameMessage={framesByCamera[camera.id]}
                      onTrackClick={handleTrackClick}
                      pendingCandidates={pending?.cameraId === camera.id ? pending.candidates : null}
                      onPickCandidate={pending?.cameraId === camera.id ? handlePickCandidate : undefined}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Feedback toast ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0F1624] border border-[#3B82F6]/30 text-[#E5E7EB] text-sm px-4 py-2.5 rounded-xl shadow-lg z-50"
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Terminate Modal ──────────────────────────────────────────────── */}
      {showTerminateModal && (
        <TerminateModal
          title={`Terminate ${session.name}?`}
          message="This will permanently end the session and all tracking data will be lost. This cannot be undone."
          onConfirm={handleTerminate}
          onCancel={() => setShowTerminateModal(false)}
        />
      )}
    </>
  );
}
