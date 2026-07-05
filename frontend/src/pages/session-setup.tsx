import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Play, Check, Camera, Loader2 } from 'lucide-react';
import { useSessionContext } from '../context/session-context';
import { api, ApiCamera } from '../lib/api';
import { VisouraWordmark } from '../components/visoura-wordmark';
import { IntroSplash } from '../components/intro-splash';

const MAX_CAMERAS = 4;

function CameraCard({
  camera,
  selected,
  disabled,
  onToggle,
}: {
  camera: ApiCamera;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.button
      onClick={() => !disabled && onToggle()}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      className={`relative text-left rounded-2xl border-2 p-4 transition-all duration-200 flex flex-col gap-3 ${
        selected
          ? 'border-[#3B82F6] bg-[#3B82F6]/10 shadow-[0_0_18px_rgba(59,130,246,0.25)]'
          : disabled
          ? 'border-[#1E293B] bg-[#080C15]/60 opacity-45 cursor-not-allowed'
          : 'border-[#3B82F6]/15 bg-[#0D1220] hover:border-[#3B82F6]/40 hover:bg-[#0D1220] cursor-pointer'
      }`}
    >
      {/* Selection tick */}
      <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
        selected
          ? 'bg-[#3B82F6] border-[#3B82F6]'
          : 'border-[#3B82F6]/25 bg-transparent'
      }`}>
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>

      {/* Camera preview thumbnail */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#020617]">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(59,130,246,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.8) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <motion.div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#3B82F6]/50 to-transparent"
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 3 + (camera.id % 3), repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute bottom-1.5 left-2 text-[#3B82F6]/30 text-[10px] tabular-nums">
          CAM-{String(camera.id).padStart(2, '0')}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 pr-6">
        <div className="flex items-center gap-2">
          <Camera className="w-3.5 h-3.5 text-[#3B82F6]/70 shrink-0" />
          <span className="text-[#E5E7EB] text-sm truncate" style={{ fontWeight: 500 }}>
            {camera.name}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

export function SessionSetup() {
  const navigate = useNavigate();
  const { createSession } = useSessionContext();
  const [cameras, setCameras] = useState<ApiCamera[]>([]);
  const [loadingCameras, setLoadingCameras] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCameras()
      .then(setCameras)
      .catch(() => setLoadError('Could not load cameras from the backend.'))
      .finally(() => setLoadingCameras(false));
  }, []);

  const toggleCamera = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_CAMERAS) {
        next.add(id);
      }
      return next;
    });
  };

  const selectFirst4 = () => setSelectedIds(new Set(cameras.slice(0, MAX_CAMERAS).map((c) => c.id)));
  const clearAll = () => setSelectedIds(new Set());
  const allFirstFourSelected =
    cameras.length > 0 && cameras.slice(0, MAX_CAMERAS).every((c) => selectedIds.has(c.id));

  const handleStart = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const session = await createSession(Array.from(selectedIds));
      setLoadingSessionId(session.id);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Failed to start session');
      setStarting(false);
    }
  };

  const selectedCount = selectedIds.size;

  if (loadingSessionId) {
    return <IntroSplash onComplete={() => navigate(`/session/${loadingSessionId}`)} />;
  }

  return (
    <div className="min-h-screen bg-[#080C15] text-[#E5E7EB] flex flex-col">

      {/* Top bar */}
      <div className="border-b border-[#3B82F6]/10 px-8 py-3 flex items-center justify-between shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-[#475569] hover:text-[#94A3B8] transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <VisouraWordmark size="sm" style={{ opacity: 0.5 }} />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto px-6 py-10 min-h-0">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h2 className="text-[#E5E7EB] mb-1" style={{ fontSize: 22, fontWeight: 600 }}>
            Select Cameras
          </h2>
          <p className="text-[#475569] text-sm">
            Choose up to {MAX_CAMERAS} cameras to include in this monitoring session.
          </p>
        </motion.div>

        {/* Toolbar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex items-center justify-between mb-5"
        >
          <div className="flex items-center gap-3">
            <span className="text-[#94A3B8] text-xs uppercase tracking-widest">
              Available Cameras
            </span>
            <span className="px-2 py-0.5 bg-[#3B82F6]/10 border border-[#3B82F6]/20 text-[#3B82F6] text-[10px] rounded-full">
              {cameras.length}
            </span>
          </div>
          {cameras.length > 0 && (
            <div className="flex items-center gap-3">
              <AnimatePresence>
                {selectedCount >= MAX_CAMERAS && (
                  <motion.span
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="text-[10px] text-[#F59E0B] border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-2 py-0.5 rounded-full"
                  >
                    Max reached
                  </motion.span>
                )}
              </AnimatePresence>
              <button
                onClick={allFirstFourSelected ? clearAll : selectFirst4}
                className="text-xs text-[#3B82F6] hover:text-[#60A5FA] transition-colors"
              >
                {allFirstFourSelected ? 'Clear all' : 'Select first 4'}
              </button>
            </div>
          )}
        </motion.div>

        {loadingCameras ? (
          <div className="flex-1 flex items-center justify-center text-[#475569] text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading cameras…
          </div>
        ) : loadError ? (
          <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
            {loadError}
          </div>
        ) : cameras.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#475569] text-sm">
            No cameras registered yet — add some from the Django admin panel.
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 flex-1 overflow-y-auto pb-4"
          >
            <AnimatePresence>
              {cameras.map((camera, i) => (
                <motion.div
                  key={camera.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                >
                  <CameraCard
                    camera={camera}
                    selected={selectedIds.has(camera.id)}
                    disabled={!selectedIds.has(camera.id) && selectedCount >= MAX_CAMERAS}
                    onToggle={() => toggleCamera(camera.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Footer bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-6 flex items-center justify-between pt-5 border-t border-[#3B82F6]/10"
        >
          <div className="flex items-center gap-3">
            {startError && <span className="text-red-400 text-sm">{startError}</span>}
            <AnimatePresence mode="wait">
              {selectedCount > 0 ? (
                <motion.div
                  key="selected"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  className="flex items-center gap-2 text-sm"
                >
                  <div className="flex gap-1">
                    {Array.from(selectedIds).map((id) => {
                      const cam = cameras.find((c) => c.id === id);
                      return (
                        <div
                          key={id}
                          className="w-6 h-6 rounded-md bg-[#3B82F6]/20 border border-[#3B82F6]/40 flex items-center justify-center"
                          title={cam?.name}
                        >
                          <span className="text-[#3B82F6] text-[9px]" style={{ fontWeight: 700 }}>{id}</span>
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-[#94A3B8]">
                    <span
                      className={selectedCount >= MAX_CAMERAS ? 'text-[#F59E0B]' : 'text-[#E5E7EB]'}
                      style={{ fontWeight: 500 }}
                    >
                      {selectedCount}
                    </span>
                    {' '}/ {MAX_CAMERAS} camera{selectedCount !== 1 ? 's' : ''} selected
                  </span>
                </motion.div>
              ) : (
                <motion.span
                  key="none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[#475569] text-sm"
                >
                  No cameras selected
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              disabled={starting}
              className="px-5 py-2.5 bg-[#0D1220] hover:bg-[#131928] border border-[#3B82F6]/15 text-[#94A3B8] hover:text-[#E5E7EB] rounded-xl transition-colors text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <motion.button
              onClick={handleStart}
              disabled={selectedCount === 0 || starting}
              whileHover={selectedCount > 0 && !starting ? { scale: 1.03 } : {}}
              whileTap={selectedCount > 0 && !starting ? { scale: 0.97 } : {}}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all text-sm ${
                selectedCount > 0 && !starting
                  ? 'bg-[#22C55E] hover:bg-[#16A34A] text-white shadow-[0_0_16px_rgba(34,197,94,0.3)]'
                  : 'bg-[#1E293B] text-[#475569] cursor-not-allowed'
              }`}
            >
              {starting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Monitoring
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
