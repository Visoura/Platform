import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';

interface GlobalControlsProps {
  isPlaying: boolean;
  speed: number;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
}

export function GlobalControls({
  isPlaying,
  speed,
  onPlayPause,
  onSpeedChange,
}: GlobalControlsProps) {
  const speeds = [0.5, 1, 2];

  return (
    <div
      className="bg-[#0D1220] border-t border-[#3B82F6]/15 px-4 flex items-center shrink-0 relative"
      style={{ height: 46 }}
    >
      {/* Left: label — anchored left */}
      <span className="text-[9px] text-[#475569] font-medium uppercase tracking-widest select-none whitespace-nowrap">
        Global
      </span>

      {/* Center: playback controls — absolutely centered in bar */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
        {/* Reverse */}
        <button
          title="Reverse"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#3B82F6]/15 text-[#94A3B8] hover:text-[#E5E7EB] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Step Back */}
        <button
          title="Step Back"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#3B82F6]/15 text-[#94A3B8] hover:text-[#E5E7EB] transition-colors"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>

        {/* Play / Pause — primary accent */}
        <button
          onClick={onPlayPause}
          title={isPlaying ? 'Pause All' : 'Play All'}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white transition-colors mx-0.5"
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5 ml-0.5" />
          )}
        </button>

        {/* Step Forward */}
        <button
          title="Step Forward"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#3B82F6]/15 text-[#94A3B8] hover:text-[#E5E7EB] transition-colors"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: speed selector — anchored right */}
      <div className="ml-auto flex items-center gap-0.5 bg-[#0B0F19] rounded-md p-0.5 border border-[#3B82F6]/10">
        {speeds.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              speed === s
                ? 'bg-[#3B82F6] text-white'
                : 'text-[#475569] hover:text-[#94A3B8] hover:bg-[#161B2A]'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
