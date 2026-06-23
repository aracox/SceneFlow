#!/usr/bin/env node
// Regenerates src/data/realCameras.ts from the public iTIC Foundation / Longdo
// Map CCTV feed (https://camera.longdo.com/feed/?command=json), as shown on
// https://live.iticfoundation.org/. Camera LOCATIONS + names only — no video is
// embedded or stored. Data © iTIC Foundation / Longdo Map; for prototype use.
//
// Usage:  node scripts/gen-cameras.mjs
// Requires network access (one-time, at build time).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'data', 'realCameras.ts');
const FEED = 'https://camera.longdo.com/feed/?command=json';

async function main() {
  const res = await fetch(FEED, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://live.iticfoundation.org/' },
  });
  if (!res.ok) throw new Error(`Feed HTTP ${res.status}`);
  const raw = await res.json();

  const cams = raw
    .map((c) => ({
      id: String(c.camid || '').trim(),
      name: String(c.title || '').trim(),
      lat: Number(c.latitude),
      lng: Number(c.longitude),
      org: String(c.organization || '').trim(),
      incity: c.incity === 'Y',
    }))
    .filter((c) => c.id && isFinite(c.lat) && isFinite(c.lng));

  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  let ts = `// AUTO-GENERATED from the iTIC Foundation / Longdo Map CCTV feed\n`;
  ts += `// (https://camera.longdo.com/feed/?command=json), as shown on\n`;
  ts += `// https://live.iticfoundation.org/. Camera locations + names only; no video.\n`;
  ts += `// Data © iTIC Foundation / Longdo Map. Regenerate with scripts/gen-cameras.\n`;
  ts += `export interface RealCamera {\n`;
  ts += `  id: string;\n  name: string;\n  lat: number;\n  lng: number;\n  org: string;\n  incity: boolean;\n}\n\n`;
  ts += `export const realCameras: RealCamera[] = [\n`;
  for (const c of cams) {
    ts += `  { id: '${esc(c.id)}', name: '${esc(c.name)}', lat: ${c.lat.toFixed(6)}, lng: ${c.lng.toFixed(6)}, org: '${esc(c.org)}', incity: ${c.incity} },\n`;
  }
  ts += `];\n`;
  fs.writeFileSync(OUT, ts);
  console.log(`Wrote ${cams.length} cameras to ${OUT}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
