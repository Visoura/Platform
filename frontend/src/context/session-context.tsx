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
  restartSession: (id: string) => Promise<Session>;
  refreshSessions: () => Promise<void>;
  getElapsed: (session: Session) => number;
}

const SessionContext = createContext<SessionContextType | null>(null);

function formatSessionName(createdAt: string): string {
  const when = new Date(createdAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return `Session – ${when}`;
}

function toSession(raw: ApiSession): Session {
  return {
    id: raw.id,
    name: formatSessionName(raw.created_at),
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

  // A real terminate-then-recreate, not a fake pause/resume - our backend only
  // supports one-way active->terminated, so "restart" means ending this
  // session and starting a fresh one with the same cameras (new id, new URL).
  const restartSession = useCallback(
    async (id: string): Promise<Session> => {
      const current = sessions.find((s) => s.id === id);
      if (!current) throw new Error('Session not found');
      const cameraIds = current.cameras.map((c) => c.id);
      await terminateSession(id);
      return createSession(cameraIds);
    },
    [sessions, terminateSession, createSession]
  );

  return (
    <SessionContext.Provider
      value={{ sessions, loading, createSession, terminateSession, restartSession, refreshSessions, getElapsed }}
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
