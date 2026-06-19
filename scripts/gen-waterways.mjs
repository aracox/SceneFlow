#!/usr/bin/env node
// Regenerates src/data/realWaterways.ts from OpenStreetMap (ODbL, © OpenStreetMap
// contributors). Fetches canals/rivers near MAP_CENTER, picks the one closest to
// the scene, clips it to the stretch passing nearby, and densifies it so boats /
// floating waste follow a real waterway under a satellite/street basemap.
//
// Usage:  node scripts/gen-waterways.mjs
// Requires network access to an Overpass API mirror (one-time, at build time).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'data', 'realWaterways.ts');

// Must match MAP_CENTER in src/services/geometryUtils.ts.
const C = { lat: 13.805567987114605, lng: 100.57466669475343 };
const SEARCH_M = 1500; // canals can sit a little outside the site
const CLIP_M = 1300; // keep the contiguous stretch within this of center
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
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

async function fetchWaterways() {
  const query = `[out:json][timeout:35];way(around:${SEARCH_M},${C.lat},${C.lng})[waterway~"^(river|canal|stream|drain)$"];out tags geom;`;
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
  const data = await fetchWaterways();
  const ways = data.elements.filter((e) => e.type === 'way' && e.geometry);
  if (!ways.length) throw new Error('No waterways found near MAP_CENTER.');

  // Closest canal to the scene wins.
  ways.sort((a, b) => {
    const ma = a.geometry.map((p) => [p.lon, p.lat]);
    const mb = b.geometry.map((p) => [p.lon, p.lat]);
    return distC(ma[ma.length >> 1]) - distC(mb[mb.length >> 1]);
  });
  const w = ways[0];
  const name = w.tags.name || w.tags['name:en'] || 'Canal';
  const g = w.geometry.map((p) => [p.lon, p.lat]);

  const near = g.map((p) => distC(p) < CLIP_M);
  let lo = near.indexOf(true);
  let hi = near.lastIndexOf(true);
  if (lo < 0) {
    lo = 0;
    hi = g.length - 1;
  }
  lo = Math.max(0, lo - 1);
  hi = Math.min(g.length - 1, hi + 1);
  const dense = densify(g.slice(lo, hi + 1));

  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const coords = dense.map((c) => `[${c[0].toFixed(6)}, ${c[1].toFixed(6)}]`).join(', ');
  let ts = `// AUTO-GENERATED from OpenStreetMap (ODbL, © OpenStreetMap contributors).\n`;
  ts += `// Real waterway centerline near MAP_CENTER (Lat Phrao, Bangkok), clipped to the\n`;
  ts += `// stretch passing the scene, so boats/floating waste follow a real canal under a\n`;
  ts += `// real basemap. Regenerate with scripts/gen-waterways.\n`;
  ts += `import type { LineString } from 'geojson';\n\n`;
  ts += `export interface RealWaterway { id: string; name: string; geometry: LineString; }\n\n`;
  ts += `export const realWaterways: RealWaterway[] = [\n`;
  ts += `  { id: 'WATER-01', name: '${esc(name)}', geometry: { type: 'LineString', coordinates: [${coords}] } },\n`;
  ts += `];\n`;
  fs.writeFileSync(OUT, ts);

  console.log(`Waterway: ${name}`);
  console.log(`Clipped length ${Math.round(len(dense))}m, ${dense.length} points`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
