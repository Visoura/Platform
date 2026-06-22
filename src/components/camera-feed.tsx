import { useState, useEffect, useRef } from 'react';
import { Play, Pause, ZoomIn, Maximize2, ChevronLeft, ChevronRight, RotateCcw, Radio } from 'lucide-react';
import { motion } from 'motion/react';

interface Detection {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface CameraFeedProps {
  cameraId: number;
  cameraName?: string;
  isSelected: boolean;
  onSelect: () => void;
  onPersonDetected: (personId: number, cameraId: number) => void;
  onPersonClick: (personId: number) => void;
  isExpanded?: boolean;
  globalSpeed?: number;
  sessionElapsed?: number; // seconds since session started
  highlightPerson?: number | null;
  videoUrl?: string | null;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CameraFeed({
  cameraId,
  cameraName,
  isSelected,
  onSelect,
  onPersonDetected,
  onPersonClick,
  isExpanded = false,
  globalSpeed = 1,
  sessionElapsed = 0,
  highlightPerson,
  videoUrl,
}: CameraFeedProps) {
  const [detections, setDetections] = useState<Detection[]>([]);

  // Stream / live model
  const [localOffset, setLocalOffset] = useState(0); // seconds behind live
  const [localPaused, setLocalPaused] = useState(false);
  const [pausedViewTime, setPausedViewTime] = useState(0);

  // Derived
  const viewTimeSec = localPaused
    ? pausedViewTime
    : Math.max(0, sessionElapsed - localOffset);
  const isLive = !localPaused && localOffset < 0.5;

  // Timeline progress (0–100, loops every ~333 s)
  const timelinePercent = (viewTimeSec * 0.3) % 100;

  // Local pause / play
  const handleLocalPlayPause = () => {
    if (localPaused) {
      // Resume: set offset so we stay at pausedViewTime
      const newOffset = Math.max(0, sessionElapsed - pausedViewTime);
      setLocalOffset(newOffset);
      setLocalPaused(false);
    } else {
      setPausedViewTime(viewTimeSec);
      setLocalPaused(true);
    }
  };

  // Go to live
  const handleGoLive = () => {
    setLocalOffset(0);
    setLocalPaused(false);
  };

  // Step backward (go 15 s into the past)
  const handleStepBack = () => {
    const current = localPaused ? Math.max(0, sessionElapsed - pausedViewTime) : localOffset;
    setLocalOffset(current + 15);
    setLocalPaused(false);
  };

  // Step forward (15 s toward live)
  const handleStepForward = () => {
    const newOffset = Math.max(0, (localPaused ? Math.max(0, sessionElapsed - pausedViewTime) : localOffset) - 15);
    setLocalOffset(newOffset);
    setLocalPaused(false);
  };

  // Video element for uploaded content
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && videoUrl) {
      const v = videoRef.current;
      if (localPaused) {
        v.pause();
      } else {
        v.playbackRate = globalSpeed;
        v.play().catch(() => {});
      }
    }
  }, [localPaused, globalSpeed, videoUrl]);

  // Sync video seek position to viewTimeSec
  useEffect(() => {
    if (videoRef.current && videoUrl) {
      const v = videoRef.current;
      const duration = v.duration;
      if (duration > 0) {
        const targetTime = viewTimeSec % duration;
        if (Math.abs(v.currentTime - targetTime) > 1.5) {
          v.currentTime = targetTime;
        }
      }
    }
  }, [viewTimeSec, videoUrl]);

  // Mock detections (stable per camera)
  useEffect(() => {
    const mockDetections: Detection[] = [];
    const numDetections = (cameraId % 3) + 1;
    for (let i = 0; i < numDetections; i++) {
      const seed = cameraId * 37 + i * 17;
      mockDetections.push({
        id: cameraId * 10 + i + 1,
        x: ((seed * 13) % 60) + 8,
        y: ((seed * 7) % 55) + 8,
        width: 12 + (seed % 10),
        height: 22 + (seed % 14),
        label: `Person #${cameraId * 10 + i + 1}`,
      });
    }
    setDetections(mockDetections);
    mockDetections.forEach(det => onPersonDetected(det.id, cameraId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId]);

  return (
    <motion.div
      className={`relative bg-[#020617] rounded-xl overflow-hidden border-2 transition-all flex flex-col ${
        isSelected
          ? 'border-[#3B82F6] shadow-[0_0_20px_rgba(59,130,246,0.4)]'
          : 'border-[#161B2A]'
      }`}
      onClick={onSelect}
      whileHover={{ scale: isExpanded ? 1 : 1.005 }}
      transition={{ duration: 0.2 }}
    >
      {/* Camera Label */}
      <div className="absolute top-2 left-2 bg-[#161B2A]/85 backdrop-blur-sm px-2 py-1 rounded-md text-xs text-[#E5E7EB] z-10">
        {cameraName ?? `Camera ${cameraId}`}
      </div>

      {/* LIVE / Offset Status Badge */}
      <div className="absolute top-2 right-2 z-10">
        {isLive ? (
          <div className="flex items-center gap-1.5 bg-[#0D1220]/90 backdrop-blur-sm px-2.5 py-1 rounded-md border border-[#22C55E]/40">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
            <span className="text-[#22C55E] text-[11px]" style={{ fontWeight: 600 }}>
              LIVE
            </span>
            <span className="text-[#22C55E]/70 text-[11px] tabular-nums">
              {formatTime(sessionElapsed)}
            </span>
          </div>
        ) : localPaused ? (
          <div className="flex items-center gap-1.5 bg-[#0D1220]/90 backdrop-blur-sm px-2.5 py-1 rounded-md border border-[#F59E0B]/40">
            <Pause className="w-3 h-3 text-[#F59E0B]" />
            <span className="text-[#F59E0B] text-[11px] tabular-nums">
              {formatTime(viewTimeSec)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-[#0D1220]/90 backdrop-blur-sm px-2.5 py-1 rounded-md border border-[#F59E0B]/40">
            <Radio className="w-3 h-3 text-[#F59E0B]" />
            <span className="text-[#F59E0B] text-[11px] tabular-nums">
              -{formatTime(localOffset)}
            </span>
          </div>
        )}
      </div>

      {/* Video Feed */}
      <div className="relative flex-1 min-h-0 bg-gradient-to-br from-[#0B0F19] to-[#020617] overflow-hidden">
        {/* Uploaded video */}
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
        ) : (
          /* Mock feed: grid lines */
          <div className="absolute inset-0">
            <div className="absolute inset-0 opacity-5"
              style={{
                backgroundImage: 'linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            {/* Scan line */}
            <motion.div
              className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#3B82F6]/40 to-transparent"
              animate={{ top: ['0%', '100%'] }}
              transition={{ duration: 4 / globalSpeed, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        )}

        {/* Detection Boxes */}
        {detections.map((det) => (
          <button
            key={det.id}
            onClick={(e) => { e.stopPropagation(); onPersonClick(det.id); }}
            className={`absolute border-2 transition-all cursor-pointer ${
              highlightPerson === det.id
                ? 'border-[#3B82F6] shadow-[0_0_15px_rgba(59,130,246,0.6)]'
                : 'border-[#22C55E] hover:border-[#3B82F6] hover:shadow-[0_0_10px_rgba(59,130,246,0.4)]'
            }`}
            style={{
              left: `${det.x}%`,
              top: `${det.y}%`,
              width: `${det.width}%`,
              height: `${det.height}%`,
            }}
          >
            <div className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] pointer-events-none whitespace-nowrap ${
              highlightPerson === det.id ? 'bg-[#3B82F6] text-white' : 'bg-[#22C55E] text-white'
            }`}>
              {det.label}
            </div>
          </button>
        ))}
      </div>

      {/* Per-Camera Controls — hover reveal */}
      <div
        className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between bg-[#0D1220]/95 backdrop-blur-sm rounded-lg px-2 py-1.5 opacity-0 hover:opacity-100 transition-opacity z-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5">
          {/* Local Play/Pause */}
          <button
            onClick={handleLocalPlayPause}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#3B82F6]/20 text-[#E5E7EB] transition-colors"
            title={localPaused ? 'Resume' : 'Pause'}
          >
            {localPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>

          {/* Reverse */}
          <button
            onClick={() => setLocalOffset(0) /* rewind to 0 = live */}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#3B82F6]/20 text-[#E5E7EB] transition-colors"
            title="Reverse"
          >
            <RotateCcw className="w-3 h-3" />
          </button>

          {/* Step Back */}
          <button
            onClick={handleStepBack}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#3B82F6]/20 text-[#E5E7EB] transition-colors"
            title="Back 15s"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>

          {/* Step Forward */}
          <button
            onClick={handleStepForward}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#3B82F6]/20 text-[#E5E7EB] transition-colors"
            title="Forward 15s"
          >
            <ChevronRight className="w-3 h-3" />
          </button>

          {/* LIVE button when not at live */}
          {!isLive && (
            <button
              onClick={handleGoLive}
              className="flex items-center gap-1 px-2 py-0.5 bg-[#22C55E]/20 hover:bg-[#22C55E]/30 border border-[#22C55E]/50 text-[#22C55E] rounded text-[10px] transition-colors ml-1"
              title="Jump to Live"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              LIVE
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {/* Zoom */}
          <button
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#3B82F6]/20 text-[#E5E7EB] transition-colors"
            title="Zoom"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          {/* Expand */}
          <button
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#3B82F6]/20 text-[#E5E7EB] transition-colors"
            title="Expand"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#161B2A]/60">
        <div
          className="h-full bg-gradient-to-r from-[#3B82F6] to-[#3B82F6]/60 transition-all duration-1000"
          style={{ width: `${timelinePercent}%` }}
        />
        {/* Detection markers */}
        {[18, 34, 55, 71, 88].map((pos, idx) => (
          <div
            key={idx}
            className="absolute top-0 w-0.5 h-full bg-[#22C55E]/70"
            style={{ left: `${pos}%` }}
          />
        ))}
      </div>
    </motion.div>
  );
}