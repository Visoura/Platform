import { motion, AnimatePresence } from 'motion/react';
import { Search, X } from 'lucide-react';

interface SearchConfirmModalProps {
  imageUrl: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SearchConfirmModal({ imageUrl, onConfirm, onCancel }: SearchConfirmModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.88, y: 20 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="bg-[#0F1624] border border-[#3B82F6]/30 rounded-2xl shadow-[0_0_50px_rgba(59,130,246,0.2)] w-full max-w-sm p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#3B82F6]/10 border border-[#3B82F6]/30 flex items-center justify-center">
                <Search className="w-5 h-5 text-[#3B82F6]" />
              </div>
              <h3 className="text-[#E5E7EB] text-sm" style={{ fontWeight: 600 }}>Confirm Search</h3>
            </div>
            <button onClick={onCancel} className="p-1 rounded hover:bg-[#1E293B] transition-colors">
              <X className="w-4 h-4 text-[#475569]" />
            </button>
          </div>

          <div className="mb-5 rounded-xl overflow-hidden border border-[#3B82F6]/15 bg-[#020617] flex items-center justify-center">
            <img src={imageUrl} alt="Selected for search" className="w-full max-h-64 object-contain" />
          </div>

          <p className="text-[#94A3B8] text-sm mb-6 leading-relaxed">
            Every person detected in this photo will be tracked across all cameras in this session.
          </p>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 bg-[#1E293B] hover:bg-[#263245] border border-[#3B82F6]/15 text-[#E5E7EB] rounded-xl transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-xl transition-colors text-sm"
            >
              <Search className="w-4 h-4" />
              Search
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
