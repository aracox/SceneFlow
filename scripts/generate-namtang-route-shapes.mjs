import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const root = process.cwd();
const gtfsDir = path.join(root, 'data/namtang-gtfs');
const tripsPath = path.join(gtfsDir, 'trips.txt');
const shapesPath = path.join(gtfsDir, 'shapes.txt');
const outputPath = path.join(root, 'public/generated/namtangRouteShapes.generated.json');
const TOLERANCE_M = 12;
const MIN_POINT_SPACING_M = 18;
const METERS_PER_DEG_LAT = 111_320;

function parseCsvLine(line) {
  const result = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      result.push(value);
      value = '';
      continue;
    }
    value += char;
  }
  result.push(value);
  return result;
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function outputIsFresh() {
  try {
    const [output, trips, shapes] = await Promise.all([
      stat(outputPath),
      stat(tripsPath),
      stat(shapesPath),
    ]);
    return output.mtimeMs >= trips.mtimeMs && output.mtimeMs >= shapes.mtimeMs;
  } catch {
    return false;
  }
}

async function readTripShapeMap() {
  const tripShapes = {};
  const referencedShapes = new Set();
  const rl = readline.createInterface({
    input: createReadStream(tripsPath),
    crlfDelay: Infinity,
  });

  let header = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!header) {
      header = parseCsvLine(line);
      continue;
    }
    const row = parseCsvLine(line);
    const tripId = row[header.indexOf('trip_id')];
    const shapeId = row[header.indexOf('shape_id')];
    if (!tripId || !shapeId) continue;
    tripShapes[tripId] = shapeId;
    referencedShapes.add(shapeId);
  }

  return { tripShapes, referencedShapes };
}

function distanceM(pointA, pointB) {
  const midLat = ((pointA[1] + pointB[1]) / 2) * Math.PI / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(midLat);
  const dx = (pointB[0] - pointA[0]) * metersPerDegLng;
  const dy = (pointB[1] - pointA[1]) * METERS_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

function perpendicularDistanceM(point, start, end) {
  const midLat = ((start[1] + end[1]) / 2) * Math.PI / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(midLat);
  const x = (point[0] - start[0]) * metersPerDegLng;
  const y = (point[1] - start[1]) * METERS_PER_DEG_LAT;
  const x2 = (end[0] - start[0]) * metersPerDegLng;
  const y2 = (end[1] - start[1]) * METERS_PER_DEG_LAT;
  const lenSq = x2 * x2 + y2 * y2;
  if (lenSq === 0) return Math.hypot(x, y);
  const t = Math.max(0, Math.min(1, (x * x2 + y * y2) / lenSq));
  return Math.hypot(x - x2 * t, y - y2 * t);
}

function thinPoints(points) {
  if (points.length <= 2) return points;
  const thinned = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (distanceM(thinned[thinned.length - 1], points[i]) >= MIN_POINT_SPACING_M) {
      thinned.push(points[i]);
    }
  }
  thinned.push(points[points.length - 1]);
  return thinned;
}

function simplifyRdp(points, toleranceM) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistanceM(points[i], points[start], points[end]);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > toleranceM) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}

function roundCoord(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

async function readShapes(referencedShapes) {
  const shapes = new Map();
  const rl = readline.createInterface({
    input: createReadStream(shapesPath),
    crlfDelay: Infinity,
  });

  let header = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!header) {
      header = parseCsvLine(line);
      continue;
    }
    const row = parseCsvLine(line);
    const shapeId = row[header.indexOf('shape_id')];
    if (!referencedShapes.has(shapeId)) continue;
    const lat = Number(row[header.indexOf('shape_pt_lat')]);
    const lon = Number(row[header.indexOf('shape_pt_lon')]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const points = shapes.get(shapeId);
    if (points) {
      points.push([lon, lat]);
    } else {
      shapes.set(shapeId, [[lon, lat]]);
    }
  }

  return Object.fromEntries(
    [...shapes.entries()].map(([shapeId, points]) => {
      const simplified = simplifyRdp(thinPoints(points), TOLERANCE_M);
      return [
        shapeId,
        simplified.map(([lon, lat]) => [roundCoord(lon), roundCoord(lat)]),
      ];
    }),
  );
}

if (!(await fileExists(tripsPath)) || !(await fileExists(shapesPath))) {
  console.log('Skipped Namtang route shapes: raw GTFS trips.txt or shapes.txt is missing.');
  process.exit(0);
}

if (await outputIsFresh()) {
  console.log(`Namtang route shapes are up to date: ${outputPath}`);
  process.exit(0);
}

const { tripShapes, referencedShapes } = await readTripShapeMap();
const shapes = await readShapes(referencedShapes);
const compact = {
  schema: 1,
  toleranceM: TOLERANCE_M,
  tripShapes,
  shapes,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(compact)}\n`);

const pointCount = Object.values(shapes).reduce((sum, points) => sum + points.length, 0);
console.log(`Generated ${outputPath}`);
console.log(`${Object.keys(tripShapes).length.toLocaleString()} trips, ${Object.keys(shapes).length.toLocaleString()} shapes, ${pointCount.toLocaleString()} simplified points`);
