---
name: sceneflow-add-geometry
description: Add or edit map geometry in SceneFlow — paths/lanes, zones/buildings, cameras, or basemap layers. Use when asked to add roads, routes, walkways, waterways, buildings, parking, restricted areas, or cameras to the pilot site.
---

# Adding geometry to SceneFlow

## Hard coordinate rules (never violate)

- All geometry is generated **relative to `MAP_CENTER`**
  (13.805567987114605, 100.57466669475343) using
  `offsetCoordinate(center, metersEast, metersNorth)` from
  `src/services/geometryUtils.ts`. Never hand-write lat/lng literals.
- The site is ~800 m × 800 m: keep all offsets within **±400 m** of center
  (lat 13.8020–13.8095, lng 100.5710–100.5785).
- GeoJSON coordinates are WGS84 **[lng, lat]** order.
- Data files use local helpers `o(east, north)` / `line(...)` / `rect(...)` —
  reuse them.

## Paths (`src/data/mockPaths.ts`)

- `path_type` is one of `road_lane | shuttle_route | pedestrian_path | waterway`.
- Every path needs `path_id`, `name`, `direction`, `entity_types_allowed`,
  `geometry`. ID conventions: `LANE-*`, `SHUTTLE-*`, `PED-*`, `PARK-*`,
  `WATERWAY-*`, `WATERFLOW-*`.
- Road corridors come in **opposite-direction lane pairs** offset ±3.5 m from
  the corridor centerline (see `horizontalLane`/`verticalLane`). When adding a
  road corridor, also add its centerline to `roadCenterlines` — that is what
  draws the white road surface on the basemap.
- Loops (shuttle, walkway loops) must repeat the first coordinate as the last.
- Entities wrap from the end of a path back to its start; the renderer treats
  jumps > 60 m as wrap-arounds (no interpolation/trail across them).

## Zones (`src/data/mockZones.ts`)

- `zone_type` is one of `building | parking | pedestrian | waterway | restricted | incident`.
- `properties.kind` differentiates pedestrian zones (`park`, `plaza`,
  `shuttle_stop`) — `SceneMap` styles `park` green and the rest light gray.
- `properties.label: false` hides the floating zone label (labels are DOM
  markers, not symbol layers — there is no glyph server).
- Zone membership of movement points is computed by point-in-polygon at
  startup, so zones placed over paths automatically show up in entity details
  and clip summaries.

## Cameras (`src/data/mockCameras.ts`)

- Add a `CameraSpec` (position in meters east/north, `direction_deg`,
  `fov_deg`, `range_m`, `supported_entity_types`, `status`). The coverage
  sector polygon is built automatically via `sectorPolygon`.
- Aim coverage at a path: an entity is `tracked` (high confidence) only while
  inside an online camera's sector that supports its type; elsewhere it is
  `predicted`. `offline` cameras never detect; `warning` still detects.
- Camera handoffs generate the mock events feed automatically.

## Rendering new layers

Static layers live in `addStaticLayers` in
`src/components/map/SceneMap.tsx`. If a new layer should be toggleable, add
its layer ids to `LAYER_GROUPS` under the right `LayerKey`. Layer order =
insertion order (terrain → roads → buildings → path overlays → coverage →
trail).
