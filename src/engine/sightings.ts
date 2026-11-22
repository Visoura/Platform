import { SIGHTING_GRACE_S } from './config';

export interface Sighting {
  target: string;
  camera: string;
  started_at: number;
  ended_at: number | null;
  last_seen: number;
}

export class SightingLog {
  readonly all: Sighting[] = [];
  private open = new Map<string, Sighting>();

  constructor(private onOpen: (camera: string, target: string, name: string) => void) {}

  update(camera: string, visible: Map<string, string>, now: number) {
    for (const [target, name] of visible) {
      const key = `${camera}/${target}`;
      const current = this.open.get(key);
      if (current) {
        current.last_seen = now;
        continue;
      }
      const sighting = { target, camera, started_at: now, ended_at: null, last_seen: now };
      this.open.set(key, sighting);
      this.all.unshift(sighting);
      this.onOpen(camera, target, name);
    }
    for (const [key, s] of this.open) {
      if (s.camera === camera && !visible.has(s.target) && now - s.last_seen >= SIGHTING_GRACE_S) {
        s.ended_at = s.last_seen;
        this.open.delete(key);
      }
    }
  }

  history(target: string) {
    return this.all.filter((s) => s.target === target);
  }
}
