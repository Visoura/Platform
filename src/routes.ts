import { createBrowserRouter } from 'react-router';
import { Root } from './pages/root';
import { Home } from './pages/home';
import { SessionSetup } from './pages/session-setup';
import { Dashboard } from './pages/dashboard';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: Home },
      { path: 'session/new', Component: SessionSetup },
      { path: 'session/:sessionId', Component: Dashboard },
    ],
  },
]);
