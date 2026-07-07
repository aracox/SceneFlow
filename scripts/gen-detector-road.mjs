#!/usr/bin/env node
// Regenerates the detection corridor for each live-YOLO camera in CAMERAS
// below. For each camera, the corridor follows a single named road ONLY
// (filtered by name, so it can never wander onto a bridge or crossing road)
// out from the camera for up to `maxLenM`; detection depth is projected ALONG
// it so cars sit on the road and (with frontend heading-from-motion) point
// the right way.
//
// ITICM_BMAMI0080 — foot of Taksin Bridge (จุดกลับใต้สะพาน) — looks INLAND/EAST
// down ถนนสาทรใต้ (South Sathon Rd) at oncoming traffic; สาทรใต้ here is one-way
// heading WEST toward the bridge, so cars approach the camera.
//
// DOH-PER-4-016 — Chaengwattana Rd / HW304 near Pak Kret — looks WNW down
// ถนนแจ้งวัฒนะ at traffic receding toward แยกปากเกร็ด. Chaengwattana is a dual
// carriageway: two separate one-way OSM ways share the name near the camera,
// and the camera point sits nearer the OPPOSITE (wrong-direction) carriageway
// than the one it actually looks down. Both carriageways' branches can pass
// the start-bearing filter (walking the wrong-direction way BACKWARD yields
// a similar start bearing), so bearing alone can't tell them apart — the
// start candidate is also required to sit on a way whose one-way travel
// direction (or a non-one-way way) is consistent with `travelBearingDeg`.
// See buildGraph()/nodeQualifies()/pickStart() below for the fix.
//
// Data: OpenStreetMap (ODbL, © OpenStreetMap contributors).
//
// Writes:
//   detector/road_<id>.json         [lng,lat][]  — used by detector/server.py
//   src/data/detectionCorridors.ts  (ALL cameras) — used by the map to draw them
//
// Usage:  node scripts/gen-detector-road.mjs
// Requires network access to an Overpass mirror (one-time, at build time).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CAMERAS = [
  {
    id: 'ITICM_BMAMI0080',
    cam: { lat: 13.718527, lng: 100.515279 },
    roadName: 'ถนนสาทรใต้', // South Sathon Rd — the road in the camera view
    maxLenM: 500, // clip the corridor to the assumed coverage (~500 m)
    preferBearingDeg: 105,
    // ถนนสาทรใต้ is one-way WESTBOUND; this camera watches ONCOMING traffic,
    // so the corridor legitimately walks AGAINST travelBearingDeg (the
    // corridor direction is the view direction, not the legal travel one).
    travelBearingDeg: 270,
  },
  {
    id: 'DOH-PER-4-016',
    cam: { lat: 13.9032, lng: 100.5314 },
    roadName: 'ถนนแจ้งวัฒนะ', // Chaengwattana Rd / HW304 — the road in the camera view
    maxLenM: 500,
    preferBearingDeg: 290,
    travelBearingDeg: 290,
  },
  // ITICM_BMAMI0072 — แยกใต้ทางด่วนพระราม 4: a SIDE-VIEW camera (view: "side"
  // in detector/cameras.json). It looks ~north from the south side of Rama IV,
  // so Rama IV crosses the frame broadside and the corridor must extend BOTH
  // ways from the camera (backLenM) instead of only walking away from it.
  // The corridor follows the WNW-bound (south, 5-lane) carriageway — the
  // direction lane 0 (nearest the camera) travels — shifted 9 m right of
  // travel (NNE) to sit mid-median between the two carriageways. Duang
  // Phithak Rd recedes north in the frame background; the elevated Chaloem
  // Mahanakhon Expressway is ~70 m west, NOT the road in view.
  {
    id: 'ITICM_BMAMI0072',
    cam: { lat: 13.72257, lng: 100.553284 },
    roadName: 'ถนนพระรามที่ 4', // Rama IV Rd — crosses the frame broadside
    maxLenM: 250,
    backLenM: 250,
    preferBearingDeg: 293,
    travelBearingDeg: 293,
    lateralOffsetM: 9, // meters to the RIGHT of corridor travel (293°+90° = NNE)
  },
];

const DENSIFY_M = 15;
const FETCH_RADIUS_M = 2600;
const START_CANDIDATE_RADIUS_M = 100;
const MIN_CORRIDOR_LEN_M = 200;

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

async function fetchWays(cam, roadName) {
  const query = `[out:json][timeout:40];way(around:${FETCH_RADIUS_M},${cam.lat},${cam.lng})["highway"]["name"="${roadName}"];out tags geom;`;
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

const isOneway = (tags) => {
  const v = tags?.oneway;
  return v === 'yes' || v === '1' || v === 'true';
};

// A node "qualifies" as a corridor start if it belongs to at least one way
// that is either not one-way, or one-way with a local forward bearing (the
// road's legal travel direction at that node) within 45° of travelBearingDeg.
function nodeQualifies(node, travelBearingDeg) {
  for (const info of node.wayInfo) {
    if (!info.oneway) return true;
    if (info.localBearing !== null && angDiff(info.localBearing, travelBearingDeg) <= 45) return true;
  }
  return false;
}

function buildGraph(ways) {
  const nodes = new Map(); // key -> { pt, nbrs:Set<key>, wayInfo:[{oneway,localBearing}] }
  const ensure = (pt) => {
    const k = key(pt);
    if (!nodes.has(k)) nodes.set(k, { pt, nbrs: new Set(), wayInfo: [] });
    return k;
  };
  for (const w of ways) {
    if (!w.geometry) continue;
    const coords = w.geometry.map((p) => [p.lon, p.lat]);
    const oneway = isOneway(w.tags);
    for (let i = 0; i < coords.length; i++) {
      const k = ensure(coords[i]);
      if (i > 0) {
        const pk = key(coords[i - 1]);
        nodes.get(k).nbrs.add(pk);
        nodes.get(pk).nbrs.add(k);
      }
      let localBearing = null;
      if (oneway && coords.length > 1) {
        if (i === 0) localBearing = bearing(coords[0], coords[1]);
        else if (i === coords.length - 1) localBearing = bearing(coords[i - 1], coords[i]);
        else localBearing = bearing(coords[i - 1], coords[i + 1]);
      }
      nodes.get(k).wayInfo.push({ oneway, localBearing });
    }
  }
  return nodes;
}

function nearestNodeKey(nodes, cam) {
  let best = null;
  let bestD = Infinity;
  for (const [k, n] of nodes) {
    const d = hav([cam.lng, cam.lat], n.pt);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

// Follow the road from `startK` beginning toward `firstK`, always taking the
// straightest continuation. Stays on the single named road (the only road in
// the graph).
function follow(nodes, startK, firstK, maxLenM) {
  const path = [nodes.get(startK).pt, nodes.get(firstK).pt];
  const visited = new Set([startK, firstK]);
  let prevK = startK;
  let curK = firstK;
  let curHeading = bearing(nodes.get(startK).pt, nodes.get(firstK).pt);
  while (lineLen(path) < maxLenM) {
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

// Bearing from a walk's first point to the point ~60 m along it (or its last
// point if the whole walk is shorter than that).
function walkStartBearing(walkPts) {
  for (let i = 1; i < walkPts.length; i++) {
    if (hav(walkPts[0], walkPts[i]) >= 60 || i === walkPts.length - 1) {
      return bearing(walkPts[0], walkPts[i]);
    }
  }
  return 0;
}

// Chaengwattana-style dual carriageways can put the camera nearer the WRONG
// (opposite-direction) carriageway than the one it actually looks down. So
// instead of blindly using the single nearest node + its longest branch,
// consider every node within START_CANDIDATE_RADIUS_M of the camera as a
// candidate start; for each, walk every neighbor branch and keep only those
// whose start bearing is within 45° of preferBearingDeg; among all surviving
// walks, prefer the one whose start node is closest to the camera, falling
// back to the next-closest if the resulting corridor is too short.
function pickStart(nodes, cam, preferBearingDeg, travelBearingDeg, maxLenM) {
  const candidates = [];
  for (const [k, n] of nodes) {
    const d = hav([cam.lng, cam.lat], n.pt);
    if (d <= START_CANDIDATE_RADIUS_M && nodeQualifies(n, travelBearingDeg)) candidates.push({ k, d });
  }
  if (candidates.length === 0) {
    const k = nearestNodeKey(nodes, cam);
    candidates.push({ k, d: hav([cam.lng, cam.lat], nodes.get(k).pt) });
  }
  candidates.sort((a, b) => a.d - b.d);

  // For each start candidate, keep the longest walk whose start bearing
  // matches preferBearingDeg (within 45°).
  const perStart = [];
  for (const { k: startK, d } of candidates) {
    let best = null;
    for (const firstK of nodes.get(startK).nbrs) {
      const p = follow(nodes, startK, firstK, maxLenM);
      if (p.length < 2) continue;
      if (angDiff(walkStartBearing(p), preferBearingDeg) > 45) continue;
      if (!best || lineLen(p) > lineLen(best)) best = p;
    }
    if (best) perStart.push({ walk: best, d });
  }
  if (perStart.length === 0) return null;

  // Already sorted by distance-to-camera (candidates was sorted); pick the
  // closest one whose corridor meets the minimum length, else fall back to
  // the next-closest.
  for (const { walk } of perStart) {
    if (lineLen(walk) >= MIN_CORRIDOR_LEN_M) return walk;
  }
  return perStart[0].walk;
}

// Walk the road from the far end of `forward`'s start node in the OPPOSITE
// direction, so side-view corridors cover the road on both sides of the
// camera. Returns the combined line, still ordered in the forward direction.
function extendBackward(nodes, forward, preferBearingDeg, backLenM) {
  const startK = key(forward[0]);
  const backBearing = (preferBearingDeg + 180) % 360;
  let best = null;
  for (const firstK of nodes.get(startK).nbrs) {
    const p = follow(nodes, startK, firstK, backLenM);
    if (p.length < 2) continue;
    if (angDiff(walkStartBearing(p), backBearing) > 45) continue;
    if (!best || lineLen(p) > lineLen(best)) best = p;
  }
  if (!best) return forward;
  const clipped = [best[0]];
  let acc = 0;
  for (let i = 1; i < best.length && acc < backLenM; i++) {
    acc += hav(best[i - 1], best[i]);
    clipped.push(best[i]);
  }
  return clipped.reverse().slice(0, -1).concat(forward);
}

// Shift every vertex `offsetM` meters to the RIGHT of local travel direction
// (local bearing + 90°) — e.g. to move a carriageway centerline into the
// median of a dual carriageway.
function offsetLine(line, offsetM) {
  const M_PER_DEG_LAT = 111320;
  return line.map((p, i) => {
    const a = line[Math.max(i - 1, 0)];
    const b = line[Math.min(i + 1, line.length - 1)];
    const perp = rad(bearing(a, b) + 90);
    return [
      p[0] + (offsetM * Math.sin(perp)) / (M_PER_DEG_LAT * Math.cos(rad(p[1]))),
      p[1] + (offsetM * Math.cos(perp)) / M_PER_DEG_LAT,
    ];
  });
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

async function genCorridor({
  id,
  cam,
  roadName,
  maxLenM,
  backLenM,
  preferBearingDeg,
  travelBearingDeg,
  lateralOffsetM,
}) {
  const ways = (await fetchWays(cam, roadName)).filter((e) => e.geometry);
  if (!ways.length) throw new Error(`No "${roadName}" geometry found near the camera ${id}.`);
  const nodes = buildGraph(ways);

  const raw = pickStart(nodes, cam, preferBearingDeg, travelBearingDeg, maxLenM);
  if (!raw || raw.length < 2) {
    throw new Error(`Could not follow ${roadName} from camera ${id} (near preferred bearing ${preferBearingDeg}°).`);
  }

  let clipped = [raw[0]];
  let acc = 0;
  for (let i = 1; i < raw.length && acc < maxLenM; i++) {
    acc += hav(raw[i - 1], raw[i]);
    clipped.push(raw[i]);
  }
  if (backLenM) clipped = extendBackward(nodes, clipped, preferBearingDeg, backLenM);
  if (lateralOffsetM) clipped = offsetLine(clipped, lateralOffsetM);
  const corridor = densify(clipped, DENSIFY_M).map(([lng, lat]) => [
    Math.round(lng * 1e6) / 1e6,
    Math.round(lat * 1e6) / 1e6,
  ]);

  const totalM = Math.round(lineLen(corridor));
  const startBrg = Math.round(walkStartBearing(corridor));

  const jsonPath = path.join(__dirname, '..', 'detector', `road_${id}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(corridor));

  console.log(`Corridor ${id} on ${roadName}: ${corridor.length} pts, ${totalM} m, start bearing ${startBrg}°`);
  console.log(`  -> set HEADING_OVERRIDES['${id}'] = ${startBrg} in src/data/mockCameras.ts`);
  console.log(`  -> ${jsonPath}`);

  return { id, corridor };
}

async function main() {
  const results = [];
  for (const cfg of CAMERAS) {
    results.push(await genCorridor(cfg));
  }

  const tsPath = path.join(__dirname, '..', 'src', 'data', 'detectionCorridors.ts');
  let ts = `// AUTO-GENERATED by scripts/gen-detector-road.mjs. Real centerline of the\n`;
  ts += `// road each live-detection camera looks down (OSM, ODbL © OpenStreetMap\n`;
  ts += `// contributors), used to draw the corridor and to project detections onto\n`;
  ts += `// the road. Coordinates are [lng, lat].\n`;
  ts += `export const detectionCorridors: Record<string, [number, number][]> = {\n`;
  for (const { id, corridor } of results) {
    ts += `  '${id}': ${JSON.stringify(corridor)},\n`;
  }
  ts += `};\n`;
  fs.writeFileSync(tsPath, ts);
  console.log(`  -> ${tsPath}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
