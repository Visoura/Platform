import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { FrameMessage } from '../hooks/use-session-feed';
import type { TrackingCandidate } from '../lib/api';

interface CameraFeedProps {
  cameraId: number;
  cameraName?: string;
  isSelected: boolean;
  onSelect: () => void;
  frameMessage?: FrameMessage;
  onTrackClick: (cameraId: number, frameBase64: string, xFrac: number, yFrac: number) => void;
  pendingCandidates?: TrackingCandidate[] | null;
  onPickCandidate?: (index: number) => void;
}

export function CameraFeed({
  cameraId,
  cameraName,
  isSelected,
  onSelect,
  frameMessage,
  onTrackClick,
  pendingCandidates,
  onPickCandidate,
}: CameraFeedProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // The <img> uses object-fit: contain, so the visible frame is letterboxed
  // inside the element's box whenever its aspect ratio doesn't match the
  // container's. Map natural-frame pixel coords <-> on-screen coords through
  // that letterbox, rather than assuming the box is exactly the frame's ratio.
  const getDisplayRect = () => {
    if (!naturalSize || !imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const scale = Math.min(rect.width / naturalSize.w, rect.height / naturalSize.h);
    const dispW = naturalSize.w * scale;
    const dispH = naturalSize.h * scale;
    return {
      rect,
      scale,
      offsetX: (rect.width - dispW) / 2,
      offsetY: (rect.height - dispH) / 2,
      dispW,
      dispH,
    };
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!frameMessage) return;
    const display = getDisplayRect();
    if (!display) return;
    const relX = e.clientX - display.rect.left - display.offsetX;
    const relY = e.clientY - display.rect.top - display.offsetY;
    if (relX < 0 || relY < 0 || relX > display.dispW || relY > display.dispH) return; // clicked the letterbox bars
    onTrackClick(cameraId, frameMessage.frame, relX / display.dispW, relY / display.dispH);
  };

  const toBoxStyle = (bbox: [number, number, number, number]) => {
    const display = getDisplayRect();
    if (!display) return null;
    const [x1, y1, x2, y2] = bbox;
    return {
      left: `${display.offsetX + x1 * display.scale}px`,
      top: `${display.offsetY + y1 * display.scale}px`,
      width: `${(x2 - x1) * display.scale}px`,
      height: `${(y2 - y1) * display.scale}px`,
    };
  };

  return (
    <motion.div
      className={`relative bg-[#020617] rounded-xl overflow-hidden border-2 transition-all flex flex-col ${
        isSelected
          ? 'border-[#3B82F6] shadow-[0_0_20px_rgba(59,130,246,0.4)]'
          : 'border-[#161B2A]'
      }`}
      onClick={onSelect}
      whileHover={{ scale: 1.005 }}
      transition={{ duration: 0.2 }}
    >
      {/* Camera Label */}
      <div className="absolute top-2 left-2 bg-[#161B2A]/85 backdrop-blur-sm px-2 py-1 rounded-md text-xs text-[#E5E7EB] z-10">
        {cameraName ?? frameMessage?.camera_name ?? `Camera ${cameraId}`}
      </div>

      {/* LIVE / connecting badge */}
      <div className="absolute top-2 right-2 z-10">
        {frameMessage ? (
          <div className="flex items-center gap-1.5 bg-[#0D1220]/90 backdrop-blur-sm px-2.5 py-1 rounded-md border border-[#22C55E]/40">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
            <span className="text-[#22C55E] text-[11px]" style={{ fontWeight: 600 }}>
              LIVE
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-[#0D1220]/90 backdrop-blur-sm px-2.5 py-1 rounded-md border border-[#F59E0B]/40">
            <span className="text-[#F59E0B] text-[11px]">Connecting…</span>
          </div>
        )}
      </div>

      {/* Video Feed */}
      <div className="relative flex-1 min-h-0 bg-gradient-to-br from-[#0B0F19] to-[#020617] overflow-hidden">
        {frameMessage ? (
          <img
            ref={imgRef}
            src={`data:image/jpeg;base64,${frameMessage.frame}`}
            onClick={handleImageClick}
            onLoad={(e) => {
              const img = e.currentTarget;
              setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            className="absolute inset-0 w-full h-full object-contain cursor-crosshair"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0">
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            <motion.div
              className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#3B82F6]/40 to-transparent"
              animate={{ top: ['0%', '100%'] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        )}

        {/* Detection boxes */}
        {!pendingCandidates &&
          naturalSize &&
          frameMessage?.boxes.map((box, i) => {
            const style = toBoxStyle(box.bbox);
            if (!style) return null;
            return (
              <div
                key={i}
                className={`absolute border-2 pointer-events-none ${
                  box.matched
                    ? 'border-[#3B82F6] shadow-[0_0_15px_rgba(59,130,246,0.6)]'
                    : 'border-[#22C55E]'
                }`}
                style={style}
              />
            );
          })}

        {/* Ambiguous click: pick which detection the user meant */}
        {pendingCandidates && naturalSize && (
          <>
            <div className="absolute inset-0 bg-black/30 z-10" />
            {pendingCandidates.map((c) => {
              const style = toBoxStyle(c.bbox);
              if (!style) return null;
              return (
                <button
                  key={c.index}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPickCandidate?.(c.index);
                  }}
                  className="absolute border-2 border-[#F59E0B] bg-[#F59E0B]/10 hover:bg-[#F59E0B]/30 transition-colors z-20"
                  style={style}
                  title="Track this person"
                />
              );
            })}
          </>
        )}
      </div>
    </motion.div>
  );
}
