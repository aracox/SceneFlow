// Bangkok flood-risk water-level CCTV cameras, sourced from the Department of
// Drainage and Sewerage, Bangkok Metropolitan Administration
// (สำนักการระบายน้ำ กรุงเทพมหานคร — https://dds.bangkok.go.th/cctv.php).
//
// These are REAL external feeds: each `imageUrl` is a periodically-refreshed
// JPEG still (not video), so they are polled with a cache-busting query param
// rather than played as HLS. Like src/data/realCameraStreams.ts, referencing
// them intentionally overrides CLAUDE.md's "no real camera streams / external
// APIs" rule. These cameras live in central Bangkok, not the Digital Valley
// pilot site, so they are shown only as a sidebar feed — never placed as map
// markers (which would break the ±400 m geometry rules).
export interface WaterLevelCamera {
  id: string;
  /** English label shown in the sidebar. */
  name: string;
  /** Thai location name as published by DDS. */
  nameThai: string;
  /** Auto-refreshing still-image URL. */
  imageUrl: string;
  /** Real WGS84 location, used to fly the map to the camera. */
  lat: number;
  lng: number;
}

const IMAGE_BASE = 'https://dds.bangkok.go.th/cctv-image';

// Coordinates are neighborhood-accurate (authoritative for Pinklao Bridge and
// Khlong Chak Phra; OSM canal/landmark centroids for the rest). The physical
// gate/pump structures may sit tens-to-hundreds of metres off these points.
export const waterLevelCameras: WaterLevelCamera[] = [
  { id: 'DDS-CCTV-01', name: 'Bang Khen Mai', nameThai: 'บางเขนใหม่', imageUrl: `${IMAGE_BASE}/cctv1.jpg`, lat: 13.8209, lng: 100.5152 },
  { id: 'DDS-CCTV-02', name: 'Pinklao Bridge', nameThai: 'สะพานปิ่นเกล้า', imageUrl: `${IMAGE_BASE}/cctv2.jpg`, lat: 13.7619, lng: 100.4911 },
  { id: 'DDS-CCTV-03', name: 'Bang Na', nameThai: 'บางนา', imageUrl: `${IMAGE_BASE}/cctv3.jpg`, lat: 13.6676, lng: 100.6068 },
  { id: 'DDS-CCTV-04', name: 'Khlong Suan Daen 1', nameThai: 'คลองสวนแดน1', imageUrl: `${IMAGE_BASE}/cctv4.jpg`, lat: 13.7925, lng: 100.4589 },
  { id: 'DDS-CCTV-05', name: 'Khlong Chak Phra', nameThai: 'คลองชักพระ', imageUrl: `${IMAGE_BASE}/cctv5.jpg`, lat: 13.7444, lng: 100.4621 },
  { id: 'DDS-CCTV-06', name: 'Khlong Thawi Watthana', nameThai: 'คลองทวีวัฒนา', imageUrl: `${IMAGE_BASE}/cctv6.jpg`, lat: 13.7631, lng: 100.3473 },
];

export function getWaterLevelCamera(id: string): WaterLevelCamera | undefined {
  return waterLevelCameras.find((c) => c.id === id);
}
