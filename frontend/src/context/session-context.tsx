import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api, ApiCamera, ApiSession } from '../lib/api';

export interface Session {
  id: string;
  name: string;
  cameras: ApiCamera[];
  cameraCount: number;
  status: 'active' | 'terminated';
  createdAt: string; // ISO
  endedAt: string | null;
}

interface SessionContextType {
  sessions: Session[];
  loading: boolean;
  createSession: (cameraIds: number[]) => Promise<Session>;
  terminateSession: (id: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  getElapsed: (session: Session) => number;
}

const SessionContext = createContext<SessionContextType | null>(null);

function toSession(raw: ApiSession): Session {
  return {
    id: raw.id,
    name: `Session #${raw.id.slice(0, 8)}`,
    cameras: raw.cameras_detail,
    cameraCount: raw.cameras_detail.length,
    status: raw.status,
    createdAt: raw.created_at,
    endedAt: raw.ended_at,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshSessions = useCallback(async () => {
    const raw = await api.listSessions();
    setSessions(raw.map(toSession));
  }, []);

  useEffect(() => {
    refreshSessions()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshSessions]);

  const getElapsed = useCallback((session: Session): number => {
    const startMs = new Date(session.createdAt).getTime();
    const endMs =
      session.status === 'terminated' && session.endedAt
        ? new Date(session.endedAt).getTime()
        : Date.now();
    return Math.max(0, (endMs - startMs) / 1000);
  }, []);

  const createSession = useCallback(async (cameraIds: number[]): Promise<Session> => {
    const raw = await api.createSession(cameraIds);
    const session = toSession(raw);
    setSessions((prev) => [session, ...prev]);
    return session;
  }, []);

  const terminateSession = useCallback(async (id: string) => {
    await api.terminateSession(id);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, status: 'terminated', endedAt: new Date().toISOString() } : s
      )
    );
  }, []);

  return (
    <SessionContext.Provider
      value={{ sessions, loading, createSession, terminateSession, refreshSessions, getElapsed }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSessionContext must be used within SessionProvider');
  return ctx;
}
