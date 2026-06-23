#!/usr/bin/env node
// Regenerates src/data/realTrafficLights.ts from the public Google My Maps layer
// "จุดติดตั้งระบบสัญญาณไฟจราจร Adaptive" (adaptive traffic-signal installation
// points, Bangkok). Locations + names only. Source: Google My Maps KML export.
//
// Usage:  node scripts/gen-trafficlights.mjs
// Requires network access (one-time, at build time).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'data', 'realTrafficLights.ts');
const MID = '1RoNSrgsWmV1hiipkHc8VIjCdNaSE2Ww';
const URL = `https://www.google.com/maps/d/kml?mid=${MID}&forcekml=1`;

const clean = (s) =>
  (s || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function main() {
  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`KML HTTP ${res.status}`);
  const kml = await res.text();

  const lights = [];
  const placemarks = kml.split('<Placemark>').slice(1);
  let i = 0;
  for (const pm of placemarks) {
    const coordM = pm.match(/<coordinates>\s*([-\d.]+),([-\d.]+)/);
    if (!coordM) continue;
    const lng = parseFloat(coordM[1]);
    const lat = parseFloat(coordM[2]);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    const nameM = pm.match(/<name>([\s\S]*?)<\/name>/);
    const name = clean(nameM && nameM[1]) || `Signal ${i + 1}`;
    lights.push({ id: `TL-${String(++i).padStart(3, '0')}`, name, lat, lng });
  }
  if (!lights.length) throw new Error('No placemarks parsed from KML.');

  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  let ts = `// AUTO-GENERATED from the public Google My Maps layer\n`;
  ts += `// "จุดติดตั้งระบบสัญญาณไฟจราจร Adaptive" (Bangkok adaptive traffic signals).\n`;
  ts += `// Locations + names only. Regenerate with scripts/gen-trafficlights.\n`;
  ts += `export interface RealTrafficLight { id: string; name: string; lat: number; lng: number; }\n\n`;
  ts += `export const realTrafficLights: RealTrafficLight[] = [\n`;
  for (const l of lights) {
    ts += `  { id: '${l.id}', name: '${esc(l.name)}', lat: ${l.lat.toFixed(6)}, lng: ${l.lng.toFixed(6)} },\n`;
  }
  ts += `];\n`;
  fs.writeFileSync(OUT, ts);
  console.log(`Wrote ${lights.length} traffic lights to ${OUT}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
