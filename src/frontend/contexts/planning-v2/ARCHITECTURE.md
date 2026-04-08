# Warehouse Planning V2

## Bounded Contexts

- `Presentation Context`
  - Route: `#/planning-v2`
  - Owns search input, wizard, 2D canvas, 3D preview, and candidate switching.
- `Intent Capture Context`
  - Turns search text and wizard answers into `PlanningIntentMessage`.
- `Planning Context`
  - Receives `GeneratePlanCommand` and produces differentiated candidates.
- `Refinement Context`
  - Applies delta changes against the current plan instead of regenerating blindly.
- `Preview / Projection Context`
  - Projects layout plans into 2D and 3D render data.

## Keep

- Existing `container / zone / item` models
- Existing 2D and 3D rendering core
- Existing `warehouse-layout-planner`
- Existing allocation and packing services

## Abstract

- Add `planning_intent` as the V2 contract between quick mode and low-level engines
- Add parser, constraint builder, scoring, and explanation layers
- Keep storage access behind V2 services

## Isolate

- Presentation never manipulates subdivision matrices directly
- Planning V2 uses `planning_intent -> constraint builder -> layout generator`
- Debug traces stay in code/dev tooling, not in the main UI

## Removed From Planning V2

- Pillar / obstacle authoring
- Manual obstacle coordinates
- Planning-to-expert bridge buttons
- Main-page contract/debug cards
