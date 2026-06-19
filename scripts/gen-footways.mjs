#!/usr/bin/env node
// Regenerates src/data/realFootways.ts from OpenStreetMap (ODbL, © OpenStreetMap
// contributors). Fetches footways/paths near MAP_CENTER, stitches connected
// segments, and densifies them so people and pets walk on real sidewalks under a
// satellite/street basemap. (No park exists nearby, so pets share the footways.)
//
// Usage:  node scripts/gen-footways.mjs
// Requires network access to an Overpass API mirror (one-time, at build time).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'data', 'realFootways.ts');

// Must match MAP_CENTER in src/services/geometryUtils.ts.
const C = { lat: 13.805567987114605, lng: 100.57466669475343 };
const RADIUS_M = 1150;
const MIN_LEN_M = 50;
const MAX_DIST_M = 1100;
const PICK = 36;
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const R = 6378137;
const rad = (d) => (d * Math.PI) / 180;
function hav(a, b) {
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
function densify(line, maxSeg = 18) {
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
    let ext = true;
    while (ext) {
      ext = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const head = cur[0];
        const tail = cur[cur.length - 1];
        if (eq(tail, s[0])) cur = cur.concat(s.slice(1));
        else if (eq(tail, s[s.length - 1])) cur = cur.concat(s.slice().reverse().slice(1));
        else if (eq(head, s[s.length - 1])) cur = s.slice().concat(cur.slice(1));
        else if (eq(head, s[0])) cur = s.slice().reverse().concat(cur.slice(1));
        else continue;
        segs.splice(i, 1);
        ext = true;
        break;
      }
    }
    out.push(cur);
  }
  return out;
}

async function fetchFootways() {
  const query = `[out:json][timeout:35];way(around:${RADIUS_M},${C.lat},${C.lng})[highway~"^(footway|path|pedestrian)$"];out tags geom;`;
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
  const data = await fetchFootways();
  const foot = data.elements.filter((e) => e.type === 'way' && e.geometry);
  let polylines = stitch(foot.map((w) => w.geometry.map((p) => [p.lon, p.lat])))
    .map((pl) => ({ L: len(pl), d: distC(pl[pl.length >> 1]), line: pl }))
    .filter((p) => p.L >= MIN_LEN_M && p.d < MAX_DIST_M);
  polylines.sort((a, b) => b.L - a.L);
  const picked = polylines.slice(0, PICK);
  if (!picked.length) throw new Error('No suitable footways found near MAP_CENTER.');

  let ts = `// AUTO-GENERATED from OpenStreetMap (ODbL, © OpenStreetMap contributors).\n`;
  ts += `// Real footway/sidewalk centerlines near MAP_CENTER (Lat Phrao, Bangkok), so people\n`;
  ts += `// and pets walk on real paths under a real basemap. Regenerate with scripts/gen-footways.\n`;
  ts += `import type { LineString } from 'geojson';\n\n`;
  ts += `export interface RealFootway { id: string; geometry: LineString; }\n\n`;
  ts += `export const realFootways: RealFootway[] = [\n`;
  picked.forEach((p, i) => {
    const id = 'PATH-' + String(i + 1).padStart(2, '0');
    const coords = densify(p.line).map((c) => `[${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`).join(', ');
    ts += `  { id: '${id}', geometry: { type: 'LineString', coordinates: [${coords}] } },\n`;
  });
  ts += `];\n`;
  fs.writeFileSync(OUT, ts);

  console.log('Picked footways:');
  picked.forEach((p, i) =>
    console.log(`  PATH-${String(i + 1).padStart(2, '0')} — ${Math.round(p.L)}m (${Math.round(p.d)}m from center)`),
  );
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
