import { Outlet } from 'react-router';
import { SessionProvider } from '../context/session-context';

export function Root() {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}
