import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useSceneStore } from '../../store/sceneStore';
import type { NamtangLiveBus } from '../../services/namtangNearby';
import {
  calculateHeading,
  distanceBetweenCoordinates,
  interpolateHeading,
  positionAtDistance,
} from '../../services/geometryUtils';

const BUS_ANIMATION_MS = 30_000;
const MAX_SHAPE_INTERPOLATION_JUMP_M = 2_500;
const MAX_LINEAR_INTERPOLATION_JUMP_M = 900;

function liveBusSvg(): string {
  return `<svg width="12" height="24" viewBox="0 0 24 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3.5" y="3" width="17" height="42" rx="4.5" fill="#ff3131" stroke="#111827" stroke-width="1.2"/>
    <rect x="5.5" y="6.2" width="13" height="7.2" rx="2" fill="#496978" stroke="#111827" stroke-width="0.8"/>
    <path d="M12 6.3 V13.3" stroke="#111827" stroke-width="0.6" opacity="0.65"/>
    <rect x="5.3" y="14.8" width="13.4" height="27" rx="1.5" fill="#ff3131" stroke="#991b1b" stroke-width="0.8"/>
    <rect x="9.1" y="22.5" width="5.8" height="15.5" rx="1.2" fill="#ff3b3b" stroke="#111827" stroke-width="0.7"/>
    <circle cx="12" cy="28" r="1.5" fill="none" stroke="#111827" stroke-width="0.6"/>
    <circle cx="12" cy="32" r="1.5" fill="none" stroke="#111827" stroke-width="0.6"/>
    <circle cx="12" cy="36" r="1.5" fill="none" stroke="#111827" stroke-width="0.6"/>
    <path d="M9.5 19.3 H14.5 M9.5 20.8 H14.5 M9.5 39.7 H14.5 M9.5 41.2 H14.5" stroke="#111827" stroke-width="0.55" stroke-linecap="round"/>
    <rect x="8.8" y="1.5" width="6.4" height="2.8" rx="0.6" fill="#ff3131" stroke="#111827" stroke-width="0.7"/>
    <rect x="1.7" y="9.4" width="2" height="4" rx="0.8" fill="#111827"/>
    <rect x="20.3" y="9.4" width="2" height="4" rx="0.8" fill="#111827"/>
    <rect x="3.8" y="18" width="1.2" height="5" rx="0.5" fill="#496978" stroke="#111827" stroke-width="0.4"/>
    <rect x="19" y="18" width="1.2" height="5" rx="0.5" fill="#496978" stroke="#111827" stroke-width="0.4"/>
    <rect x="3.8" y="26" width="1.2" height="5" rx="0.5" fill="#496978" stroke="#111827" stroke-width="0.4"/>
    <rect x="19" y="26" width="1.2" height="5" rx="0.5" fill="#496978" stroke="#111827" stroke-width="0.4"/>
    <path d="M4.1 42.4 H8.2 V45 H5.4 Q4.5 44.5 4.1 42.4Z" fill="#fff7d6"/>
    <path d="M15.8 42.4 H19.9 Q19.5 44.5 18.6 45 H15.8 Z" fill="#fff7d6"/>
  </svg>`;
}

interface RouteMetrics {
  cumulative: number[];
  total: number;
}

interface ProjectedPose {
  lng: number;
  lat: number;
  headingDeg: number;
  routeShape?: [number, number][];
  distanceM?: number;
}

interface MarkerState {
  marker: maplibregl.Marker;
  element: HTMLButtonElement;
  bus: NamtangLiveBus;
  from: ProjectedPose;
  to: ProjectedPose;
  startedAtMs: number;
  durationMs: number;
}

const routeMetricsCache = new WeakMap<[number, number][], RouteMetrics>();

function routeMetrics(routeShape: [number, number][]): RouteMetrics {
  const cached = routeMetricsCache.get(routeShape);
  if (cached) return cached;

  const cumulative = [0];
  for (let i = 1; i < routeShape.length; i++) {
    cumulative.push(cumulative[i - 1] + distanceBetweenCoordinates(routeShape[i - 1], routeShape[i]));
  }
  const metrics = { cumulative, total: cumulative[cumulative.length - 1] };
  routeMetricsCache.set(routeShape, metrics);
  return metrics;
}

function pointSegmentProjection(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): { t: number; distanceM: number } {
  const midLat = ((start[1] + end[1]) / 2) * Math.PI / 180;
  const metersPerDegLng = 111_320 * Math.cos(midLat);
  const px = (point[0] - start[0]) * metersPerDegLng;
  const py = (point[1] - start[1]) * 111_320;
  const ex = (end[0] - start[0]) * metersPerDegLng;
  const ey = (end[1] - start[1]) * 111_320;
  const lenSq = ex * ex + ey * ey;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * ex + py * ey) / lenSq));
  return {
    t,
    distanceM: Math.hypot(px - ex * t, py - ey * t),
  };
}

function projectBusToShape(bus: NamtangLiveBus): ProjectedPose {
  const rawPosition: [number, number] = [bus.lon, bus.lat];
  const routeShape = bus.routeShape;
  if (!routeShape || routeShape.length < 2) {
    return { lng: bus.lon, lat: bus.lat, headingDeg: bus.headingDeg };
  }

  const metrics = routeMetrics(routeShape);
  let bestIndex = 0;
  let bestT = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < routeShape.length - 1; i++) {
    const projected = pointSegmentProjection(rawPosition, routeShape[i], routeShape[i + 1]);
    if (projected.distanceM < bestDistance) {
      bestDistance = projected.distanceM;
      bestIndex = i;
      bestT = projected.t;
    }
  }

  const segmentStartM = metrics.cumulative[bestIndex];
  const segmentLengthM = metrics.cumulative[bestIndex + 1] - segmentStartM;
  const distanceM = segmentStartM + segmentLengthM * bestT;
  const pose = positionAtDistance(
    { type: 'LineString', coordinates: routeShape },
    distanceM,
  );

  return {
    lng: pose.position[0],
    lat: pose.position[1],
    headingDeg: pose.heading,
    routeShape,
    distanceM,
  };
}

function interpolatePose(from: ProjectedPose, to: ProjectedPose, progress: number): ProjectedPose {
  const t = Math.min(Math.max(progress, 0), 1);
  if (
    from.routeShape &&
    from.routeShape === to.routeShape &&
    from.distanceM !== undefined &&
    to.distanceM !== undefined &&
    Math.abs(to.distanceM - from.distanceM) <= MAX_SHAPE_INTERPOLATION_JUMP_M
  ) {
    const pose = positionAtDistance(
      { type: 'LineString', coordinates: to.routeShape },
      from.distanceM + (to.distanceM - from.distanceM) * t,
    );
    return {
      lng: pose.position[0],
      lat: pose.position[1],
      headingDeg: pose.heading,
      routeShape: to.routeShape,
      distanceM: from.distanceM + (to.distanceM - from.distanceM) * t,
    };
  }

  if (distanceBetweenCoordinates([from.lng, from.lat], [to.lng, to.lat]) > MAX_LINEAR_INTERPOLATION_JUMP_M) {
    return to;
  }

  return {
    lng: from.lng + (to.lng - from.lng) * t,
    lat: from.lat + (to.lat - from.lat) * t,
    headingDeg: interpolateHeading(from.headingDeg, to.headingDeg, t),
    routeShape: to.routeShape,
    distanceM: to.distanceM,
  };
}

function markerPose(markerState: MarkerState): ProjectedPose {
  const current = markerState.marker.getLngLat();
  const currentPosition: [number, number] = [current.lng, current.lat];
  const toPosition: [number, number] = [markerState.to.lng, markerState.to.lat];

  return {
    lng: current.lng,
    lat: current.lat,
    headingDeg:
      distanceBetweenCoordinates(currentPosition, toPosition) > 1
        ? calculateHeading(currentPosition, toPosition)
        : markerState.to.headingDeg,
    routeShape: markerState.to.routeShape,
    distanceM:
      markerState.from.distanceM !== undefined && markerState.to.distanceM !== undefined
        ? markerState.from.distanceM +
          (markerState.to.distanceM - markerState.from.distanceM) *
            Math.min(
              Math.max((Date.now() - markerState.startedAtMs) / markerState.durationMs, 0),
              1,
            )
        : undefined,
  };
}

function animationDuration(previous: NamtangLiveBus | undefined, next: NamtangLiveBus): number {
  if (!previous?.updatedAtSec || !next.updatedAtSec || next.updatedAtSec <= previous.updatedAtSec) {
    return BUS_ANIMATION_MS;
  }
  return Math.min(Math.max((next.updatedAtSec - previous.updatedAtSec) * 1000, 10_000), 45_000);
}

export default function LiveBusLayer({ map }: { map: maplibregl.Map }) {
  const buses = useSceneStore((s) => s.nearbyLiveBuses);
  const visible = useSceneStore((s) => s.layers.buses);
  const selectedBusId = useSceneStore((s) => s.selectedNearbyLiveBusId);
  const selectNearbyLiveBus = useSceneStore((s) => s.selectNearbyLiveBus);
  const markerStatesRef = useRef(new Map<string, MarkerState>());

  useEffect(() => {
    if (!visible) {
      for (const markerState of markerStatesRef.current.values()) {
        markerState.marker.remove();
      }
      markerStatesRef.current.clear();
      return;
    }

    const seenBusIds = new Set<string>();
    const now = Date.now();

    for (const bus of buses) {
      seenBusIds.add(bus.id);
      const existing = markerStatesRef.current.get(bus.id);
      const to = projectBusToShape(bus);

      if (existing) {
        const previousBus = existing.bus;
        existing.bus = bus;
        existing.from = markerPose(existing);
        existing.to = to;
        existing.startedAtMs = now;
        existing.durationMs = animationDuration(previousBus, bus);
        existing.element.title = `${bus.routeName} live bus`;
        continue;
      }

      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'live-bus-marker';
      element.title = `${bus.routeName} live bus`;
      element.innerHTML = liveBusSvg();

      const marker = new maplibregl.Marker({
        element,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([to.lng, to.lat])
        .setRotation(to.headingDeg)
        .addTo(map);

      element.addEventListener('click', (event) => {
        event.stopPropagation();
        selectNearbyLiveBus(bus.id);
      });

      markerStatesRef.current.set(bus.id, {
        marker,
        element,
        bus,
        from: to,
        to,
        startedAtMs: now,
        durationMs: BUS_ANIMATION_MS,
      });
    }

    for (const [busId, markerState] of markerStatesRef.current.entries()) {
      if (!seenBusIds.has(busId)) {
        markerState.marker.remove();
        markerStatesRef.current.delete(busId);
      }
    }
  }, [map, buses, selectNearbyLiveBus, visible]);

  useEffect(() => {
    for (const [busId, markerState] of markerStatesRef.current.entries()) {
      markerState.element.classList.toggle('selected', selectedBusId === busId);
    }
  }, [selectedBusId, buses]);

  useEffect(() => {
    let rafId = 0;

    const render = () => {
      if (visible) {
        const now = Date.now();
        for (const markerState of markerStatesRef.current.values()) {
          const progress = (now - markerState.startedAtMs) / markerState.durationMs;
          const pose = interpolatePose(markerState.from, markerState.to, progress);
          markerState.marker.setLngLat([pose.lng, pose.lat]);
          markerState.marker.setRotation(pose.headingDeg);
        }
      }
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      for (const markerState of markerStatesRef.current.values()) {
        markerState.marker.remove();
      }
      markerStatesRef.current.clear();
    };
  }, [visible]);

  return null;
}
