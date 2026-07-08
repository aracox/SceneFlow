import { type FormEvent, useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import KpiCards from '../components/layout/KpiCards';
import SceneMap from '../components/map/SceneMap';
import EntityDetailPanel from '../components/panels/EntityDetailPanel';
import CameraFeedPanel from '../components/panels/CameraFeedPanel';
import EventPanel from '../components/panels/EventPanel';
import MovementClipPanel from '../components/panels/MovementClipPanel';
import TimelineControl from '../components/timeline/TimelineControl';
import { useSceneStore } from '../store/sceneStore';

const AUTH_STORAGE_KEY = 'sceneflow-authenticated';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = '12345';

/** Drives the simulated clock with requestAnimationFrame. */
function useSimulationClock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let rafId: number;
    let last = performance.now();
    const loop = (now: number) => {
      // Cap dt so returning from a background tab doesn't jump the clock.
      const dt = Math.min(now - last, 100);
      last = now;
      useSceneStore.getState().tick(dt);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
      onLogin();
      return;
    }
    setError('Invalid username or password.');
  };

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-slate-100 px-4 text-slate-800">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-lg"
      >
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">SceneFlow</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Sign in</h1>
        </div>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Username</span>
          <input
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setError('');
            }}
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Password</span>
          <input
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError('');
            }}
            type="password"
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            autoComplete="current-password"
          />
        </label>
        {error && <p className="mb-4 text-sm font-medium text-red-600">{error}</p>}
        <button
          type="submit"
          className="h-10 w-full rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          Log in
        </button>
      </form>
    </main>
  );
}

export default function App() {
  const [isAuthenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true',
  );
  useSimulationClock(isAuthenticated);

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-800">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <KpiCards />
          <div className="relative min-h-0 flex-1">
            <SceneMap />
          </div>
          <div className="flex h-32 shrink-0 border-t border-slate-200 bg-white">
            <TimelineControl />
            <MovementClipPanel />
          </div>
        </main>
        <aside className="w-96 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
          <EntityDetailPanel />
          <CameraFeedPanel />
          <EventPanel />
        </aside>
      </div>
    </div>
  );
}
