import { motion } from 'motion/react';
import { X, Play } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

interface SearchResult {
  personId: number;
  cameraId: number;
  timestamp: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  onResultClick: (result: SearchResult) => void;
  onClose: () => void;
}

export function SearchResults({ results, onResultClick, onClose }: SearchResultsProps) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        className="fixed top-16 right-4 bottom-20 w-96 bg-[#161B2A] border border-[#3B82F6]/30 rounded-lg shadow-[0_0_30px_rgba(59,130,246,0.3)] z-50 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3B82F6]/20">
          <h3 className="text-lg font-semibold text-[#E5E7EB]">Search Results</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#3B82F6]/20 rounded transition-colors"
          >
            <X className="w-4 h-4 text-[#94A3B8]" />
          </button>
        </div>

        {/* Results List */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {results.length === 0 ? (
              <div className="text-center py-8 text-[#94A3B8] text-sm">
                No search results yet
              </div>
            ) : (
              results.map((result, index) => (
                <div
                  key={index}
                  className="bg-[#0B0F19] border border-[#3B82F6]/20 rounded-lg overflow-hidden hover:border-[#3B82F6]/40 transition-all"
                >
                  {/* Video Preview */}
                  <div className="relative aspect-video bg-[#020617] flex items-center justify-center">
                    <div className="w-12 h-16 border-2 border-[#22C55E] rounded-t-full"></div>
                    <button
                      onClick={() => onResultClick(result)}
                      className="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center group transition-colors"
                    >
                      <div className="w-10 h-10 bg-[#3B82F6] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-5 h-5 text-white ml-0.5" />
                      </div>
                    </button>
                  </div>

                  {/* Details */}
                  <div className="p-3 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#94A3B8]">Person ID:</span>
                      <span className="text-[#E5E7EB]">#{result.personId}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#94A3B8]">Camera:</span>
                      <span className="text-[#E5E7EB]">Camera {result.cameraId}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#94A3B8]">Time:</span>
                      <span className="text-[#E5E7EB]">{result.timestamp}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </motion.div>
    </>
  );
}
