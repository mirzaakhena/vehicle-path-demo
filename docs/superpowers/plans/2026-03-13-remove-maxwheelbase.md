# Remove maxWheelbase & willFlip — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hapus `maxWheelbase` dari seluruh public API library `vehicle-path2`, dan buang parameter `willFlip` dari `createBezierCurve` karena keduanya sudah dead code. Update `vehicle-path-demo` untuk mengikuti API baru.

**Architecture:** Dua repo terpisah. Library (`vehicle-path`) diubah duluan → di-commit → user publish ke npm → demo (`vehicle-path-demo`) update dependency dan bersihkan sisa penggunaan.

**Tech Stack:** TypeScript, Vitest (library), Vite + React (demo)

**Dependency:** Part B (demo) baru bisa dikerjakan setelah user menjalankan `npm publish` pada library.

---

## Part A — Library: `C:\Users\Mirza\workspace\vehicle-path`

---

### Task A1 — Hapus `maxWheelbase` dari `MovementConfig` dan `PathEngineConfig`

**Files:**
- Modify: `src/core/types/movement.ts`
- Modify: `src/core/engine.ts`

- [ ] **Step 1: Hapus dari `MovementConfig`**

Di `src/core/types/movement.ts`, hapus field `maxWheelbase: number` dari interface `MovementConfig`:

```typescript
export interface MovementConfig {
  tangentMode: TangentMode
}
```

- [ ] **Step 2: Hapus dari `PathEngineConfig` dan constructor**

Di `src/core/engine.ts`, ubah interface dan constructor:

```typescript
export interface PathEngineConfig {
  tangentMode: TangentMode
}
```

Di constructor:
```typescript
constructor(engineConfig: PathEngineConfig) {
  this.config = {
    tangentMode: engineConfig.tangentMode
  }
}
```

Update juga JSDoc example di atas class (hapus `maxWheelbase: 100` dari contoh).

---

### Task A2 — Hapus `willFlip` dari `createBezierCurve`

**Files:**
- Modify: `src/core/algorithms/math.ts`

- [ ] **Step 1: Hapus parameter `willFlip` dan branch-nya**

Fungsi sebelum:
```typescript
export function createBezierCurve(
  line: Line,
  nextLine: Line,
  config: MovementConfig,
  willFlip: boolean = false,
  offsetOptions?: CurveOffsetOptions
): BezierCurve {
  const { maxWheelbase, tangentMode } = config
  ...
  const p0 = willFlip ? { x: baseP0.x - dir.x * maxWheelbase, ... } : baseP0
  ...
  const p1 = willFlip
    ? { x: p0.x - dir0.x * tangentLen, ... }
    : { x: p0.x + dir0.x * tangentLen, ... }
```

Ganti menjadi (hapus param `willFlip`, hapus `maxWheelbase` dari destructure, hapus `const dir` yang hanya dipakai untuk flip, sederhanakan p0 dan p1):

```typescript
export function createBezierCurve(
  line: Line,
  nextLine: Line,
  config: MovementConfig,
  offsetOptions?: CurveOffsetOptions
): BezierCurve {
  const { tangentMode } = config

  let p0: Point
  if (offsetOptions?.fromOffset !== undefined) {
    p0 = getPointOnLineByOffset(line, offsetOptions.fromOffset, offsetOptions.fromIsPercentage ?? false)
  } else {
    p0 = line.end
  }

  let p3: Point
  if (offsetOptions?.toOffset !== undefined) {
    p3 = getPointOnLineByOffset(nextLine, offsetOptions.toOffset, offsetOptions.toIsPercentage ?? false)
  } else {
    p3 = nextLine.start
  }

  const dir0 = normalize(line.start, line.end)
  const dir3 = normalize(nextLine.start, nextLine.end)
  const dist = distance(p0, p3)
  const tangentLen = calculateTangentLength(tangentMode, dist)

  const p1 = { x: p0.x + dir0.x * tangentLen, y: p0.y + dir0.y * tangentLen }
  const p2 = { x: p3.x - dir3.x * tangentLen, y: p3.y - dir3.y * tangentLen }

  return { p0, p1, p2, p3 }
}
```

Hapus juga import `MovementConfig` jika tidak lagi dipakai (cek apakah masih ada import lain di file ini).

- [ ] **Step 2: Update import di math.ts**

Cek baris import di atas math.ts. Sebelum:
```typescript
import type { MovementConfig } from '../types/movement'
```
`MovementConfig` masih dipakai di signature `createBezierCurve` → pertahankan import ini.

---

### Task A3 — Hapus `_maxWheelbase` dari resolve functions di `pathFinding.ts`

**Files:**
- Modify: `src/core/algorithms/pathFinding.ts`

- [ ] **Step 1: Hapus parameter `_maxWheelbase` dari `resolveFromLineOffset`**

```typescript
export function resolveFromLineOffset(
  line: Line,
  offset: number | undefined,
  isPercentage: boolean | undefined,
  defaultPercentage: number
): number {
```

- [ ] **Step 2: Hapus parameter `_maxWheelbase` dari `resolveToLineOffset`**

```typescript
export function resolveToLineOffset(
  line: Line,
  offset: number | undefined,
  isPercentage: boolean | undefined,
  defaultPercentage: number
): number {
```

- [ ] **Step 3: Update call sites di `buildGraph`**

Cari dua baris ini (sekitar line 156-157):
```typescript
const fromOffset = resolveFromLineOffset(fromLine, curve.fromOffset, curve.fromIsPercentage, 1, config.maxWheelbase)
const toOffset = resolveToLineOffset(toLine, curve.toOffset, curve.toIsPercentage, 0, config.maxWheelbase)
```

Ganti menjadi:
```typescript
const fromOffset = resolveFromLineOffset(fromLine, curve.fromOffset, curve.fromIsPercentage, 1)
const toOffset = resolveToLineOffset(toLine, curve.toOffset, curve.toIsPercentage, 0)
```

- [ ] **Step 4: Update call ke `createBezierCurve` di `buildGraph`**

Cari (sekitar line 161-172):
```typescript
const bezier = createBezierCurve(
  fromLine,
  toLine,
  config,
  false, // willFlip is always false now
  { ... }
)
```

Hapus argumen `false`:
```typescript
const bezier = createBezierCurve(
  fromLine,
  toLine,
  config,
  { ... }
)
```

Hapus juga komentar `// Resolve offsets with wheelbase adjustment` yang sudah tidak akurat (sekitar line 153-155).

---

### Task A4 — Update `vehicleMovement.ts`

**Files:**
- Modify: `src/core/algorithms/vehicleMovement.ts`

- [ ] **Step 1: Update dua call ke resolve functions dan createBezierCurve**

Cari dua blok (sekitar line 490-510) yang memanggil `resolveFromLineOffset` / `resolveToLineOffset` dengan `config.maxWheelbase`, dan call ke `createBezierCurve` dengan `false`:

```typescript
// SEBELUM:
const fromOffset = resolveFromLineOffset(..., config.maxWheelbase)
const toOffset = resolveToLineOffset(..., config.maxWheelbase)
const bezier = createBezierCurve(fromLine, toLine, config, false, { ... })

// SESUDAH:
const fromOffset = resolveFromLineOffset(...)   // tanpa maxWheelbase
const toOffset = resolveToLineOffset(...)       // tanpa maxWheelbase
const bezier = createBezierCurve(fromLine, toLine, config, { ... })  // tanpa false
```

---

### Task A5 — Update `validateAndCreateVehicles` di `vehicle-helpers.ts`

**Files:**
- Modify: `src/utils/vehicle-helpers.ts`
- Modify: `src/core/types/vehicle.ts`

- [ ] **Step 1: Update comment di `VehicleStart.axleSpacings`**

Di `src/core/types/vehicle.ts`, ubah comment:
```typescript
/** axleSpacings[i] = arc-length antara axles[i] dan axles[i+1]. Default: [] (1 axle) */
axleSpacings?: number[]
```

- [ ] **Step 2: Hapus parameter `maxWheelbase` dari `validateAndCreateVehicles`**

```typescript
export function validateAndCreateVehicles(
  vehicleStarts: VehicleStart[],
  lines: Line[]
): { vehicles: Vehicle[]; errors: string[] } {
```

Ubah fallback axleSpacings (sekitar line 31):
```typescript
const axleSpacings = vs.axleSpacings ?? []
```

---

### Task A6 — Update React hooks

**Files:**
- Modify: `src/react/hooks/useVehicles.ts`
- Modify: `src/react/hooks/useAnimation.ts`
- Modify: `src/react/hooks/useVehicleSimulation.ts`
- Modify: `src/react/dsl-hooks/useInitialMovement.ts`

- [ ] **Step 1: `useVehicles.ts`** — hapus `maxWheelbase` dari `UseVehiclesProps` dan semua penggunaannya:

```typescript
export interface UseVehiclesProps {
  lines: Line[]
}
export function useVehicles({ lines }: UseVehiclesProps) { ... }
```

Update 2 call ke `validateAndCreateVehicles` (hapus argumen `maxWheelbase`):
```typescript
const { vehicles: newVehicles, errors } = validateAndCreateVehicles(vehicleStarts, lines)
```

Update dependency array dari `[lines, maxWheelbase]` → `[lines]` (2 tempat).

- [ ] **Step 2: `useAnimation.ts`** — hapus `maxWheelbase` dari props interface, destructuring, `useMemo`, dan dependency array:

Cari pattern:
```typescript
maxWheelbase: number
// ...
maxWheelbase,
// ...
const config = useMemo(() => ({ maxWheelbase, tangentMode }), [maxWheelbase, tangentMode])
```

Ganti menjadi:
```typescript
const config = useMemo(() => ({ tangentMode }), [tangentMode])
```

- [ ] **Step 3: `useVehicleSimulation.ts`** — hapus `maxWheelbase` dari props dan semua 4 penggunaannya (termasuk 2 call ke `validateAndCreateVehicles`).

- [ ] **Step 4: `useInitialMovement.ts`** — hapus `maxWheelbase` dari `UseInitialMovementProps` dan terusan ke `useVehicles`.

---

### Task A7 — Update tests

**Files:**
- Modify: `src/core/__tests__/engine.test.ts`
- Modify: `src/core/algorithms/acceleration.test.ts`
- Modify: `src/core/algorithms/__tests__/pathFinding.test.ts`
- Modify: `src/core/algorithms/__tests__/vehicleMovement.test.ts`
- Modify: `src/react/hooks/__tests__/useVehicles.test.ts`
- Modify: `src/react/hooks/__tests__/useAnimation.test.ts`
- Modify: `src/react/hooks/__tests__/useVehicleSimulation.test.ts`
- Modify: `src/react/dsl-hooks/__tests__/useInitialMovement.test.ts`

- [ ] **Step 1: Hapus `maxWheelbase` dari semua `new PathEngine({ maxWheelbase: ..., tangentMode: ... })`**

Pattern umum yang perlu diubah:
```typescript
// SEBELUM:
new PathEngine({ maxWheelbase: 200, tangentMode: 'proportional-40' })
// SESUDAH:
new PathEngine({ tangentMode: 'proportional-40' })
```

- [ ] **Step 2: Update call ke `createBezierCurve` di test (jika ada `willFlip` argument)**

Hapus `false` / `true` argumen ke-4 di semua call ke `createBezierCurve`.

- [ ] **Step 3: Update call ke `validateAndCreateVehicles` di test (jika ada `maxWheelbase` argument)**

Hapus argumen `maxWheelbase` dari call.

- [ ] **Step 4: Jalankan semua test**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
npm test
```

Expected: semua test PASS.

---

### Task A8 — Bump versi dan commit library

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump versi ke 4.0.0** (breaking change: public API dihapus)

```json
"version": "4.0.0"
```

- [ ] **Step 2: Build library**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
npm run build
```

Expected: build sukses tanpa error.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Mirza/workspace/vehicle-path
git add -A
git commit -m "feat!: remove maxWheelbase and willFlip (dead code cleanup)

BREAKING CHANGE:
- Remove maxWheelbase from MovementConfig, PathEngineConfig
- Remove willFlip parameter from createBezierCurve
- Remove _maxWheelbase from resolveFromLineOffset/resolveToLineOffset
- validateAndCreateVehicles no longer accepts maxWheelbase
- React hooks (useVehicles, useAnimation, useVehicleSimulation,
  useInitialMovement) no longer accept maxWheelbase prop

Both parameters were effectively dead code: maxWheelbase was passed
to internal functions but never used in calculations; willFlip was
hardcoded to false at all call sites.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

> **STOP:** Setelah commit ini, user menjalankan `npm publish`. Lanjut ke Part B setelah publish selesai.

---

## Part B — Demo: `C:\Users\Mirza\workspace\vehicle-path-demo`

> **Prasyarat:** Library sudah di-publish ke npm sebagai v4.0.0

---

### Task B1 — Update dependency

- [ ] **Step 1: Install versi baru**

```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npm install vehicle-path2@4.0.0
```

---

### Task B2 — Hapus `maxWheelbase` dari `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Hapus state `maxWheelbase`**

Hapus baris:
```typescript
const [maxWheelbase, setMaxWheelbase] = useState(10)
```

- [ ] **Step 2: Hapus prop `maxWheelbase` dari `buildGraph`**

```typescript
// SEBELUM:
{ maxWheelbase, tangentMode }
// SESUDAH:
{ tangentMode }
```

(Ada di `useMemo` dan `handleLineUpdate` → `createBezierCurve`)

- [ ] **Step 3: Update `createBezierCurve` calls (hapus `maxWheelbase` dari config)**

Semua call ke `createBezierCurve` di App.tsx menggunakan `{ maxWheelbase, tangentMode }` → ganti ke `{ tangentMode }`.

- [ ] **Step 4: Update `new PathEngine({ maxWheelbase, tangentMode })`**

```typescript
// SEBELUM:
const engine = new PathEngine({ maxWheelbase, tangentMode })
// SESUDAH:
const engine = new PathEngine({ tangentMode })
```

- [ ] **Step 5: Hapus prop `maxWheelbase` dari `<Panel>` dan `onMaxWheelbaseChange`**

Hapus dari JSX:
```tsx
maxWheelbase={maxWheelbase}
onMaxWheelbaseChange={setMaxWheelbase}
```

---

### Task B3 — Hapus slider `Max Wheelbase` dari `Panel.tsx`

**Files:**
- Modify: `src/components/Panel.tsx`

- [ ] **Step 1: Hapus dari interface `Props`**

```typescript
// Hapus:
maxWheelbase: number
onMaxWheelbaseChange: (v: number) => void
```

- [ ] **Step 2: Hapus dari destructuring**

```typescript
// Hapus:
maxWheelbase,
onMaxWheelbaseChange,
```

- [ ] **Step 3: Hapus blok slider Max Wheelbase dari JSX**

Hapus seluruh `<div style={{ marginBottom: 16 }}>` yang berisi label "Max Wheelbase" dan `<input type="range" ... value={maxWheelbase} ...>`.

---

### Task B4 — Update `Canvas.tsx`

**Files:**
- Modify: `src/components/Canvas.tsx`

- [ ] **Step 1: Hapus prop `maxWheelbase` dari interface dan destructuring**

Hapus `maxWheelbase: number` dari interface `Props` dan dari destructuring function `Canvas`.

- [ ] **Step 2: Hapus `maxWheelbaseRef`**

Hapus:
```typescript
const maxWheelbaseRef = useRef(maxWheelbase); maxWheelbaseRef.current = maxWheelbase
```

- [ ] **Step 3: Update semua penggunaan `maxWheelbaseRef.current`**

Ada 3 tempat di Canvas yang menggunakan `wb = maxWheelbaseRef.current` dan meneruskannya ke `createBezierCurve` sebagai `{ maxWheelbase: wb, tangentMode: tm }`. Ganti ke `{ tangentMode: tm }`.

---

### Task B5 — Verifikasi & commit demo

- [ ] **Step 1: Build check**

```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npm run build
```

Expected: `✓ built in ...ms` tanpa TypeScript error.

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
git add src/App.tsx src/components/Panel.tsx src/components/Canvas.tsx package.json package-lock.json
git commit -m "chore: upgrade to vehicle-path2 v4.0.0, remove maxWheelbase

Remove maxWheelbase state, slider, and all references following the
breaking API change in vehicle-path2 v4.0.0.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
