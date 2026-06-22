import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface CameraSetup {
  cameraId: number;
  name: string;
  location: string;
  zone: string;
}

export interface Session {
  id: string;
  name: string;
  cameraCount: number;
  cameras: CameraSetup[];
  status: 'running' | 'stopped';
  createdAt: string;
  startedAt: number | null;     // Date.now() when last resumed
  accumulatedTime: number;      // seconds before last pause
}

interface SessionContextType {
  sessions: Session[];
  createSession: (cameras: CameraSetup[]) => Session;
  terminateSession: (id: string) => void;
  resumeSession: (id: string) => void;
  stopSession: (id: string) => void;
  restartSession: (id: string) => void;
  getElapsed: (session: Session) => number;
}

const SessionContext = createContext<SessionContextType | null>(null);

let sessionCounter = 1;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);

  const getElapsed = useCallback((session: Session): number => {
    if (session.status === 'running' && session.startedAt !== null) {
      return session.accumulatedTime + (Date.now() - session.startedAt) / 1000;
    }
    return session.accumulatedTime;
  }, []);

  const createSession = useCallback((cameras: CameraSetup[]): Session => {
    const now = new Date();
    const session: Session = {
      id: `sess-${Date.now()}`,
      name: `Session #${sessionCounter++}`,
      cameraCount: cameras.length,
      cameras,
      status: 'running',
      createdAt: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      startedAt: Date.now(),
      accumulatedTime: 0,
    };
    setSessions(prev => [session, ...prev]);
    return session;
  }, []);

  const terminateSession = useCallback((id: string) => {
    setSessions(prev => prev.filter(x => x.id !== id));
  }, []);

  const resumeSession = useCallback((id: string) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== id) return s;
      return { ...s, status: 'running', startedAt: Date.now() };
    }));
  }, []);

  const stopSession = useCallback((id: string) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== id) return s;
      const elapsed = s.accumulatedTime + (s.startedAt ? (Date.now() - s.startedAt) / 1000 : 0);
      return { ...s, status: 'stopped', startedAt: null, accumulatedTime: elapsed };
    }));
  }, []);

  const restartSession = useCallback((id: string) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== id) return s;
      return { ...s, status: 'running', startedAt: Date.now(), accumulatedTime: 0 };
    }));
  }, []);

  return (
    <SessionContext.Provider value={{
      sessions, createSession, terminateSession,
      resumeSession, stopSession, restartSession, getElapsed,
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSessionContext must be used within SessionProvider');
  return ctx;
}
