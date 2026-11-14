import { useCallback, useEffect, useState } from 'react';
import { api, type EngineState, type Metrics } from './api';
import { feed } from './feed';

export function usePoll<T>(fn: () => Promise<T>, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const refresh = useCallback(() => fn().then(setData).catch(() => {}), [fn]);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, ms);
    return () => clearInterval(id);
  }, [refresh, ms]);
  return [data, refresh, setData] as const;
}

export const useEngineState = () => usePoll<EngineState>(api.state, 2000);
export const useMetrics = () => usePoll<Metrics>(api.metrics, 1000);

export function useFeedStats() {
  const [stats, setStats] = useState(feed.stats());
  useEffect(() => {
    feed.connect();
    return feed.onStats(() => setStats(feed.stats()));
  }, []);
  return stats;
}
