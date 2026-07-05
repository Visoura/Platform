import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Bell, ChevronLeft, ChevronRight, RefreshCw, Square } from 'lucide-react';
import { CameraFeed } from '../components/camera-feed';
import { PersonCard } from '../components/person-card';
import { SearchNotification } from '../components/search-notification';
import { NotificationsPanel } from '../components/notifications-panel';
import type { SearchRecord } from '../components/notifications-panel';
import { TerminateModal } from '../components/terminate-modal';
import { useSessionContext } from '../context/session-context';
import { useSessionFeed, useCameraFrame } from '../hooks/use-session-feed';
import type { FeedStore, FeedBox } from '../hooks/use-session-feed';
import { api, TrackingCandidate } from '../lib/api';
import { VisouraWordmark } from '../components/visoura-wordmark';

const CAMERAS_PER_PAGE = 4;

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function nowTs() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface PendingCandidates {
  cameraId: number;
  token: string;
  candidates: TrackingCandidate[];
}

interface CardState {
  cameraId: number;
  /** null = not tracked yet - a resolved-but-unconfirmed preview. */
  targetId: string | null;
  /** Only set while targetId is null - what /confirm/ needs once the user
   * presses Start Tracking. */
  pendingConfirm?: { token: string; index: number };
  timestamp: string;
}

/** Non-rendering helper, one per visible camera - reuses the existing
 * rAF-throttled useCameraFrame hook (the store supports multiple listeners
 * per camera) to surface box data at Dashboard level without adding a
 * per-frame callback prop to CameraFeed, which would reintroduce the
 * every-camera-every-frame re-render problem the per-camera store exists
 * to avoid. */
function BoxWatcher({
  cameraId,
  feedStore,
  onBoxes,
}: {
  cameraId: number;
  feedStore: RefObject<FeedStore>;
  onBoxes: (cameraId: number, boxes: FeedBox[]) => void;
}) {
  const frame = useCameraFrame(feedStore, cameraId);
  useEffect(() => {
    if (frame) onBoxes(cameraId, frame.boxes);
  }, [frame, cameraId, onBoxes]);
  return null;
}

export function Dashboard() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { sessions, loading, terminateSession, restartSession, getElapsed } = useSessionContext();

  const session = sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    if (!loading && !session) navigate('/');
  }, [loading, session, navigate]);

  const { store: feedStore } = useSessionFeed(session?.id);

  // ── Session elapsed timer ─────────────────────────────────────────────
  const [sessionElapsed, setSessionElapsed] = useState(0);
  useEffect(() => {
    if (!session) return;
    const update = () => setSessionElapsed(getElapsed(session));
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [session, getElapsed]);

  // ── Camera pagination ──────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(0);
  const cameraCount = session?.cameraCount ?? 0;
  const totalPages = Math.ceil(cameraCount / CAMERAS_PER_PAGE);
  const pageStart = currentPage * CAMERAS_PER_PAGE;
  const pageCameras = (session?.cameras ?? []).slice(pageStart, pageStart + CAMERAS_PER_PAGE);

  const jumpToCamera = useCallback(
    (cameraId: number) => {
      if (!session) return;
      const idx = session.cameras.findIndex((c) => c.id === cameraId);
      if (idx >= 0) setCurrentPage(Math.floor(idx / CAMERAS_PER_PAGE));
      setSelectedCamera(cameraId);
    },
    [session]
  );

  // ── Click-to-track: every click resolves into a card (Start/Stop
  // Tracking + History) instead of acting immediately - the actual
  // track/untrack API call only happens once the user presses a button
  // inside the card. ──────────────────────────────────────────────────────
  const [selectedCamera, setSelectedCamera] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingCandidates | null>(null);
  const [card, setCard] = useState<CardState | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  const handleTrackedBoxClick = useCallback((cameraId: number, targetId: string) => {
    setCard({ cameraId, targetId, timestamp: nowTs() });
  }, []);

  const handleDetectionClick = useCallback(
    async (cameraId: number, frameSeq: number, xFrac: number, yFrac: number) => {
      try {
        const res = await api.previewTracking({ camera_id: cameraId, frame_seq: frameSeq, x: xFrac, y: yFrac });
        if (res.status === 'no_detection') {
          setFeedback('No person detected there');
        } else if (res.candidates.length === 1) {
          setCard({ cameraId, targetId: null, pendingConfirm: { token: res.token, index: 0 }, timestamp: nowTs() });
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
    (index: number) => {
      if (!pending) return;
      setCard({ cameraId: pending.cameraId, targetId: null, pendingConfirm: { token: pending.token, index }, timestamp: nowTs() });
      setPending(null);
    },
    [pending]
  );

  const handleUntrackClick = useCallback(async (targetId: string) => {
    try {
      await api.untrackTarget({ target_id: targetId });
      setFeedback('Target untracked');
    } catch {
      setFeedback('Untrack request failed');
    }
  }, []);

  const handleStartTrackingFromCard = useCallback(async () => {
    if (!card?.pendingConfirm) return;
    setCardBusy(true);
    try {
      const res = await api.confirmTracking(card.pendingConfirm);
      if (res.status === 'tracked' && res.target_id) {
        const targetId = res.target_id;
        setCard((prev) => (prev ? { ...prev, targetId, pendingConfirm: undefined } : prev));
        setFeedback('Target added to tracking');
      } else {
        setFeedback('Could not confirm target');
        setCard(null);
      }
    } catch {
      setFeedback('Tracking request failed');
    } finally {
      setCardBusy(false);
    }
  }, [card]);

  const handleStopTrackingFromCard = useCallback(async () => {
    if (!card?.targetId) return;
    await handleUntrackClick(card.targetId);
    setCard(null);
  }, [card, handleUntrackClick]);

  // History works independently of active tracking status - if this person
  // has never been tracked, pressing History resolves their identity in the
  // background first (the only mechanism we have for a persistent id),
  // without requiring a separate explicit Start Tracking step.
  const [historyLoading, setHistoryLoading] = useState(false);

  const handleTrackHistoryFromCard = useCallback(async () => {
    if (!card) return;
    if (card.targetId) {
      navigate(`/session/${sessionId}/history/${card.targetId}`);
      return;
    }
    if (!card.pendingConfirm) return;
    setHistoryLoading(true);
    try {
      const res = await api.confirmTracking(card.pendingConfirm);
      if (res.status === 'tracked' && res.target_id) {
        const targetId = res.target_id;
        setCard((prev) => (prev ? { ...prev, targetId, pendingConfirm: undefined } : prev));
        navigate(`/session/${sessionId}/history/${targetId}`);
      } else {
        setFeedback('Could not resolve this person');
      }
    } catch {
      setFeedback('Tracking request failed');
    } finally {
      setHistoryLoading(false);
    }
  }, [card, navigate, sessionId]);

  // ── Search / notifications ──────────────────────────────────────────────
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<SearchRecord[]>([]);
  const [popupNotification, setPopupNotification] = useState<SearchRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seenTargetIds = useRef<Set<string>>(new Set());

  const handleBoxes = useCallback((cameraId: number, boxes: FeedBox[]) => {
    const now = nowTs();
    for (const box of boxes) {
      if (!box.matched || !box.target_id) continue;
      // First-ever live sighting of an image-search-tracked person - flip
      // their notification row from 'tracking' to 'match_found'.
      if (box.source === 'image_search' && !seenTargetIds.current.has(box.target_id)) {
        seenTargetIds.current.add(box.target_id);
        const targetId = box.target_id;
        setNotifications((prevN) =>
          prevN.map((n) =>
            n.targetId === targetId && n.type === 'tracking'
              ? { ...n, type: 'match_found' as const, cameraId, timestamp: now }
              : n
          )
        );
        setPopupNotification({ id: `match-${targetId}`, type: 'match_found', targetId, cameraId, timestamp: now });
      }
    }
  }, []);

  const runSearch = async (file: File, imageUrl: string) => {
    const searchId = `s-${Date.now()}`;
    const startedAt = nowTs();
    try {
      const res = await api.searchByImage(file);
      if (res.status === 'no_person_detected') {
        const result: SearchRecord = { id: searchId, type: 'not_found', startedAt, searchImageUrl: imageUrl };
        setNotifications((prev) => [result, ...prev]);
        setPopupNotification(result);
        return;
      }
      // One row per detected person - each starts as 'tracking' and later
      // flips to 'match_found' independently in handleBoxes above.
      const records: SearchRecord[] = res.targets.map((t, i) => ({
        id: `${searchId}-${i}`,
        type: 'tracking',
        targetId: t.target_id,
        startedAt,
        searchImageUrl: imageUrl,
      }));
      setNotifications((prev) => [...records, ...prev]);
    } catch {
      const result: SearchRecord = { id: searchId, type: 'not_found', startedAt, searchImageUrl: imageUrl };
      setNotifications((prev) => [result, ...prev]);
      setPopupNotification(result);
    }
  };

  const handleSearchByImage = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      if (url) runSearch(file, url);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Session controls ──────────────────────────────────────────────────
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const handleTerminate = async () => {
    if (!session) return;
    await terminateSession(session.id);
    setShowTerminateModal(false);
    navigate('/');
  };

  const handleRestart = async () => {
    if (!session) return;
    setRestarting(true);
    try {
      const newSession = await restartSession(session.id);
      navigate(`/session/${newSession.id}`);
    } catch {
      setFeedback('Restart failed');
      setRestarting(false);
    }
  };

  if (!session) return null;

  const matchCount = notifications.filter((n) => n.type === 'match_found').length;

  return (
    <>
      <div className="min-h-screen bg-[#080C15] text-[#E5E7EB] flex flex-col">

        {/* ── Top Nav ─────────────────────────────────────────────────── */}
        <nav className="bg-[#0F1624] border-b border-[#3B82F6]/15 px-5 shrink-0 relative" style={{ height: 48 }}>
          <div className="flex items-center justify-between h-full gap-4">

            {/* Left: wordmark + actions */}
            <div className="flex items-center gap-2.5">
              <VisouraWordmark
                size="sm"
                fontSize={16}
                onClick={() => navigate('/')}
                style={{ opacity: 0.95 }}
                className="shrink-0 hover:opacity-100 transition-opacity"
              />

              <div className="w-px h-4 bg-[#3B82F6]/15" />

              <button
                onClick={handleSearchByImage}
                title="Search by image"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3B82F6]/12 hover:bg-[#3B82F6]/22 text-[#3B82F6] hover:text-[#60A5FA] rounded-lg transition-colors text-xs border border-[#3B82F6]/22"
                style={{ fontWeight: 500 }}
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
                Search
              </button>

              <button
                onClick={() => setShowNotifications(!showNotifications)}
                title="Search results"
                className="relative flex items-center justify-center w-8 h-8 rounded-lg text-[#94A3B8] hover:text-[#E5E7EB] hover:bg-[#3B82F6]/10 border border-[#3B82F6]/15 hover:border-[#3B82F6]/30 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {matchCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#F59E0B] rounded-full text-[9px] flex items-center justify-center text-white leading-none">
                    {matchCount}
                  </span>
                )}
              </button>
            </div>

            {/* Center: session info — absolutely centered in nav */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
              <div className="flex items-center px-3 bg-[#080C15] border border-[#3B82F6]/15 rounded-lg pointer-events-auto" style={{ height: 28 }}>
                <span className="text-[#94A3B8] text-[11px]" style={{ fontWeight: 500 }}>{session.name}</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 bg-[#080C15] border border-[#3B82F6]/20 rounded-lg pointer-events-auto" style={{ height: 28 }}>
                <span className="text-[#3B82F6]/40 text-[10px]">Elapsed</span>
                <span className="text-[#3B82F6] tabular-nums" style={{ fontWeight: 600, fontSize: 13, letterSpacing: '0.04em' }}>
                  {formatTime(sessionElapsed)}
                </span>
              </div>

              <div
                className={`flex items-center gap-1.5 px-3 rounded-lg border pointer-events-auto ${
                  session.status === 'active'
                    ? 'border-[#22C55E]/30 bg-[#22C55E]/8 text-[#22C55E]'
                    : 'border-[#475569]/30 bg-[#475569]/8 text-[#475569]'
                }`}
                style={{ height: 28 }}
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${session.status === 'active' ? 'bg-[#22C55E] animate-pulse' : 'bg-[#475569]'}`} />
                <span className="text-[11px]">{session.status === 'active' ? 'Live' : 'Stopped'}</span>
              </div>
            </div>

            {/* Right: session controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleRestart}
                disabled={restarting}
                title="Restart session"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-[#94A3B8] hover:text-[#E5E7EB] hover:bg-[#3B82F6]/10 border border-[#3B82F6]/15 hover:border-[#3B82F6]/30 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-4 h-4 ${restarting ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowTerminateModal(true)}
                title="Terminate session"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-[#94A3B8] hover:text-red-400 hover:bg-red-600/8 border border-[#3B82F6]/15 hover:border-red-500/30 transition-colors"
              >
                <Square className="w-4 h-4" />
              </button>
            </div>
          </div>
        </nav>

        {/* ── Main Content ────────────────────────────────────────────── */}
        <div className="flex-1 flex p-3 overflow-hidden min-h-0">
          <div className="flex-1 flex rounded-2xl overflow-hidden border border-[#3B82F6]/15 bg-[#0D1220] min-w-0 flex-col">

            {/* Pagination header */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-b border-[#3B82F6]/10 shrink-0">
                <span className="text-[#475569] text-xs">{session.name} · {cameraCount} cameras</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#080C15] border border-[#3B82F6]/15 text-[#94A3B8] hover:text-[#E5E7EB] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button key={i} onClick={() => setCurrentPage(i)}
                      className={`w-6 h-6 rounded text-[10px] transition-colors ${i === currentPage ? 'bg-[#3B82F6] text-white' : 'bg-[#080C15] border border-[#3B82F6]/15 text-[#475569] hover:text-[#94A3B8]'}`}>
                      {i + 1}
                    </button>
                  ))}
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage === totalPages - 1}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#080C15] border border-[#3B82F6]/15 text-[#94A3B8] hover:text-[#E5E7EB] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[#475569] text-xs ml-1">Page {currentPage + 1}/{totalPages}</span>
                </div>
              </div>
            )}

            {/* Camera Grid */}
            <div className="flex-1 p-3 overflow-auto min-h-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentPage}
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className={`grid gap-3 h-full ${pageCameras.length <= 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
                >
                  {pageCameras.map((camera) => (
                    <CameraFeed
                      key={camera.id}
                      cameraId={camera.id}
                      cameraName={camera.name}
                      isSelected={selectedCamera === camera.id}
                      onSelect={() => setSelectedCamera(camera.id)}
                      feedStore={feedStore}
                      onTrackedBoxClick={handleTrackedBoxClick}
                      onDetectionClick={handleDetectionClick}
                      pendingCandidates={pending?.cameraId === camera.id ? pending.candidates : null}
                      onPickCandidate={pending?.cameraId === camera.id ? handlePickCandidate : undefined}
                    />
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* ── Person Card (Start/Stop Tracking + History) ──────────────────── */}
      <AnimatePresence>
        {card && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setCard(null)} />
            <PersonCard
              targetId={card.targetId}
              cameraId={card.cameraId}
              timestamp={card.timestamp}
              isVisible
              starting={cardBusy}
              historyLoading={historyLoading}
              onClose={() => setCard(null)}
              onStartTracking={handleStartTrackingFromCard}
              onStopTracking={handleStopTrackingFromCard}
              onTrackHistory={handleTrackHistoryFromCard}
            />
          </>
        )}
      </AnimatePresence>

      {/* ── Search popup ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {popupNotification && (
          popupNotification.type === 'match_found' ? (
            <SearchNotification
              type="found"
              targetId={popupNotification.targetId!}
              cameraId={popupNotification.cameraId!}
              timestamp={popupNotification.timestamp!}
              onViewCamera={() => { jumpToCamera(popupNotification.cameraId!); setPopupNotification(null); }}
              onClose={() => setPopupNotification(null)}
            />
          ) : (
            <SearchNotification type="not_found" searchImageUrl={popupNotification.searchImageUrl} onClose={() => setPopupNotification(null)} />
          )
        )}
      </AnimatePresence>

      {/* ── Notifications Panel ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showNotifications && (
          <NotificationsPanel
            notifications={notifications}
            onNotificationClick={(n) => {
              if (n.type === 'match_found' && n.cameraId && n.targetId) {
                jumpToCamera(n.cameraId);
              }
              setShowNotifications(false);
            }}
            onClose={() => setShowNotifications(false)}
          />
        )}
      </AnimatePresence>

      {/* Hidden file input for image search */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Feedback toast (real API outcomes: track/untrack/pick) ────────── */}
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

      {/* BoxWatchers - no visual output, feed handleBoxes for first-sighting
          notifications */}
      {pageCameras.map((camera) => (
        <BoxWatcher key={camera.id} cameraId={camera.id} feedStore={feedStore} onBoxes={handleBoxes} />
      ))}

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
