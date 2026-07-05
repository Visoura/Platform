import { motion } from 'motion/react';
import { X, History, Activity, Square, Loader2 } from 'lucide-react';

interface PersonCardProps {
  /** null = not yet tracked (a preview - Start Tracking hasn't been
   * confirmed yet). History works independently of tracking status either
   * way - if not yet tracked, pressing History resolves an identity for
   * this person transparently in the background first. */
  targetId: string | null;
  cameraId: number;
  timestamp: string;
  isVisible: boolean;
  starting: boolean;
  historyLoading: boolean;
  onClose: () => void;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onTrackHistory: () => void;
}

export function PersonCard({
  targetId, cameraId, timestamp, isVisible, starting, historyLoading,
  onClose, onStartTracking, onStopTracking, onTrackHistory,
}: PersonCardProps) {
  const isTracking = targetId !== null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 16 }}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[#161B2A] border border-[#3B82F6]/30 rounded-xl shadow-[0_0_32px_rgba(59,130,246,0.28)] w-80"
    >
      <button onClick={onClose} className="absolute top-2.5 right-2.5 p-1 hover:bg-[#3B82F6]/20 rounded transition-colors">
        <X className="w-4 h-4 text-[#94A3B8]" />
      </button>

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-[#020617] rounded-lg flex items-center justify-center border border-[#22C55E]/40 shrink-0">
            <div className="w-8 h-11 border-2 border-[#22C55E] rounded-t-full opacity-70" />
          </div>
          <div>
            <h3 className="text-[#E5E7EB] mb-1" style={{ fontSize: 16, fontWeight: 600 }}>
              {targetId ? `Person #${targetId.slice(0, 8)}` : 'New Detection'}
            </h3>
            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${
              isTracking ? 'bg-[#3B82F6]/20 text-[#3B82F6]'
                : isVisible ? 'bg-[#22C55E]/15 text-[#22C55E]'
                : 'bg-[#94A3B8]/15 text-[#94A3B8]'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isTracking ? 'bg-[#3B82F6] animate-pulse' : isVisible ? 'bg-[#22C55E]' : 'bg-[#94A3B8]'}`} />
              {isTracking ? 'Tracking' : isVisible ? 'Visible now' : 'Last seen'}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 mb-4 bg-[#0A1220] rounded-lg p-3 border border-[#3B82F6]/10">
          <div className="flex justify-between text-sm">
            <span className="text-[#94A3B8]">Camera</span>
            <span className="text-[#E5E7EB]">Camera {cameraId}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#94A3B8]">Timestamp</span>
            <span className="text-[#E5E7EB] tabular-nums">{timestamp}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={isTracking ? onStopTracking : onStartTracking}
            disabled={starting}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm disabled:opacity-50 ${
              isTracking
                ? 'bg-red-600/12 hover:bg-red-600/22 border border-red-500/30 text-red-400 hover:text-red-300'
                : 'bg-[#22C55E]/12 hover:bg-[#22C55E]/22 border border-[#22C55E]/30 text-[#22C55E] hover:text-[#4ADE80]'
            }`}
          >
            {starting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Starting…</>
            ) : isTracking ? (
              <><Square className="w-3.5 h-3.5" />Stop Tracking</>
            ) : (
              <><Activity className="w-3.5 h-3.5" />Start Tracking</>
            )}
          </button>

          <button
            onClick={onTrackHistory}
            disabled={historyLoading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0A1220] hover:bg-[#0D1628] border border-[#3B82F6]/20 hover:border-[#3B82F6]/40 text-[#94A3B8] hover:text-[#E5E7EB] rounded-lg transition-colors text-sm disabled:opacity-50"
          >
            {historyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
            History
          </button>
        </div>
      </div>
    </motion.div>
  );
}
