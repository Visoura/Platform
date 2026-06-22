import { motion } from 'motion/react';
import { X, MapPin } from 'lucide-react';

interface SearchNotificationProps {
  personId: number;
  cameraId: number;
  timestamp: string;
  onViewCamera: () => void;
  onClose: () => void;
}

export function SearchNotification({
  personId,
  cameraId,
  timestamp,
  onViewCamera,
  onClose
}: SearchNotificationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className="fixed top-4 right-4 z-50 w-80 bg-[#161B2A] border border-[#3B82F6] rounded-lg shadow-[0_0_30px_rgba(59,130,246,0.4)] overflow-hidden"
    >
      {/* Header */}
      <div className="bg-[#3B82F6] px-4 py-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Match Found</h3>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-white/20 rounded transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Video Preview Placeholder */}
        <div className="relative aspect-video bg-[#020617] rounded-lg mb-3 overflow-hidden border border-[#22C55E]">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-24 border-2 border-[#22C55E] rounded-t-full animate-pulse"></div>
          </div>
          <div className="absolute bottom-2 left-2 right-2 h-1 bg-[#161B2A]/50 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#3B82F6]"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 3, repeat: Infinity }}
            ></motion.div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-3">
          <div className="flex justify-between text-sm">
            <span className="text-[#94A3B8]">Person ID:</span>
            <span className="text-[#E5E7EB]">#{personId}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#94A3B8]">Camera:</span>
            <span className="text-[#E5E7EB]">Camera {cameraId}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#94A3B8]">Timestamp:</span>
            <span className="text-[#E5E7EB]">{timestamp}</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onViewCamera}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white rounded-lg transition-colors"
        >
          <MapPin className="w-4 h-4" />
          View on Camera
        </button>
      </div>
    </motion.div>
  );
}
