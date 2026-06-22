import { motion } from 'motion/react';
import { X, MapPin, History } from 'lucide-react';

interface PersonCardProps {
  personId: number;
  cameraId: number;
  timestamp: string;
  isVisible: boolean;
  onClose: () => void;
  onLocate: () => void;
  onTrackHistory: () => void;
}

export function PersonCard({
  personId,
  cameraId,
  timestamp,
  isVisible,
  onClose,
  onLocate,
  onTrackHistory
}: PersonCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[#161B2A] border border-[#3B82F6]/30 rounded-lg shadow-[0_0_30px_rgba(59,130,246,0.3)] w-80"
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-1 hover:bg-[#3B82F6]/20 rounded transition-colors"
      >
        <X className="w-4 h-4 text-[#94A3B8]" />
      </button>

      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          {/* Thumbnail */}
          <div className="w-20 h-20 bg-[#020617] rounded-lg flex items-center justify-center border border-[#22C55E]">
            <div className="w-10 h-14 border-2 border-[#22C55E] rounded-t-full"></div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-[#E5E7EB]">Person #{personId}</h3>
            <div className={`inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded text-xs ${
              isVisible ? 'bg-[#22C55E]/20 text-[#22C55E]' : 'bg-[#94A3B8]/20 text-[#94A3B8]'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isVisible ? 'bg-[#22C55E]' : 'bg-[#94A3B8]'}`}></div>
              {isVisible ? 'Visible now' : 'Last seen'}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-[#94A3B8]">Camera:</span>
            <span className="text-[#E5E7EB]">Camera {cameraId}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#94A3B8]">Timestamp:</span>
            <span className="text-[#E5E7EB]">{timestamp}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onLocate}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white rounded-lg transition-colors"
          >
            <MapPin className="w-4 h-4" />
            Locate Now
          </button>
          <button
            onClick={onTrackHistory}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#161B2A] hover:bg-[#0B0F19] border border-[#3B82F6]/30 text-[#E5E7EB] rounded-lg transition-colors"
          >
            <History className="w-4 h-4" />
            Track History
          </button>
        </div>
      </div>
    </motion.div>
  );
}
