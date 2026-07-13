import { Component, type ErrorInfo, type FormEvent, type ReactNode, useEffect, useState } from 'react';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import SceneMap from '../components/map/SceneMap';
import EntityDetailPanel from '../components/panels/EntityDetailPanel';
import CameraFeedPanel from '../components/panels/CameraFeedPanel';
import WaterLevelPanel from '../components/panels/WaterLevelPanel';
import NearbyBusPanel from '../components/panels/NearbyBusPanel';
import TimelineControl from '../components/timeline/TimelineControl';
import Dashboard from '../components/dashboard/Dashboard';
import AccidentAlert from '../components/alerts/AccidentAlert';
import { loadMockMovementPoints } from '../data/mockMovementPoints';
import { useSceneStore } from '../store/sceneStore';
import type { AppPage } from '../components/layout/Header';

const AUTH_STORAGE_KEY = 'sceneflow-authenticated';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'U5d&tW$9pWN@vg';

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
    <main className="flex h-screen w-screen items-center justify-center bg-white px-[18px] text-slate-800">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.12)] ring-1 ring-slate-100"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <path
                d="M5 22c5-9 8-9 12-4s6 5 10-4"
                stroke="white"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              SCENE <span className="text-[#3B82F6]">FLOW</span>
            </p>
            <h1 className="text-2xl font-bold leading-8 text-slate-950">Sign in</h1>
          </div>
        </div>
        <label className="mb-[18px] block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-800">Username</span>
          <input
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setError('');
            }}
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-[18px] text-[15px] outline-none transition focus:border-blue-500 focus:bg-white focus:ring-[3px] focus:ring-blue-500/10"
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="mb-[18px] block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-800">Password</span>
          <input
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError('');
            }}
            type="password"
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-[18px] text-[15px] outline-none transition focus:border-blue-500 focus:bg-white focus:ring-[3px] focus:ring-blue-500/10"
            autoComplete="current-password"
          />
        </label>
        {error && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</p>}
        <button
          type="submit"
          className="h-14 w-full rounded-full bg-blue-500 px-6 text-[15px] font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition duration-300 active:scale-[0.98] active:bg-blue-600 focus:outline-none focus:ring-[3px] focus:ring-blue-500/15"
        >
          Log in
        </button>
      </form>
    </main>
  );
}

interface DashboardErrorBoundaryProps {
  children: ReactNode;
  onBackToMap: () => void;
  resetKey: string;
}

interface DashboardErrorBoundaryState {
  error: Error | null;
}

class DashboardErrorBoundary extends Component<DashboardErrorBoundaryProps, DashboardErrorBoundaryState> {
  state: DashboardErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): DashboardErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Dashboard render failed', error, errorInfo);
  }

  componentDidUpdate(prevProps: DashboardErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-0 flex-1 items-center justify-center bg-white p-[18px]">
        <div className="max-w-xl rounded-2xl bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] ring-1 ring-red-100">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">Dashboard error</p>
          <h1 className="mt-2 text-xl font-semibold leading-7 text-slate-950">Dashboard could not render</h1>
          <p className="mt-2 rounded-xl bg-red-50 p-3 font-mono text-[13px] text-red-700">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={this.props.onBackToMap}
            className="mt-4 min-h-12 rounded-full bg-blue-500 px-6 text-[15px] font-semibold text-white transition active:scale-[0.98] active:bg-blue-600"
          >
            Back to map
          </button>
        </div>
      </main>
    );
  }
}

export default function App() {
  const [isAuthenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true',
  );
  const [activePage, setActivePage] = useState<AppPage>('map');
  useSimulationClock(isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadMockMovementPoints().catch((error) => {
      console.error(error);
    });
  }, [isAuthenticated]);

  const logout = () => {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    window.location.reload();
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-slate-800">
      <Header activePage={activePage} onPageChange={setActivePage} onLogout={logout} />
      {activePage === 'dashboard' ? (
        <DashboardErrorBoundary resetKey={activePage} onBackToMap={() => setActivePage('map')}>
          <Dashboard onOpenMap={() => setActivePage('map')} />
        </DashboardErrorBoundary>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 bg-white p-3">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col gap-3">
            {/* KPI cards are temporarily disabled because this row is mock-only. */}
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-slate-50 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <SceneMap />
              <AccidentAlert />
            </div>
            <div className="flex h-32 shrink-0 overflow-hidden rounded-3xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] ring-1 ring-slate-100">
              <TimelineControl />
              {/* Movement Clips is temporarily disabled because this panel is mock-only. */}
            </div>
          </main>
          <aside className="w-96 shrink-0 overflow-y-auto rounded-3xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] ring-1 ring-slate-100">
            <CameraFeedPanel />
            <EntityDetailPanel />
            <NearbyBusPanel />
            <WaterLevelPanel />
            {/* Recent Events is temporarily disabled because this panel is mock-only. */}
          </aside>
        </div>
      )}
    </div>
  );
}
