import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const root = process.cwd();
const stopsPath = path.join(root, 'data/namtang-gtfs/stops.txt');
const outputPath = path.join(root, 'public/generated/namtangPiers.generated.json');
const BANGKOK_BOUNDS = {
  minLat: 13.55,
  maxLat: 14.0,
  minLng: 100.3,
  maxLng: 100.75,
};

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
    const [output, stops] = await Promise.all([stat(outputPath), stat(stopsPath)]);
    return output.mtimeMs >= stops.mtimeMs;
  } catch {
    return false;
  }
}

function roundCoord(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function splitStopName(stopName) {
  const [nameThai, nameEn] = stopName.split(';');
  return {
    nameThai: nameThai?.trim() || stopName.trim(),
    nameEn: nameEn?.trim() || nameThai?.trim() || stopName.trim(),
  };
}

function isBangkokPier(stopName, lat, lng) {
  const inBounds =
    lat >= BANGKOK_BOUNDS.minLat &&
    lat <= BANGKOK_BOUNDS.maxLat &&
    lng >= BANGKOK_BOUNDS.minLng &&
    lng <= BANGKOK_BOUNDS.maxLng;
  return inBounds && (stopName.includes('Pier') || stopName.includes('ท่าเรือ'));
}

async function readPiers() {
  const rl = readline.createInterface({
    input: createReadStream(stopsPath),
    crlfDelay: Infinity,
  });

  const piers = [];
  let header = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!header) {
      header = parseCsvLine(line);
      continue;
    }
    const row = parseCsvLine(line);
    const stopName = row[header.indexOf('stop_name')];
    const lat = Number(row[header.indexOf('stop_lat')]);
    const lng = Number(row[header.indexOf('stop_lon')]);
    if (!stopName || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!isBangkokPier(stopName, lat, lng)) continue;
    const { nameThai, nameEn } = splitStopName(stopName);
    piers.push({
      id: row[header.indexOf('stop_id')],
      name: nameEn,
      nameThai,
      lat: roundCoord(lat),
      lng: roundCoord(lng),
    });
  }

  piers.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  return piers;
}

if (!(await fileExists(stopsPath))) {
  console.log('Skipped Namtang piers: raw GTFS stops.txt is missing.');
  process.exit(0);
}

if (await outputIsFresh()) {
  console.log(`Namtang piers are up to date: ${outputPath}`);
  process.exit(0);
}

const compact = {
  schema: 1,
  bounds: BANGKOK_BOUNDS,
  piers: await readPiers(),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(compact)}\n`);

console.log(`Generated ${outputPath}`);
console.log(`${compact.piers.length.toLocaleString()} Bangkok piers`);
