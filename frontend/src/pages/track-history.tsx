import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { ArrowLeft, Camera, Clock, ExternalLink, User, Loader2 } from 'lucide-react';
import { useSessionContext } from '../context/session-context';
import { VisouraWordmark } from '../components/visoura-wordmark';
import { api, Sighting, WS_BASE_URL } from '../lib/api';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function TrackHistory() {
  const { sessionId, targetId } = useParams<{ sessionId: string; targetId: string }>();
  const navigate = useNavigate();
  const { sessions } = useSessionContext();

  const session = sessions.find((s) => s.id === sessionId);
  const tid = targetId ?? '';

  const [sightings, setSightings] = useState<Sighting[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!tid) return;
    setSightings(null);
    setLoadError(null);
    api
      .getTrackHistory(tid)
      .then(setSightings)
      .catch(() => setLoadError('Could not load sighting history from the backend.'));
  }, [tid]);

  // Live updates - the camera keeps running in the background while this
  // page is open, so a sighting can start or end (or a new one begin) at
  // any moment; this pushes those straight in without needing a refresh.
  useEffect(() => {
    if (!tid) return;
    const ws = new WebSocket(`${WS_BASE_URL}/ws/targets/${tid}/history/`);
    ws.onmessage = (event) => {
      try {
        const update: Sighting = JSON.parse(event.data);
        setSightings((prev) => {
          if (!prev) return [update];
          const idx = prev.findIndex(
            (s) => s.camera_id === update.camera_id && s.started_at === update.started_at
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = update;
            return next;
          }
          return [update, ...prev]; // new sighting - most-recent-first, matching backend ordering
        });
      } catch {
        // ignore malformed messages
      }
    };
    return () => ws.close();
  }, [tid]);

  return (
    <div className="min-h-screen bg-[#080C15] text-[#E5E7EB] flex flex-col">
      {/* Top bar */}
      <div className="bg-[#0F1624] border-b border-[#3B82F6]/15 px-5 py-2.5 flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate(session ? `/session/${sessionId}` : '/')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#080C15] hover:bg-[#0B0F19] border border-[#3B82F6]/20 text-[#94A3B8] hover:text-[#E5E7EB] rounded-lg transition-colors text-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <div className="flex items-center gap-2 flex-1">
          <VisouraWordmark size="sm" style={{ opacity: 0.6 }} />
          <span className="text-[#475569] text-xs uppercase tracking-widest">Track History</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#080C15] border border-[#3B82F6]/20 rounded-lg">
          <User className="w-3.5 h-3.5 text-[#3B82F6]" />
          <span className="text-[#E5E7EB] text-sm" style={{ fontWeight: 500 }}>Person #{tid.slice(0, 8)}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-[#E5E7EB] mb-1" style={{ fontSize: 20, fontWeight: 600 }}>
            Sighting Timeline
          </h2>
          <p className="text-[#475569] text-sm">
            {sightings ? (
              <>
                {sightings.length} appearance{sightings.length !== 1 ? 's' : ''} recorded
                {session ? ` in ${session.name}` : ''}
              </>
            ) : (
              'Loading…'
            )}
          </p>
        </motion.div>

        {/* Timeline */}
        {loadError ? (
          <div className="text-center py-20 text-red-400 text-sm">{loadError}</div>
        ) : sightings === null ? (
          <div className="flex items-center justify-center gap-2 py-20 text-[#475569] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading sighting history…
          </div>
        ) : sightings.length === 0 ? (
          <div className="text-center py-20 text-[#475569] text-sm">
            No sightings recorded for this person yet — history fills in as they're actually seen live.
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-[#3B82F6]/15" />

            <div className="space-y-4">
              {sightings.map((s, i) => (
                <motion.div
                  key={`${s.camera_id}-${s.started_at}`}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="flex gap-5"
                >
                  {/* Timeline dot */}
                  <div className="relative z-10 shrink-0">
                    <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                      i === 0
                        ? 'bg-[#3B82F6]/20 border-[#3B82F6]'
                        : 'bg-[#0D1220] border-[#3B82F6]/30'
                    }`}>
                      <Camera className={`w-4 h-4 ${i === 0 ? 'text-[#3B82F6]' : 'text-[#475569]'}`} />
                    </div>
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-[#0D1220] border border-[#3B82F6]/15 rounded-xl p-4 hover:border-[#3B82F6]/30 transition-colors group">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[#E5E7EB] text-sm" style={{ fontWeight: 500 }}>
                            {s.camera_name}
                          </span>
                          {i === 0 && (
                            <span className="px-1.5 py-0.5 bg-[#3B82F6]/15 text-[#3B82F6] text-[10px] rounded">
                              Most recent
                            </span>
                          )}
                          {s.ended_at === null && (
                            <span className="px-1.5 py-0.5 bg-[#22C55E]/15 text-[#22C55E] text-[10px] rounded">
                              Ongoing
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#475569]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(s.started_at)}
                          </span>
                          <span>·</span>
                          <span>
                            {s.duration_sec !== null ? `${Math.round(s.duration_sec)}s visible` : 'still visible'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => navigate(session ? `/session/${sessionId}` : '/')}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#080C15] hover:bg-[#3B82F6]/15 border border-[#3B82F6]/20 hover:border-[#3B82F6]/50 text-[#94A3B8] hover:text-[#3B82F6] rounded-lg text-xs transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Jump to camera
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
