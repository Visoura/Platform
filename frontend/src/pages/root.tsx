import { useState } from 'react';
import { Outlet } from 'react-router';
import { IntroSplash } from '../components/intro-splash';
import { SessionProvider } from '../context/session-context';

export function Root() {
  const [introComplete, setIntroComplete] = useState(false);

  return (
    <SessionProvider>
      {!introComplete && <IntroSplash onComplete={() => setIntroComplete(true)} />}
      <Outlet />
    </SessionProvider>
  );
}