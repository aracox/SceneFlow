import { useEffect } from 'react';
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

/** Drives the simulated clock with requestAnimationFrame. */
function useSimulationClock(): void {
  useEffect(() => {
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
  }, []);
}

export default function App() {
  useSimulationClock();

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
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
          <EntityDetailPanel />
          <CameraFeedPanel />
          <EventPanel />
        </aside>
      </div>
    </div>
  );
}
