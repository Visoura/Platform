import { motion, AnimatePresence } from 'motion/react';
import { X, Square, MapPin, AlertCircle, Activity } from 'lucide-react';

export interface TrackingRecord {
  personId: number;
  cameraId: number;
  cameraName: string;
  startedAt: string;
  status: 'tracking' | 'lost';
}

interface ActiveTrackingsPanelProps {
  trackings: TrackingRecord[];
  onStopTracking: (personId: number) => void;
  onLocate: (personId: number, cameraId: number) => void;
  onDismiss: (personId: number) => void;
}

export function ActiveTrackingsPanel({
  trackings,
  onStopTracking,
  onLocate,
  onDismiss,
}: ActiveTrackingsPanelProps) {
  const activeCount = trackings.filter(t => t.status === 'tracking').length;

  return (
    <motion.div
      initial={{ opacity: 0, x: 280 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 280 }}
      transition={{ type: 'spring', stiffness: 340, damping: 32 }}
      className="fixed top-[60px] right-4 bottom-4 w-64 bg-[#0F1624] border border-[#3B82F6]/20 rounded-xl shadow-[0_0_24px_rgba(59,130,246,0.12)] z-40 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#3B82F6]/15 flex items-center gap-2.5 shrink-0">
        <Activity className="w-3.5 h-3.5 text-[#3B82F6]" />
        <span className="text-[#E5E7EB] text-xs flex-1" style={{ fontWeight: 600 }}>
          Active Trackings
        </span>
        {activeCount > 0 && (
          <span className="w-5 h-5 rounded-full bg-[#22C55E]/20 text-[#22C55E] text-[10px] flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        <AnimatePresence initial={false}>
          {trackings.map((t) => (
            <motion.div
              key={t.personId}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
              className={`rounded-lg border p-3 ${
                t.status === 'tracking'
                  ? 'bg-[#0A1220] border-[#3B82F6]/20'
                  : 'bg-[#0A1220] border-[#475569]/15'
              }`}
            >
              {/* Row 1: status dot + person ID + dismiss */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {t.status === 'tracking' ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-[#F59E0B]" />
                  )}
                  <span className="text-[#E5E7EB] text-xs" style={{ fontWeight: 500 }}>
                    Person #{t.personId}
                  </span>
                </div>
                <button
                  onClick={() => onDismiss(t.personId)}
                  className="p-0.5 hover:bg-[#3B82F6]/15 rounded transition-colors"
                >
                  <X className="w-3 h-3 text-[#475569] hover:text-[#94A3B8]" />
                </button>
              </div>

              {/* Row 2: camera + time */}
              <div className="text-[10px] text-[#475569] mb-2 pl-3">
                {t.cameraName} · {t.startedAt}
              </div>

              {/* Row 3: actions */}
              {t.status === 'tracking' ? (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onLocate(t.personId, t.cameraId)}
                    className="flex-1 flex items-center justify-center gap-1 py-1 bg-[#080C15] hover:bg-[#0B0F19] border border-[#3B82F6]/20 text-[#94A3B8] hover:text-[#E5E7EB] rounded text-[10px] transition-colors"
                  >
                    <MapPin className="w-2.5 h-2.5" />
                    Locate
                  </button>
                  <button
                    onClick={() => onStopTracking(t.personId)}
                    className="flex-1 flex items-center justify-center gap-1 py-1 bg-red-600/10 hover:bg-red-600/20 border border-red-500/25 text-red-400 hover:text-red-300 rounded text-[10px] transition-colors"
                  >
                    <Square className="w-2.5 h-2.5" />
                    Stop
                  </button>
                </div>
              ) : (
                <div className="pl-3 text-[10px] text-[#F59E0B] flex items-center gap-1">
                  <span>Stopped — no longer visible</span>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
