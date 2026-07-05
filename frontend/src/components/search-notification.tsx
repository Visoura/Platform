import { motion } from 'motion/react';
import { X, MapPin, AlertCircle } from 'lucide-react';

type SearchNotificationProps =
  | { type: 'found'; targetId: string; cameraId: number; timestamp: string; onViewCamera: () => void; onClose: () => void }
  | { type: 'not_found'; searchImageUrl?: string; onClose: () => void };

export function SearchNotification(props: SearchNotificationProps) {
  const { type, onClose } = props;

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className={`fixed top-4 right-4 z-50 w-72 bg-[#161B2A] rounded-xl shadow-[0_0_28px_rgba(0,0,0,0.5)] overflow-hidden border ${
        type === 'found' ? 'border-[#3B82F6]/40' : 'border-[#F59E0B]/30'
      }`}
    >
      <div className={`px-4 py-2.5 flex items-center justify-between ${
        type === 'found' ? 'bg-[#3B82F6]' : 'bg-[#92400E]/60 border-b border-[#F59E0B]/30'
      }`}>
        <div className="flex items-center gap-2">
          {type === 'not_found' && <AlertCircle className="w-4 h-4 text-[#F59E0B]" />}
          <h3 className={`text-sm ${type === 'found' ? 'text-white' : 'text-[#F59E0B]'}`} style={{ fontWeight: 600 }}>
            {type === 'found' ? 'Match Found' : 'No Match Found'}
          </h3>
        </div>
        <button onClick={onClose} className="p-0.5 hover:bg-white/20 rounded transition-colors">
          <X className={`w-4 h-4 ${type === 'found' ? 'text-white' : 'text-[#F59E0B]'}`} />
        </button>
      </div>

      <div className="p-4">
        {type === 'found' ? (
          <>
            <div className="relative aspect-video bg-[#020617] rounded-lg mb-3 overflow-hidden border border-[#22C55E]/30">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-20 border-2 border-[#22C55E] rounded-t-full animate-pulse opacity-70" />
              </div>
              <div className="absolute bottom-2 left-2 right-2 h-1 bg-[#161B2A]/50 rounded-full overflow-hidden">
                <motion.div className="h-full bg-[#3B82F6]" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 3, repeat: Infinity }} />
              </div>
            </div>
            <div className="space-y-1.5 mb-3">
              <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Person ID</span><span className="text-[#E5E7EB]">#{props.targetId.slice(0, 8)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Camera</span><span className="text-[#E5E7EB]">Camera {props.cameraId}</span></div>
              <div className="flex justify-between text-sm"><span className="text-[#94A3B8]">Timestamp</span><span className="text-[#E5E7EB] tabular-nums">{props.timestamp}</span></div>
            </div>
            <button onClick={props.onViewCamera} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-lg transition-colors text-sm">
              <MapPin className="w-4 h-4" /> View on Camera
            </button>
          </>
        ) : (
          <>
            {props.searchImageUrl && (
              <div className="relative aspect-video bg-[#020617] rounded-lg mb-3 overflow-hidden border border-[#F59E0B]/20">
                <img
                  src={props.searchImageUrl}
                  alt="Searched image"
                  className="absolute inset-0 w-full h-full object-cover opacity-75"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E18]/80 to-transparent" />
                <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[#F59E0B] text-[10px]">
                  <AlertCircle className="w-3 h-3" />
                  No match
                </div>
              </div>
            )}
            <div className="py-1 text-center">
              <p className="text-[#94A3B8] text-sm mb-1">Search Not Found</p>
              <p className="text-[#475569] text-xs">No matching person was found in the current feeds.</p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
