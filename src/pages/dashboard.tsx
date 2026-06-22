import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Bell, ChevronLeft, ChevronRight, RefreshCw, Square, Home } from 'lucide-react';
import { CameraFeed } from '../components/camera-feed';
import { PersonCard } from '../components/person-card';
import { SearchNotification } from '../components/search-notification';
import { GlobalControls } from '../components/global-controls';
import { NotificationsPanel } from '../components/notifications-panel';
import { TerminateModal } from '../components/terminate-modal';
import { useSessionContext } from '../context/session-context';
import { EyeLogo } from '../components/eye-logo';

interface DetectedPerson {
  id: number;
  cameraId: number;
  lastSeen: string;
  isVisible: boolean;
}

const CAMERAS_PER_PAGE = 4;

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function Dashboard() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { sessions, terminateSession, restartSession, getElapsed } = useSessionContext();

  const session = sessions.find(s => s.id === sessionId);

  // Redirect to home if session not found
  useEffect(() => {
    if (!session) navigate('/');
  }, [session, navigate]);

  // ── Session elapsed timer ─────────────────────────────────────────────
  const [sessionElapsed, setSessionElapsed] = useState(0);
  useEffect(() => {
    if (!session) return;
    const update = () => setSessionElapsed(getElapsed(session));
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [session, getElapsed]);

  // ── Camera pagination ─────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(0);
  const cameraCount = session?.cameraCount ?? 0;
  const totalPages = Math.ceil(cameraCount / CAMERAS_PER_PAGE);
  const pageStart = currentPage * CAMERAS_PER_PAGE;
  const pageCameras = (session?.cameras ?? []).slice(pageStart, pageStart + CAMERAS_PER_PAGE);
  const pageCameraIds = pageCameras.map(c => c.cameraId);

  // ── Detection state ───────────────────────────────────────────────────
  const [selectedCamera, setSelectedCamera] = useState<number | null>(null);
  const [detectedPersons, setDetectedPersons] = useState<DetectedPerson[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<DetectedPerson | null>(null);
  const [highlightPerson, setHighlightPerson] = useState<number | null>(null);

  const handlePersonDetected = useCallback((personId: number, cameraId: number) => {
    setDetectedPersons(prev => {
      if (prev.find(p => p.id === personId)) return prev;
      const now = new Date();
      return [...prev, {
        id: personId, cameraId, isVisible: true,
        lastSeen: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }];
    });
  }, []);

  // ── Global playback ───────────────────────────────────────────────────
  const [globalPlaying, setGlobalPlaying] = useState(true);
  const [globalSpeed, setGlobalSpeed] = useState(1);

  // ── Notifications ─────────────────────────────────────────────────────
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ personId: number; cameraId: number; timestamp: string }>>([]);
  const [searchNotification, setSearchNotification] = useState<{ personId: number; cameraId: number; timestamp: string } | null>(null);

  const handleSearchByImage = () => {
    const rnd = detectedPersons[Math.floor(Math.random() * detectedPersons.length)];
    if (rnd) {
      const ts = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const result = { personId: rnd.id, cameraId: rnd.cameraId, timestamp: ts };
      setSearchNotification(result);
      setNotifications(prev => [result, ...prev]);
    }
  };

  // ── Session modals ────────────────────────────────────────────────────
  const [showTerminateModal, setShowTerminateModal] = useState(false);

  const handleTerminate = () => {
    if (!session) return;
    terminateSession(session.id);
    navigate('/');
  };

  const handleRestart = () => {
    if (!session) return;
    restartSession(session.id);
    setDetectedPersons([]);
    setCurrentPage(0);
  };

  const handleLocatePerson = () => {
    if (selectedPerson) {
      setSelectedCamera(selectedPerson.cameraId);
      setHighlightPerson(selectedPerson.id);
      setSelectedPerson(null);
    }
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
              {/* Blinking Eye Logo */}
              <motion.div
                animate={{ opacity: [1, 0.35, 1, 0.35, 1] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', times: [0, 0.08, 0.2, 0.28, 0.4] }}
                style={{ filter: 'drop-shadow(0 0 8px rgba(59,130,246,0.5))' }}
                className="shrink-0"
              >
                <EyeLogo className="h-[18px] w-auto" />
              </motion.div>

              {/* Nav buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#080C15] hover:bg-[#0B0F19] border border-[#3B82F6]/20 text-[#94A3B8] hover:text-[#E5E7EB] rounded-lg transition-colors text-sm"
                >
                  <Home className="w-3.5 h-3.5" />
                  Home
                </button>

                <button
                  onClick={handleSearchByImage}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-lg transition-colors text-sm"
                >
                  <Search className="w-3.5 h-3.5" />
                  Search
                </button>

                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 bg-[#080C15] hover:bg-[#0B0F19] border border-[#3B82F6]/20 text-[#94A3B8] hover:text-[#E5E7EB] rounded-lg transition-colors"
                >
                  <Bell className="w-4 h-4" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#F59E0B] rounded-full text-[9px] flex items-center justify-center text-white">
                      {notifications.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Center: Session info */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <span className="text-[#475569] text-[9px] uppercase tracking-widest">Session</span>
                <span className="text-[#94A3B8] text-xs" style={{ fontWeight: 500 }}>{session.name}</span>
              </div>

              {/* Session Timer */}
              <div className="flex flex-col items-center px-4 py-1.5 bg-[#080C15] border border-[#3B82F6]/20 rounded-xl">
                <span className="text-[#475569] text-[8px] uppercase tracking-widest mb-0.5">Elapsed</span>
                <span
                  className="text-[#3B82F6] tabular-nums"
                  style={{ fontWeight: 600, fontSize: 17, letterSpacing: '0.05em' }}
                >
                  {formatTime(sessionElapsed)}
                </span>
              </div>

              {/* Status */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                session.status === 'running'
                  ? 'border-[#22C55E]/30 bg-[#22C55E]/8 text-[#22C55E]'
                  : 'border-[#475569]/30 bg-[#475569]/8 text-[#475569]'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${session.status === 'running' ? 'bg-[#22C55E] animate-pulse' : 'bg-[#475569]'}`} />
                {session.status === 'running' ? 'Live' : 'Stopped'}
              </div>
            </div>

            {/* Right: Session controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleRestart}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#080C15] hover:bg-[#0B0F19] border border-[#3B82F6]/20 text-[#94A3B8] hover:text-[#E5E7EB] rounded-lg transition-colors text-sm"
                title="Restart Session"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Restart
              </button>

              <button
                onClick={() => setShowTerminateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 hover:text-red-300 rounded-lg transition-colors text-sm"
                title="Terminate Session"
              >
                <Square className="w-3.5 h-3.5" />
                Terminate
              </button>
            </div>
          </div>
        </nav>

        {/* ── Main Content ────────────────────────────────────────────── */}
        <div className="flex-1 flex p-3 overflow-hidden min-h-0">

          {/* ── Unified Container ─────────────────────────────────────── */}
          <div className="flex-1 flex rounded-2xl overflow-hidden border border-[#3B82F6]/15 bg-[#0D1220] min-w-0">

            {/* ── Camera Workspace ──────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">

              {/* Pagination header (only if multiple pages) */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-b border-[#3B82F6]/10 shrink-0">
                  <span className="text-[#475569] text-xs">
                    {session.name} · {cameraCount} cameras
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#080C15] border border-[#3B82F6]/15 text-[#94A3B8] hover:text-[#E5E7EB] hover:border-[#3B82F6]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentPage(i)}
                          className={`w-6 h-6 rounded text-[10px] transition-colors ${
                            i === currentPage
                              ? 'bg-[#3B82F6] text-white'
                              : 'bg-[#080C15] border border-[#3B82F6]/15 text-[#475569] hover:text-[#94A3B8]'
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={currentPage === totalPages - 1}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#080C15] border border-[#3B82F6]/15 text-[#94A3B8] hover:text-[#E5E7EB] hover:border-[#3B82F6]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <span className="text-[#475569] text-xs ml-1">
                      Page {currentPage + 1}/{totalPages}
                    </span>
                  </div>
                </div>
              )}

              {/* Camera Grid */}
              <div className="flex-1 p-3 overflow-auto min-h-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentPage}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className={`grid gap-3 h-full ${
                      pageCameraIds.length === 1 ? 'grid-cols-1' :
                      pageCameraIds.length === 2 ? 'grid-cols-2' :
                      pageCameraIds.length === 3 ? 'grid-cols-2' :
                      'grid-cols-2'
                    }`}
                  >
                    {pageCameraIds.map((cameraId) => (
                      <CameraFeed
                        key={`page-${currentPage}-cam-${cameraId}`}
                        cameraId={cameraId}
                        cameraName={pageCameras.find(c => c.cameraId === cameraId)?.name}
                        isSelected={selectedCamera === cameraId}
                        onSelect={() => setSelectedCamera(cameraId)}
                        onPersonDetected={handlePersonDetected}
                        onPersonClick={(personId) => {
                          const person = detectedPersons.find(p => p.id === personId);
                          if (person) setSelectedPerson(person);
                        }}
                        globalSpeed={globalSpeed}
                        sessionElapsed={sessionElapsed}
                        highlightPerson={selectedCamera === cameraId ? highlightPerson : null}
                      />
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Global Controls */}
              <GlobalControls
                isPlaying={globalPlaying}
                speed={globalSpeed}
                onPlayPause={() => setGlobalPlaying(!globalPlaying)}
                onSpeedChange={setGlobalSpeed}
              />
            </div>

          </div>
        </div>
      </div>

      {/* ── Person Info Card ────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedPerson && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setSelectedPerson(null)}
            />
            <PersonCard
              personId={selectedPerson.id}
              cameraId={selectedPerson.cameraId}
              timestamp={selectedPerson.lastSeen}
              isVisible={selectedPerson.isVisible}
              onClose={() => setSelectedPerson(null)}
              onLocate={handleLocatePerson}
              onTrackHistory={() => setSelectedPerson(null)}
            />
          </>
        )}
      </AnimatePresence>

      {/* ── Search Notification ─────────────────────────────────────────── */}
      <AnimatePresence>
        {searchNotification && (
          <SearchNotification
            personId={searchNotification.personId}
            cameraId={searchNotification.cameraId}
            timestamp={searchNotification.timestamp}
            onViewCamera={() => {
              setSelectedCamera(searchNotification.cameraId);
              setHighlightPerson(searchNotification.personId);
              setSearchNotification(null);
            }}
            onClose={() => setSearchNotification(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Notifications Panel ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showNotifications && (
          <NotificationsPanel
            notifications={notifications}
            onNotificationClick={(n) => {
              setSelectedCamera(n.cameraId);
              setHighlightPerson(n.personId);
              setShowNotifications(false);
            }}
            onClose={() => setShowNotifications(false)}
          />
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