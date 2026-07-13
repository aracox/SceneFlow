---
name: sceneflow-add-entity
description: Add a new entity (or entity type) to the SCENE FLOW mock database so it appears moving on the map. Use when asked to add vehicles, people, boats, pets, waste, incidents, or a brand-new entity type to the prototype.
---

# Adding an entity to SCENE FLOW

Movement in SCENE FLOW is **always derived from path geometry** — never place an
entity with raw coordinates and never use random movement. An entity becomes
visible by being assigned to a path; its positions are generated at startup by
`generateMovementPoints` walking the path's LineString.

## Checklist: new entity instance (existing type)

1. **`src/data/mockEntities.ts`** — add the record via the `entity()` helper.
   Follow the existing ID scheme (`VEH-007`, `PERSON-009`, ...). Set `color`
   (hex, used by the marker SVG) and realistic `attributes`. Never include
   license plates — the product explicitly does no LPR.
2. **`src/data/mockMovementPoints.ts`** — add a row to `movementAssignments`
   with `pathId`, `speedKmh`, `startDistanceM`. The path's
   `entity_types_allowed` must include the entity's type. Pick a
   `startDistanceM` that spreads entities out along the path. Realistic speeds:
   vehicles 24–40, shuttle ~17, people 3.5–5.5, pets 5–7, boats 6–10,
   floating waste 1–2 km/h.
   - Stationary incidents instead go in `incidentPositions` (meters east/north
     of MAP_CENTER + reporting camera).
3. Nothing else is required — markers, KPI counts, events, detail panel, and
   clips all derive from the mock store automatically.

## Checklist: new entity *type*

All of the above, plus:

1. **`src/types/scene.ts`** — extend the `Entity['entity_type']` union.
2. **`src/store/sceneStore.ts`** — add a `LayerKey` and a case in
   `layerKeyForEntity`.
3. **`src/components/layout/Sidebar.tsx`** — add the layer toggle to
   `LAYER_TOGGLES`.
4. **`src/components/map/EntityMarker.tsx`** — add an SVG case in `iconSvg`.
   Icons point **north (up)**; add the type to `ROTATABLE` only if the icon
   should rotate with `heading_deg`.
5. **`src/components/layout/KpiCards.tsx`** — add a KPI card if it deserves one
   (keep the grid column count in sync).
6. **`src/data/mockCameras.ts`** — add the type to `supported_entity_types` of
   at least one camera, otherwise the entity will always render as `predicted`
   (dashed outline, low confidence).
7. If no existing path suits the type, add one first — see the
   `sceneflow-add-geometry` skill.

## Verify

Run the app (see `sceneflow-verify` skill): the entity must move along its
assigned path only, be selectable, show correct detail-panel values, and be
clippable via "Save 5-minute clip".
