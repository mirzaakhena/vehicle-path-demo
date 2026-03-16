# vehicle-path-demo

Interactive visual editor for the [vehicle-path2](https://www.npmjs.com/package/vehicle-path2) library. Draw lines, connect them with bezier curves, place multi-axle vehicles, and watch them navigate the path with physics-based acceleration.

## What This Demo Does

This is **not** a standalone app — it exists to visually verify and demonstrate how `vehicle-path2` works in practice. It exercises the library's core API: `PathEngine` for scene/graph management, path finding, and vehicle movement with acceleration.

### Features

- **Draw lines** — click and drag to create directional line segments
- **Connect with curves** — drag from one line to another to create bezier curve connections
- **Place vehicles** — click on a line to place a multi-axle vehicle (2–5 axles, configurable spacing)
- **Set destination** — select a vehicle, then click a target position on any reachable line
- **Animate** — play to watch the vehicle navigate with acceleration, curve deceleration, and arrival deceleration
- **Edit scene** — drag line endpoints, rename lines, adjust curve offsets, delete elements
- **Copy snapshot** — serialize the current scene to JSON (clipboard)

## Setup

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

### Local library development

To work on the library and see changes reflected in the demo:

```bash
# In the library repo
cd ../vehicle-path
npm link

# In this demo repo
npm link vehicle-path2
```

Then `npm run dev` — Vite picks up library changes automatically.

## Architecture

```
src/
  App.tsx          — State management, PathEngine integration, animation loop
  types.ts         — Demo-specific types (PlacedVehicle, StoredCurve, VehicleEndPoint)
  components/
    Canvas.tsx     — SVG rendering, mouse interactions, hit detection, drag operations
    Panel.tsx      — Controls panel (mode selection, vehicle config, scene inspector)
```

### How the demo uses the library

| Library API | Used for |
|-------------|----------|
| `PathEngine` | Persistent scene manager — graph, beziers, path validation |
| `engine.getGraph()` | Scene stats (node count) |
| `engine.canReach()` | Validate if vehicle can reach destination (green/red preview) |
| `engine.initializeVehicle()` | Compute initial axle positions when placing vehicle |
| `engine.preparePath()` | Build path execution plan before animation |
| `engine.moveVehicleWithAcceleration()` | Advance vehicle each frame with physics |
| `createBezierCurve()` | Real-time bezier preview during curve drag |
| `calculateInitialAxlePositions()` | Position axles during placement and line edits |
| `getPositionFromOffset()` | Recompute axle positions when line moves |
| `projectPointOnLine()` | Mouse-to-line hit detection |
| `getValidRearOffsetRange()` | Clamp vehicle placement to valid range |
| `computeMinLineLength()` | Prevent line from shrinking below curve constraints |
| `serializeScene()` | Copy scene snapshot to clipboard |

### What the demo manages itself

The library does not manage vehicles — that's the client's responsibility. The demo handles:

- Vehicle state (`PlacedVehicle[]`) — placement, selection, removal
- Endpoint targets (`VehicleEndPoint`) — where each vehicle should go
- Position cascade — when a line is dragged, recalculate all vehicle/endpoint positions on that line
- Animation loop — `requestAnimationFrame` loop calling `engine.moveVehicleWithAcceleration`
- All SVG rendering and mouse interactions

## Keyboard / Mouse Controls

| Mode | Action |
|------|--------|
| **Drag** | Drag line endpoints, line bodies, curve attachment points, vehicles |
| **Line** | Click + drag to draw a new line |
| **Curve** | Click a line (from-point), drag to another line (to-point), release |
| **Vehicle Start** | Hover a line to preview, click to place |
| **Vehicle End** | Select a vehicle first, hover a line to see destination preview (green = reachable), click to set |

## Tech Stack

- React 19 + TypeScript
- Vite
- SVG rendering (no canvas/WebGL)
- vehicle-path2 (core algorithms + PathEngine)

## License

MIT
