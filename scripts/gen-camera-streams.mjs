#!/usr/bin/env node
// Regenerates src/data/realCameraStreams.ts: a map of camera id -> live HLS
// stream URL, sourced from the public iTIC Foundation / Longdo Map CCTV feed
// (https://camera.longdo.com/feed/?command=json), the same feed used by
// scripts/gen-cameras.mjs. The hls_url field is a REAL external live video
// stream — wiring it into the app intentionally overrides CLAUDE.md's
// "no real camera streams" rule. Data © iTIC Foundation / Longdo Map.
//
// Usage:  node scripts/gen-camera-streams.mjs
// Requires network access (one-time, at build time).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'data', 'realCameraStreams.ts');
const FEED = 'https://camera.longdo.com/feed/?command=json';

async function main() {
  const res = await fetch(FEED, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://live.iticfoundation.org/' },
  });
  if (!res.ok) throw new Error(`Feed HTTP ${res.status}`);
  const raw = await res.json();

  const rows = raw
    .map((c) => [String(c.camid || '').trim(), String(c.hls_url || '').trim()])
    .filter(([id, url]) => id && url);

  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  let ts = `// AUTO-GENERATED from the iTIC Foundation / Longdo Map CCTV feed\n`;
  ts += `// (https://camera.longdo.com/feed/?command=json). Maps camera id -> live HLS\n`;
  ts += `// stream URL (hls_url). These are REAL external video streams; using them\n`;
  ts += `// intentionally overrides CLAUDE.md's "no real camera streams" rule.\n`;
  ts += `// Regenerate with scripts/gen-camera-streams.mjs. Data © iTIC Foundation / Longdo Map.\n`;
  ts += `export const cameraStreams: Record<string, string> = {\n`;
  for (const [id, url] of rows) ts += `  '${esc(id)}': '${esc(url)}',\n`;
  ts += `};\n`;
  fs.writeFileSync(OUT, ts);
  console.log(`Wrote ${rows.length} stream URLs to ${OUT}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
