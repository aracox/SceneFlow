#!/usr/bin/env node
// Regenerates src/data/realRoads.ts from OpenStreetMap (ODbL, © OpenStreetMap
// contributors). Fetches drivable road centerlines near MAP_CENTER, stitches
// connected segments, densifies them, and emits real road geometry so vehicles
// can drive on actual roads under a satellite/street basemap.
//
// Usage:  node scripts/gen-roads.mjs
// Requires network access to an Overpass API mirror (one-time, at build time).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'data', 'realRoads.ts');

// Must match MAP_CENTER in src/services/geometryUtils.ts.
const C = { lat: 13.805567987114605, lng: 100.57466669475343 };
const RADIUS_M = 1500; // ~2x the previous area so the scene spreads like a district
const MAX_DIST_M = 1400; // keep roads whose midpoint is within this of center
const PICK = 64; // number of real roads to keep
const ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const R = 6378137;
const rad = (d) => (d * Math.PI) / 180;
function hav(a, b) {
  // a, b are [lng, lat]
  const dLat = rad(b[1] - a[1]);
  const la1 = rad(a[1]);
  const la2 = rad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const distC = (p) => hav([C.lng, C.lat], p);
const len = (line) => line.reduce((L, p, i) => (i ? L + hav(line[i - 1], p) : 0), 0);

function densify(line, maxSeg = 30) {
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

function stitch(segs) {
  segs = segs.map((s) => s.slice());
  const eq = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
  const out = [];
  while (segs.length) {
    let cur = segs.shift();
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const head = cur[0];
        const tail = cur[cur.length - 1];
        if (eq(tail, s[0])) { cur = cur.concat(s.slice(1)); }
        else if (eq(tail, s[s.length - 1])) { cur = cur.concat(s.slice().reverse().slice(1)); }
        else if (eq(head, s[s.length - 1])) { cur = s.slice().concat(cur.slice(1)); }
        else if (eq(head, s[0])) { cur = s.slice().reverse().concat(cur.slice(1)); }
        else continue;
        segs.splice(i, 1);
        extended = true;
        break;
      }
    }
    out.push(cur);
  }
  return out;
}

const DRIVABLE = new Set([
  'primary', 'secondary', 'tertiary', 'residential', 'unclassified',
  'living_street', 'primary_link', 'secondary_link', 'tertiary_link',
]);

async function fetchRoads() {
  const query = `[out:json][timeout:40];way(around:${RADIUS_M},${C.lat},${C.lng})[highway];out tags geom;`;
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.elements) return data;
    } catch {
      /* try next mirror */
    }
  }
  throw new Error('All Overpass mirrors failed (rate-limited?). Try again later.');
}

async function main() {
  const data = await fetchRoads();

  const ways = data.elements.filter(
    (e) => e.type === 'way' && e.geometry && DRIVABLE.has(e.tags.highway),
  );
  const groups = new Map();
  let uid = 0;
  for (const w of ways) {
    const nm = w.tags.name || w.tags['name:en'];
    const key = nm ? 'n:' + nm : 'u:' + uid++;
    if (!groups.has(key)) groups.set(key, { name: nm || 'Local road', highway: w.tags.highway, ways: [] });
    groups.get(key).ways.push(w.geometry.map((g) => [g.lon, g.lat]));
  }

  let polylines = [];
  for (const g of groups.values()) {
    for (const pl of stitch(g.ways)) {
      if (pl.length < 2) continue;
      const mid = pl[Math.floor(pl.length / 2)];
      polylines.push({ name: g.name, highway: g.highway, L: len(pl), distC: distC(mid), line: pl });
    }
  }
  polylines = polylines.filter((p) => p.distC < MAX_DIST_M && p.L >= 120 && p.L <= 2500);
  polylines.sort((a, b) => b.L - a.L);

  const picked = [];
  const seen = new Set();
  for (const p of polylines) {
    const key = p.name + Math.round(p.L / 20);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(p);
    if (picked.length >= PICK) break;
  }

  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  let ts = `// AUTO-GENERATED from OpenStreetMap (ODbL, © OpenStreetMap contributors).\n`;
  ts += `// Real road centerlines near MAP_CENTER (Lat Phrao, Bangkok), used so vehicles\n`;
  ts += `// drive on actual roads when a real basemap is shown. Regenerate with scripts/gen-roads.\n`;
  ts += `import type { LineString } from 'geojson';\n\n`;
  ts += `export interface RealRoad { id: string; name: string; geometry: LineString; }\n\n`;
  ts += `export const realRoads: RealRoad[] = [\n`;
  picked.forEach((p, i) => {
    const id = 'ROAD-' + String(i + 1).padStart(2, '0');
    const coords = densify(p.line).map((c) => `[${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`).join(', ');
    ts += `  { id: '${id}', name: '${esc(p.name)}', geometry: { type: 'LineString', coordinates: [${coords}] } },\n`;
  });
  ts += `];\n`;
  fs.writeFileSync(OUT, ts);

  console.log('Picked roads:');
  picked.forEach((p, i) =>
    console.log(`  ROAD-${String(i + 1).padStart(2, '0')} [${p.highway}] ${p.name} — ${Math.round(p.L)}m`),
  );
  console.log(`\nWrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
