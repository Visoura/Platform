import { useEffect, useRef } from 'react';
import { WEBRTC_URL, type Camera } from '../lib/api';
import { feed, type Box } from '../lib/feed';
import { playWhep } from '../lib/whep';

interface Props {
  camera: Camera;
  webrtc: boolean;
  showAll: boolean;
  onClick: (camera: string, index: number, x: number, y: number, hit: Box | null) => void;
}

function fit(cw: number, ch: number, w: number, h: number) {
  const scale = Math.min(cw / w, ch / h);
  return { x: (cw - w * scale) / 2, y: (ch - h * scale) / 2, w: w * scale, h: h * scale };
}

function color(box: Box) {
  if (!box.target) return 'rgba(240,239,236,0.45)';
  return box.target.startsWith('w-') ? '#e66767' : '#3987e5';
}

export function CameraTile({ camera, webrtc, showAll, onClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!webrtc || !videoRef.current) return;
    let pc: RTCPeerConnection | null = null;
    playWhep(WEBRTC_URL + camera.webrtc_path, videoRef.current)
      .then((p) => (pc = p))
      .catch(() => {});
    return () => pc?.close();
  }, [webrtc, camera.webrtc_path]);

  useEffect(() => {
    let raf = 0;
    let drawn = -1;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const frame = feed.frames.get(camera.id);
      if (!canvas || !container || !frame) return;
      const dpr = window.devicePixelRatio || 1;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const key = frame.meta.index * 1e4 + cw + ch;
      if (key === drawn && !webrtc) return;
      drawn = key;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
      }
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const r = fit(cw, ch, camera.width, camera.height);
      if (!webrtc && frame.image) ctx.drawImage(frame.image, r.x, r.y, r.w, r.h);
      for (const b of frame.meta.boxes) {
        if (!b.target && !showAll) continue;
        const [x1, y1, x2, y2] = b.box;
        const x = r.x + x1 * r.w;
        const y = r.y + y1 * r.h;
        ctx.strokeStyle = color(b);
        ctx.lineWidth = b.target ? 2 : 1;
        ctx.strokeRect(x, y, (x2 - x1) * r.w, (y2 - y1) * r.h);
        if (b.target) {
          const label = `${b.name ?? b.target} ${(b.score * 100).toFixed(0)}%`;
          ctx.font = '600 11px system-ui';
          const tw = ctx.measureText(label).width + 8;
          ctx.fillStyle = color(b);
          ctx.fillRect(x, y - 16, tw, 16);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, x + 4, y - 4);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [camera, webrtc, showAll]);

  const handleClick = (e: React.MouseEvent) => {
    const container = containerRef.current;
    const frame = feed.frames.get(camera.id);
    if (!container || !frame) return;
    const rect = container.getBoundingClientRect();
    const r = fit(rect.width, rect.height, camera.width, camera.height);
    const x = (e.clientX - rect.left - r.x) / r.w;
    const y = (e.clientY - rect.top - r.y) / r.h;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    const hit = frame.meta.boxes.find((b) => b.target && x >= b.box[0] && x <= b.box[2] && y >= b.box[1] && y <= b.box[3]);
    onClick(camera.id, frame.meta.index, x, y, hit ?? null);
  };

  return (
    <div className="relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-black">
      <div className="absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-xs">{camera.id}</div>
      <div ref={containerRef} className="relative min-h-0 flex-1 cursor-crosshair" onClick={handleClick}>
        {webrtc && <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-contain" />}
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
}
