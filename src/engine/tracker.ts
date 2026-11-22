import { iou, type Detection } from './detect';
import type { Rect } from './types';

const HIGH = 0.5;

interface Track {
  id: number;
  box: Rect;
  velocity: Rect;
  lost: number;
}

function greedy(tracks: Track[], dets: Detection[], minIou: number) {
  const pairs: [number, number, number][] = [];
  tracks.forEach((t, i) => dets.forEach((d, j) => {
    const overlap = iou(t.box, d.box);
    if (overlap >= minIou) pairs.push([overlap, i, j]);
  }));
  pairs.sort((a, b) => b[0] - a[0]);
  const usedTracks = new Set<number>();
  const usedDets = new Set<number>();
  const matches: [Track, Detection][] = [];
  for (const [, i, j] of pairs) {
    if (usedTracks.has(i) || usedDets.has(j)) continue;
    usedTracks.add(i);
    usedDets.add(j);
    matches.push([tracks[i], dets[j]]);
  }
  return {
    matches,
    tracks: tracks.filter((_, i) => !usedTracks.has(i)),
    dets: dets.filter((_, j) => !usedDets.has(j)),
  };
}

export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;

  constructor(private maxLost: number) {}

  update(dets: Detection[]) {
    for (const t of this.tracks) t.box = t.box.map((v, k) => v + t.velocity[k]) as Rect;
    const ids = new Map<Detection, number>();
    const first = greedy(this.tracks, dets.filter((d) => d.score >= HIGH), 0.2);
    const second = greedy(first.tracks.filter((t) => t.lost === 0), dets.filter((d) => d.score < HIGH), 0.5);
    for (const [track, det] of [...first.matches, ...second.matches]) {
      const previous = track.box.map((v, k) => v - track.velocity[k]);
      track.velocity = det.box.map((v, k) => 0.5 * track.velocity[k] + 0.5 * (v - previous[k])) as Rect;
      track.box = det.box;
      track.lost = 0;
      ids.set(det, track.id);
    }
    const matched = new Set(ids.values());
    for (const t of this.tracks) if (!matched.has(t.id)) t.lost++;
    this.tracks = this.tracks.filter((t) => t.lost <= this.maxLost);
    for (const det of first.dets) {
      const track = { id: this.nextId++, box: det.box, velocity: [0, 0, 0, 0] as Rect, lost: 0 };
      this.tracks.push(track);
      ids.set(det, track.id);
    }
    return ids;
  }
}
