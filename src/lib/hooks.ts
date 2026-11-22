import { useSyncExternalStore } from 'react';
import { engine } from '../engine/engine';

export function useEngine() {
  useSyncExternalStore(engine.subscribe, () => engine.version);
  return engine;
}
