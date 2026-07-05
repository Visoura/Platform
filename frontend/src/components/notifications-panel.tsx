import { motion } from 'motion/react';
import { X, MapPin, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

export interface SearchRecord {
  id: string;
  /** 'tracking': detected in the uploaded photo, not yet seen live.
   * 'match_found': actually seen in a camera (flips in-place from 'tracking',
   * same id, once BoxWatcher first sees this targetId). */
  type: 'tracking' | 'match_found' | 'not_found';
  targetId?: string;
  cameraId?: number;
  timestamp?: string;   // when match was found
  startedAt?: string;   // when the search was kicked off
  searchImageUrl?: string;
}

interface NotificationsPanelProps {
  notifications: SearchRecord[];
  onNotificationClick: (n: SearchRecord) => void;
  onClose: () => void;
}

export function NotificationsPanel({ notifications, onNotificationClick, onClose }: NotificationsPanelProps) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, x: 300 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 300 }}
        className="fixed top-16 right-4 bottom-4 w-80 bg-[#161B2A] border border-[#3B82F6]/25 rounded-xl shadow-[0_0_30px_rgba(59,130,246,0.2)] z-50 flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3B82F6]/15 shrink-0">
          <div>
            <h3 className="text-[#E5E7EB] text-sm" style={{ fontWeight: 600 }}>Search Results</h3>
            <p className="text-xs text-[#475569] mt-0.5">{notifications.length} entr{notifications.length !== 1 ? 'ies' : 'y'}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#3B82F6]/20 rounded transition-colors">
            <X className="w-4 h-4 text-[#94A3B8]" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {notifications.length === 0 ? (
              <div className="text-center py-12 text-[#475569] text-sm">
                <div className="w-14 h-14 mx-auto mb-3 bg-[#0B0F19] rounded-full flex items-center justify-center">
                  <MapPin className="w-7 h-7 text-[#3B82F6]/40" />
                </div>
                No search results yet
              </div>
            ) : (
              notifications.map((n) => {
                const thumb = (
                  <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden border border-white/8 bg-[#020617] flex items-center justify-center">
                    {n.searchImageUrl
                      ? <img src={n.searchImageUrl} alt="Searched" className="w-full h-full object-cover" />
                      : <div className="w-5 h-7 border border-[#3B82F6]/40 rounded-t-full opacity-50" />
                    }
                  </div>
                );

                if (n.type === 'tracking') return (
                  <div key={n.id} className="bg-[#0B0F19] border border-[#3B82F6]/15 rounded-lg p-3 flex items-center gap-3">
                    {thumb}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Loader2 className="w-3 h-3 text-[#3B82F6] animate-spin shrink-0" />
                        <span className="text-xs text-[#94A3B8]" style={{ fontWeight: 500 }}>Tracking…</span>
                      </div>
                      <p className="text-[10px] text-[#475569]">
                        Started {n.startedAt ?? '—'}
                      </p>
                    </div>
                  </div>
                );

                if (n.type === 'not_found') return (
                  <div key={n.id} className="bg-[#0B0F19] border border-[#F59E0B]/20 rounded-lg p-3 flex items-center gap-3">
                    {thumb}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <AlertCircle className="w-3 h-3 text-[#F59E0B] shrink-0" />
                        <span className="text-xs text-[#F59E0B]" style={{ fontWeight: 500 }}>No Match Found</span>
                      </div>
                      <p className="text-[10px] text-[#475569]">
                        Started {n.startedAt ?? '—'}
                      </p>
                    </div>
                  </div>
                );

                // match_found
                return (
                  <div key={n.id}
                    className="bg-[#0B0F19] border border-[#3B82F6]/20 rounded-lg p-3 flex items-center gap-3 hover:border-[#3B82F6]/45 transition-all group cursor-pointer"
                    onClick={() => onNotificationClick(n)}
                  >
                    {thumb}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-[#22C55E] shrink-0" />
                          <span className="text-xs text-[#22C55E]" style={{ fontWeight: 500 }}>Match Found</span>
                        </div>
                        <span className="text-[10px] text-[#475569] tabular-nums shrink-0">{n.timestamp}</span>
                      </div>
                      <p className="text-[10px] text-[#475569] truncate">
                        Person #{n.targetId?.slice(0, 8)} · Camera {n.cameraId}
                      </p>
                    </div>
                    <MapPin className="w-3.5 h-3.5 text-[#3B82F6]/40 group-hover:text-[#3B82F6] transition-colors shrink-0" />
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </motion.div>
    </>
  );
}
