#!/usr/bin/env node
// Regenerates the detection corridor for the live-YOLO camera ITICM_BMAMI0080.
// Its live feed (foot of Taksin Bridge, จุดกลับใต้สะพาน) looks INLAND/EAST down
// ถนนสาทรใต้ (South Sathon Rd) at the oncoming traffic — สาทรใต้ here is one-way
// heading WEST toward the bridge, so cars approach the camera. The corridor
// follows ถนนสาทรใต้ ONLY (filtered by name, so it can never wander onto the
// bridge or a crossing road) from the camera in the longer/inland direction for
// up to ~2 km; detection depth is projected ALONG it so cars sit on สาทรใต้ and
// (with frontend heading-from-motion) point the right way.
// Data: OpenStreetMap (ODbL, © OpenStreetMap contributors).
//
// Writes:
//   detector/road_ITICM_BMAMI0080.json   [lng,lat][]  — used by detector/server.py
//   src/data/detectionCorridors.ts                    — used by the map to draw it
//
// Usage:  node scripts/gen-detector-road.mjs
// Requires network access to an Overpass mirror (one-time, at build time).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CAMERA_ID = 'ITICM_BMAMI0080';
const CAM = { lat: 13.718527, lng: 100.515279 };
const ROAD_NAME = 'ถนนสาทรใต้'; // South Sathon Rd — the road in the camera view
const MAX_LEN_M = 500; // clip the corridor to the assumed coverage (~500 m)
const DENSIFY_M = 15;
const FETCH_RADIUS_M = 2600;

const ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const R = 6378137;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
function hav(a, b) {
  const dLat = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const key = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
const lineLen = (l) => l.reduce((L, p, i) => (i ? L + hav(l[i - 1], p) : 0), 0);

async function fetchWays() {
  const query = `[out:json][timeout:40];way(around:${FETCH_RADIUS_M},${CAM.lat},${CAM.lng})["highway"]["name"="${ROAD_NAME}"];out tags geom;`;
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.elements) return data.elements;
    } catch {
      /* next mirror */
    }
  }
  throw new Error('All Overpass mirrors failed (rate-limited?). Try again later.');
}

function buildGraph(ways) {
  const nodes = new Map(); // key -> { pt, nbrs:Set<key> }
  const ensure = (pt) => {
    const k = key(pt);
    if (!nodes.has(k)) nodes.set(k, { pt, nbrs: new Set() });
    return k;
  };
  for (const w of ways) {
    if (!w.geometry) continue;
    const coords = w.geometry.map((p) => [p.lon, p.lat]);
    for (let i = 0; i < coords.length; i++) {
      const k = ensure(coords[i]);
      if (i > 0) {
        const pk = key(coords[i - 1]);
        nodes.get(k).nbrs.add(pk);
        nodes.get(pk).nbrs.add(k);
      }
    }
  }
  return nodes;
}

function nearestNodeKey(nodes) {
  let best = null;
  let bestD = Infinity;
  for (const [k, n] of nodes) {
    const d = hav([CAM.lng, CAM.lat], n.pt);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

// Follow the road from `startK` beginning toward `firstK`, always taking the
// straightest continuation. Stays on ถนนสาทรใต้ (the only road in the graph).
function follow(nodes, startK, firstK) {
  const path = [nodes.get(startK).pt, nodes.get(firstK).pt];
  const visited = new Set([startK, firstK]);
  let prevK = startK;
  let curK = firstK;
  let curHeading = bearing(nodes.get(startK).pt, nodes.get(firstK).pt);
  while (lineLen(path) < MAX_LEN_M) {
    const cur = nodes.get(curK);
    let bestK = null;
    let bestScore = Infinity;
    for (const nk of cur.nbrs) {
      if (nk === prevK || visited.has(nk)) continue;
      const brg = bearing(cur.pt, nodes.get(nk).pt);
      const score = angDiff(brg, curHeading);
      if (score < bestScore) {
        bestScore = score;
        bestK = nk;
      }
    }
    if (!bestK || bestScore > 100) break;
    curHeading = bearing(cur.pt, nodes.get(bestK).pt);
    path.push(nodes.get(bestK).pt);
    visited.add(bestK);
    prevK = curK;
    curK = bestK;
  }
  return path;
}

function densify(line, maxSeg) {
  const out = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = out[out.length - 1];
    const b = line[i];
    const n = Math.max(1, Math.ceil(hav(a, b) / maxSeg));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

async function main() {
  const ways = (await fetchWays()).filter((e) => e.geometry);
  if (!ways.length) throw new Error(`No "${ROAD_NAME}" geometry found near the camera.`);
  const nodes = buildGraph(ways);
  const startK = nearestNodeKey(nodes);

  // Walk each branch out of the start node; keep the longest (the inland run).
  let raw = [nodes.get(startK).pt];
  for (const firstK of nodes.get(startK).nbrs) {
    const p = follow(nodes, startK, firstK);
    if (lineLen(p) > lineLen(raw)) raw = p;
  }
  if (raw.length < 2) throw new Error('Could not follow the road from the camera.');

  const clipped = [raw[0]];
  let acc = 0;
  for (let i = 1; i < raw.length && acc < MAX_LEN_M; i++) {
    acc += hav(raw[i - 1], raw[i]);
    clipped.push(raw[i]);
  }
  const corridor = densify(clipped, DENSIFY_M).map(([lng, lat]) => [
    Math.round(lng * 1e6) / 1e6,
    Math.round(lat * 1e6) / 1e6,
  ]);

  const totalM = Math.round(lineLen(corridor));
  let startBrg = 0;
  for (let i = 1; i < corridor.length; i++) {
    if (hav(corridor[0], corridor[i]) >= 60 || i === corridor.length - 1) {
      startBrg = Math.round(bearing(corridor[0], corridor[i]));
      break;
    }
  }

  const jsonPath = path.join(__dirname, '..', 'detector', `road_${CAMERA_ID}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(corridor));
  const tsPath = path.join(__dirname, '..', 'src', 'data', 'detectionCorridors.ts');
  let ts = `// AUTO-GENERATED by scripts/gen-detector-road.mjs. Real centerline of the\n`;
  ts += `// road each live-detection camera looks down (OSM, ODbL © OpenStreetMap\n`;
  ts += `// contributors), used to draw the corridor and to project detections onto\n`;
  ts += `// the road. Coordinates are [lng, lat].\n`;
  ts += `export const detectionCorridors: Record<string, [number, number][]> = {\n`;
  ts += `  '${CAMERA_ID}': ${JSON.stringify(corridor)},\n`;
  ts += `};\n`;
  fs.writeFileSync(tsPath, ts);

  console.log(`Corridor ${CAMERA_ID} on ${ROAD_NAME}: ${corridor.length} pts, ${totalM} m, start bearing ${startBrg}°`);
  console.log(`  -> set HEADING_OVERRIDES['${CAMERA_ID}'] = ${startBrg} in src/data/mockCameras.ts`);
  console.log(`  -> ${jsonPath}`);
  console.log(`  -> ${tsPath}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
