import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = path.join(os.tmpdir(), 'sceneflow-generate-mock-movement');
const bundlePath = path.join(tempDir, `generator-${Date.now()}.mjs`);
const outputPath = path.join(root, 'public/generated/mockMovementPoints.generated.json');

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function compactOptional(values, dictionary) {
  const encoded = values.map((value) => (value === undefined ? -1 : dictionary.indexOf(value)));
  return encoded.every((value) => value === encoded[0]) ? encoded[0] : encoded;
}

function compactSeries(points, dictionaries, startMs) {
  const firstPointMs = points.length > 0 ? Date.parse(points[0].observed_at) : startMs;
  const stepMs =
    points.length > 1
      ? Date.parse(points[1].observed_at) - Date.parse(points[0].observed_at)
      : 1000;
  return {
    stepMs,
    ...(firstPointMs === startMs ? {} : { startOffsetMs: firstPointMs - startMs }),
    lng: points.map((point) => round(point.lng, 7)),
    lat: points.map((point) => round(point.lat, 7)),
    heading: points.map((point) => round(point.heading_deg, 1)),
    speed: points.map((point) => round(point.speed_kmh ?? 0, 1)),
    confidence: points.map((point) => round(point.confidence, 2)),
    path: compactOptional(points.map((point) => point.path_id), dictionaries.paths),
    zone: compactOptional(points.map((point) => point.zone_id), dictionaries.zones),
    camera: compactOptional(points.map((point) => point.source_camera_id), dictionaries.cameras),
    status: compactOptional(
      points.map((point) => point.tracking_status),
      dictionaries.statuses,
    ),
  };
}

await mkdir(tempDir, { recursive: true });

try {
  await build({
    entryPoints: [path.join(root, 'src/data/buildMockMovementPoints.ts')],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    logLevel: 'silent',
  });

  const { buildAllMovementPoints } = await import(pathToFileURL(bundlePath).href);
  const movementPoints = buildAllMovementPoints();
  const entityCount = Object.keys(movementPoints).length;
  const pointCount = Object.values(movementPoints).reduce((sum, points) => sum + points.length, 0);
  const dictionaries = {
    paths: [...new Set(Object.values(movementPoints).flatMap((points) =>
      points.map((point) => point.path_id).filter(Boolean),
    ))].sort(),
    zones: [...new Set(Object.values(movementPoints).flatMap((points) =>
      points.map((point) => point.zone_id).filter(Boolean),
    ))].sort(),
    cameras: [...new Set(Object.values(movementPoints).flatMap((points) =>
      points.map((point) => point.source_camera_id).filter(Boolean),
    ))].sort(),
    statuses: ['tracked', 'lost', 'predicted'],
  };
  const startMs = Math.min(
    ...Object.values(movementPoints).flatMap((points) =>
      points.length > 0 ? [Date.parse(points[0].observed_at)] : [],
    ),
  );
  const compact = {
    schema: 1,
    startMs,
    dictionaries,
    entities: Object.fromEntries(
      Object.entries(movementPoints).map(([entityId, points]) => [
        entityId,
        compactSeries(points, dictionaries, startMs),
      ]),
    ),
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(compact)}\n`);

  console.log(`Generated ${outputPath}`);
  console.log(`${entityCount} entities, ${pointCount.toLocaleString()} movement points`);
} finally {
  await rm(bundlePath, { force: true });
}
