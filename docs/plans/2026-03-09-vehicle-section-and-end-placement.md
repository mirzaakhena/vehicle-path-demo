# Vehicle Section & End Placement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restrukturisasi Panel menjadi 2 section (Line & Curve / Vehicle), tambah vehicle selection, vehicle end placement dengan path validation, dan drag vehicle body + drag end marker.

**Architecture:**
Semua perubahan ada di layer demo saja — tidak ada perubahan library. Tambahkan state `selectedVehicleId` dan `vehicleEndPoints` di App.tsx, teruskan ke Canvas dan Panel melalui props. Vehicle end menggunakan `findPath` dari library (sudah diekspor) untuk validasi real-time saat hover. Drag vehicle dan drag end marker ditambahkan sebagai DragHover/ActiveDrag baru di Canvas.

**Out of scope:** Animasi / tombol Play (dikerjakan di fase berikutnya).

**Tech Stack:** TypeScript, React 19, Vite, vehicle-path2 v2.2.0

---

## Task 1: Types & State — Foundation

**Files:**
- Modify: `src/types.ts`
- Modify: `src/App.tsx`

**Konteks:**
Perlu tambah mode baru (`'vehicle-end'`), interface `VehicleEndPoint`, dan dua state baru di App: `selectedVehicleId` + `vehicleEndPoints`.

**Step 1: Update `src/types.ts`**

```typescript
import type { BezierCurve, TangentMode, Point } from 'vehicle-path2/core'

export type Mode = 'drag' | 'line' | 'curve' | 'vehicle-start' | 'vehicle-end'

export interface StoredCurve {
  id: string
  fromLineId: string
  toLineId: string
  fromOffset: number
  toOffset: number
  bezier: BezierCurve
}

export interface PlacedVehicle {
  id: string
  axles: Array<{ lineId: string; offset: number; position: Point }>
  axleSpacings: number[]
}

/**
 * Posisi end (target goto) untuk satu vehicle.
 * position = pre-computed Point untuk rendering.
 */
export interface VehicleEndPoint {
  lineId: string
  offset: number
  position: Point
}

export type { TangentMode }
```

**Step 2: Update `src/App.tsx` — tambah state & handler**

Tambah dua state baru setelah `const [tangentMode, ...]`:
```typescript
const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
const [vehicleEndPoints, setVehicleEndPoints] = useState<Record<string, VehicleEndPoint>>({})
```

Tambah import `VehicleEndPoint` dan `getPositionFromOffset`:
```typescript
import type { Mode, StoredCurve, TangentMode, PlacedVehicle, VehicleEndPoint } from './types'
import { buildGraph, createBezierCurve, serializeScene, getPositionFromOffset, findPath } from 'vehicle-path2/core'
```

Tambah handler baru setelah `handleCurveUpdate`:
```typescript
function handleVehicleSelect(id: string | null) {
  setSelectedVehicleId(id)
}

function handleVehicleEndSet(vehicleId: string, lineId: string, offset: number) {
  const line = lines.find(l => l.id === lineId)
  if (!line) return
  const position = getPositionFromOffset(line, offset)
  setVehicleEndPoints(prev => ({ ...prev, [vehicleId]: { lineId, offset, position } }))
}

function handleVehicleEndDelete(vehicleId: string) {
  setVehicleEndPoints(prev => {
    const next = { ...prev }
    delete next[vehicleId]
    return next
  })
}
```

Update `handleLineUpdate` — tambah cascade update untuk vehicleEndPoints saat line berubah:
```typescript
// setelah updatedVehicles, sebelum setLines:
const updatedEndPoints: Record<string, VehicleEndPoint> = {}
for (const [vId, ep] of Object.entries(vehicleEndPoints)) {
  if (ep.lineId === updatedLine.id) {
    updatedEndPoints[vId] = { ...ep, position: getPositionFromOffset(updatedLine, ep.offset) }
  } else {
    updatedEndPoints[vId] = ep
  }
}
```
Dan panggil `setVehicleEndPoints(updatedEndPoints)` bersamaan dengan setLines/setCurves/setVehicles.

**Step 3: Update JSX di App.tsx — teruskan props baru ke Canvas dan Panel**

Canvas perlu tambahan props:
```tsx
<Canvas
  ...props existing...
  graph={graph}
  selectedVehicleId={selectedVehicleId}
  vehicleEndPoints={vehicleEndPoints}
  onVehicleSelect={handleVehicleSelect}
  onVehicleUpdate={vehicle => setVehicles(prev => prev.map(v => v.id === vehicle.id ? vehicle : v))}
  onVehicleEndSet={handleVehicleEndSet}
/>
```

Panel perlu tambahan props:
```tsx
<Panel
  ...props existing...
  vehicles={vehicles}
  selectedVehicleId={selectedVehicleId}
  vehicleEndPoints={vehicleEndPoints}
  onVehicleSelect={handleVehicleSelect}
  onVehicleEndDelete={handleVehicleEndDelete}
/>
```

**Step 4: Verifikasi TypeScript**
```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npx tsc --noEmit
```
Expected: error karena Canvas dan Panel belum update props — ini normal, akan selesai di task berikutnya.

**Step 5: Commit**
```bash
git add src/types.ts src/App.tsx
git commit -m "feat: add vehicle selection state and vehicleEndPoints to App"
```

---

## Task 2: Panel — Restrukturisasi 2 Section

**Files:**
- Modify: `src/components/Panel.tsx`

**Konteks:**
Panel sekarang punya section: Tool (drag/line/curve/vehicle), Wheelbase, Tangent Mode, Scene, Vehicles (hanya count).
Goal: restrukturisasi menjadi:
- **Section "Line & Curve"**: mode drag/line/curve + tangent mode
- **Section "Vehicle"**: mode vehicle-start/vehicle-end + wheelbase slider + vehicle list (selectable)

**Step 1: Update Props interface Panel**

```typescript
import type { Mode, TangentMode, PlacedVehicle, VehicleEndPoint } from '../types'

interface Props {
  mode: Mode
  maxWheelbase: number
  tangentMode: TangentMode
  lineCount: number
  curveCount: number
  vehicles: PlacedVehicle[]
  vehicleEndPoints: Record<string, VehicleEndPoint>
  selectedVehicleId: string | null
  graphNodeCount: number
  onModeChange: (m: Mode) => void
  onMaxWheelbaseChange: (v: number) => void
  onTangentModeChange: (t: TangentMode) => void
  onVehicleSelect: (id: string | null) => void
  onVehicleEndDelete: (vehicleId: string) => void
  onCopySnapshot: () => void
}
```

**Step 2: Ganti isi scrollable body Panel dengan 2 section**

Hapus section Tool, Wheelbase, Vehicles lama. Susun ulang:

```tsx
{/* ── Section 1: Line & Curve ── */}
<section>
  <SectionLabel>Line & Curve</SectionLabel>
  {/* Mode buttons: drag / line / curve */}
  <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
    {([
      { id: 'drag',  symbol: '↖', label: 'Drag'  },
      { id: 'line',  symbol: '/', label: 'Line'  },
      { id: 'curve', symbol: '~', label: 'Curve' },
    ] as { id: Mode; symbol: string; label: string }[]).map(({ id, symbol, label }) => {
      const active = mode === id
      return (
        <button key={id} onClick={() => onModeChange(id)} style={modeButtonStyle(active, '#4ade80')}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>{symbol}</span>
          <span>{label}</span>
        </button>
      )
    })}
  </div>

  {/* Tangent Mode */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    {(['proportional-40', 'magic-55'] as TangentMode[]).map(tm => {
      const active = tangentMode === tm
      return (
        <button key={tm} onClick={() => onTangentModeChange(tm)} style={tangentButtonStyle(active)}>
          <span>{tm}</span>
          {active && <span style={{ fontSize: 9, opacity: 0.7, letterSpacing: 1 }}>ACTIVE</span>}
        </button>
      )
    })}
  </div>
</section>

{/* ── Section 2: Vehicle ── */}
<section>
  <SectionLabel>Vehicle</SectionLabel>

  {/* Mode buttons: vehicle-start / vehicle-end */}
  <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
    {([
      { id: 'vehicle-start', symbol: '◉', label: 'Start' },
      { id: 'vehicle-end',   symbol: '◎', label: 'End'   },
    ] as { id: Mode; symbol: string; label: string }[]).map(({ id, symbol, label }) => {
      const active = mode === id
      return (
        <button key={id} onClick={() => onModeChange(id)} style={{ ...modeButtonStyle(active, '#fb923c'), flex: 1 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>{symbol}</span>
          <span>{label}</span>
        </button>
      )
    })}
  </div>

  {/* Wheelbase slider */}
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
      <span style={labelStyle}>Max Wheelbase</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: '#4ade80', letterSpacing: 1 }}>
        {maxWheelbase}<span style={{ fontSize: 11, color: '#4a5878', marginLeft: 3 }}>px</span>
      </span>
    </div>
    <input type="range" min={5} max={200} step={1} value={maxWheelbase}
      onChange={e => onMaxWheelbaseChange(Number(e.target.value))} />
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
      <Muted>5px</Muted><Muted>200px</Muted>
    </div>
  </div>

  {/* Vehicle list */}
  <VehicleList
    vehicles={vehicles}
    vehicleEndPoints={vehicleEndPoints}
    selectedVehicleId={selectedVehicleId}
    onSelect={onVehicleSelect}
    onDeleteEnd={onVehicleEndDelete}
  />
</section>
```

**Step 3: Tambah helper functions dan VehicleList sub-component**

```typescript
function modeButtonStyle(active: boolean, activeColor: string): CSSProperties {
  return {
    flex: 1,
    padding: '10px 4px',
    border: `1px solid ${active ? activeColor : '#1c2030'}`,
    background: active ? `${activeColor}15` : 'transparent',
    color: active ? activeColor : '#5a6e88',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.12s ease',
    outline: 'none',
  }
}

function tangentButtonStyle(active: boolean): CSSProperties {
  return {
    padding: '9px 12px',
    border: `1px solid ${active ? '#818cf8' : '#1c2030'}`,
    background: active ? '#818cf812' : 'transparent',
    color: active ? '#a5b4fc' : '#5a6e88',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.12s ease',
    outline: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }
}
```

```tsx
function VehicleList({
  vehicles,
  vehicleEndPoints,
  selectedVehicleId,
  onSelect,
  onDeleteEnd,
}: {
  vehicles: PlacedVehicle[]
  vehicleEndPoints: Record<string, VehicleEndPoint>
  selectedVehicleId: string | null
  onSelect: (id: string | null) => void
  onDeleteEnd: (id: string) => void
}) {
  if (vehicles.length === 0) {
    return <Muted>No vehicles placed</Muted>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {vehicles.map((v, i) => {
        const selected = selectedVehicleId === v.id
        const endPoint = vehicleEndPoints[v.id]
        return (
          <div
            key={v.id}
            onClick={() => onSelect(selected ? null : v.id)}
            style={{
              padding: '8px 10px',
              border: `1px solid ${selected ? '#fb923c' : '#1c2030'}`,
              background: selected ? '#fb923c10' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: selected ? '#fb923c' : '#8899aa', letterSpacing: 1 }}>
                V{i + 1}
              </span>
              {selected && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#fb923c', opacity: 0.7, letterSpacing: 1 }}>
                  SELECTED
                </span>
              )}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4a5878' }}>
              front: {v.axles[0].lineId.slice(-4)} @{Math.round(v.axles[0].offset)}
            </div>
            {endPoint ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4ade80' }}>
                  end: {endPoint.lineId.slice(-4)} @{Math.round(endPoint.offset)}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); onDeleteEnd(v.id) }}
                  style={{
                    background: 'none', border: 'none', color: '#4a5878',
                    cursor: 'pointer', fontSize: 11, padding: '0 2px',
                  }}
                  title="Remove end point"
                >×</button>
              </div>
            ) : (
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#3a4a5e' }}>
                no end set
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

**Step 4: Update Guide text untuk mode baru**

Ganti section Guide di Panel:
```tsx
{mode === 'vehicle-start' && (
  <>
    <GuideRow>Hover a line to preview</GuideRow>
    <GuideRow>Click to place vehicle</GuideRow>
  </>
)}
{mode === 'vehicle-end' && (
  <>
    <GuideRow>Select a vehicle first</GuideRow>
    <GuideRow>Hover a line to preview end</GuideRow>
    <GuideRow>Green = path valid</GuideRow>
    <GuideRow>Red = no path found</GuideRow>
    <GuideRow>Click to set end point</GuideRow>
  </>
)}
```

**Step 5: Verifikasi TypeScript**
```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npx tsc --noEmit
```
Expected: masih error di Canvas (props belum diupdate) — normal.

**Step 6: Commit**
```bash
git add src/components/Panel.tsx
git commit -m "feat: restructure Panel into Line&Curve and Vehicle sections"
```

---

## Task 3: Canvas — Vehicle Selection & Highlight

**Files:**
- Modify: `src/components/Canvas.tsx`

**Konteks:**
Tambah props baru ke Canvas, fungsi hit-detection untuk vehicle body/axle, dan visual highlight untuk selected vehicle. Juga rename mode `'vehicle'` → `'vehicle-start'` di semua referensi Canvas.

**Step 1: Update Canvas Props interface**

```typescript
import type { Graph } from 'vehicle-path2/core'
import type { Mode, StoredCurve, PlacedVehicle, VehicleEndPoint } from '../types'

interface Props {
  lines: Line[]
  curves: StoredCurve[]
  vehicles: PlacedVehicle[]
  mode: Mode
  maxWheelbase: number
  tangentMode: TangentMode
  graph: Graph                                              // NEW
  selectedVehicleId: string | null                          // NEW
  vehicleEndPoints: Record<string, VehicleEndPoint>         // NEW
  onLineAdd: (line: Line) => void
  onCurveAdd: (curve: StoredCurve) => void
  onLineUpdate: (line: Line) => void
  onCurveUpdate: (curve: StoredCurve) => void
  onVehicleAdd: (vehicle: PlacedVehicle) => void
  onVehicleUpdate: (vehicle: PlacedVehicle) => void         // NEW
  onVehicleSelect: (id: string | null) => void              // NEW
  onVehicleEndSet: (vehicleId: string, lineId: string, offset: number) => void  // NEW
}
```

**Step 2: Destructure props baru**

Tambahkan ke destructuring:
```typescript
graph,
selectedVehicleId,
vehicleEndPoints,
onVehicleUpdate,
onVehicleSelect,
onVehicleEndSet,
```

**Step 3: Rename semua referensi `mode === 'vehicle'` → `mode === 'vehicle-start'`**

Ada 3 tempat di Canvas:
- `handleMouseDown`: blok `if (mode === 'vehicle' && vehicleHover)`
- `handleMouseMove`: blok `if (mode === 'vehicle')`
- Cursor logic: `else if (mode === 'vehicle')`

Ganti semua `'vehicle'` → `'vehicle-start'`.

**Step 4: Tambah fungsi `findVehicleHit`**

Tambah setelah fungsi `findDragHoverTarget`:
```typescript
function findVehicleHit(point: Point): PlacedVehicle | null {
  const HIT_R = 12 // px dari axle center atau body segment
  for (const v of vehiclesRef.current) {
    // Check axle circles
    for (const axle of v.axles) {
      if (libDistance(point, axle.position) <= HIT_R) return v
    }
    // Check body segments
    for (let i = 0; i < v.axles.length - 1; i++) {
      const a = v.axles[i], b = v.axles[i + 1]
      const { distance: d } = projectPointOnLine(point, { id: '', start: a.position, end: b.position })
      if (d <= HIT_R) return v
    }
  }
  return null
}
```

**Step 5: Tambah vehicle selection di `handleMouseDown`**

Di blok `if (mode === 'drag')`, sebelum `setActiveDrag`:
```typescript
// ── Vehicle click selection (drag mode) ──
if (!dragHover) {
  const hitVehicle = findVehicleHit(mouse)
  if (hitVehicle) {
    onVehicleSelect(selectedVehicleId === hitVehicle.id ? null : hitVehicle.id)
    return
  }
  // Klik kosong → deselect
  if (selectedVehicleId) {
    onVehicleSelect(null)
  }
}
```

**Step 6: Render — tambah selected vehicle highlight**

Di SVG render, dalam blok `{vehicles.map(v => (` — setelah body segments, sebelum axles, tambah selection ring:
```tsx
{v.id === selectedVehicleId && v.axles.map((axle, i) => (
  <circle key={`sel-${i}`}
    cx={axle.position.x} cy={axle.position.y} r={9}
    fill="none" stroke="#fb923c" strokeWidth={1.5} strokeOpacity={0.6}
  />
))}
```

**Step 7: Verifikasi TypeScript**
```bash
npx tsc --noEmit
```
Expected: EXIT 0.

**Step 8: Commit**
```bash
git add src/components/Canvas.tsx
git commit -m "feat: add vehicle selection with highlight in Canvas"
```

---

## Task 4: Canvas — Vehicle End Mode

**Files:**
- Modify: `src/components/Canvas.tsx`

**Konteks:**
Mode `'vehicle-end'`: hover pada line menampilkan preview end marker. Validasi dengan `findPath` dari library:
- Path valid → marker hijau
- Tidak ada path → marker merah + error text
Klik → set end point. Render end markers untuk semua vehicles yang punya end point.

**Step 1: Tambah import `findPath` dari library**

Di bagian import:
```typescript
import { createBezierCurve, getLineLength, distance as libDistance, calculateInitialAxlePositions, findPath } from 'vehicle-path2/core'
```

**Step 2: Tambah `graphRef` untuk akses di event handlers**

Di bagian refs (setelah `maxWheelbaseRef`):
```typescript
const graphRef = useRef(graph); graphRef.current = graph
```

**Step 3: Tambah state `vehicleEndHover`**

```typescript
interface VehicleEndHover {
  lineId: string
  offset: number
  position: Point
  isValid: boolean
}
const [vehicleEndHover, setVehicleEndHover] = useState<VehicleEndHover | null>(null)
```

**Step 4: Handle `vehicle-end` di `handleMouseMove`**

Tambah blok di `handleMouseMove`, setelah blok `vehicle-start`:
```typescript
// ── Vehicle End mode ──
if (mode === 'vehicle-end') {
  const selId = selectedVehicleIdRef.current  // perlu tambah ref
  if (!selId) {
    setVehicleEndHover(null)
    return
  }
  const vehicle = vehiclesRef.current.find(v => v.id === selId)
  if (!vehicle) { setVehicleEndHover(null); return }

  const hit = findLineHit(mouse)
  if (hit) {
    const rearmost = vehicle.axles[vehicle.axles.length - 1]
    const path = findPath(
      graphRef.current,
      { lineId: rearmost.lineId, offset: rearmost.offset },
      hit.line.id,
      hit.offset
    )
    setVehicleEndHover({
      lineId: hit.line.id,
      offset: hit.offset,
      position: hit.point,
      isValid: path !== null,
    })
  } else {
    setVehicleEndHover(null)
  }
  return
}
```

Tambah `selectedVehicleIdRef` di bagian refs:
```typescript
const selectedVehicleIdRef = useRef(selectedVehicleId); selectedVehicleIdRef.current = selectedVehicleId
```

**Step 5: Handle `vehicle-end` di `handleMouseDown`**

Tambah blok setelah blok `vehicle-start` di `handleMouseDown`:
```typescript
// ── Vehicle End mode ──
if (mode === 'vehicle-end') {
  const selId = selectedVehicleId
  if (!selId || !vehicleEndHover?.isValid) return
  onVehicleEndSet(selId, vehicleEndHover.lineId, vehicleEndHover.offset)
}
```

**Step 6: Clear vehicleEndHover di `handleMouseLeave`**

```typescript
function handleMouseLeave() {
  setVehicleHover(null)
  setVehicleEndHover(null)   // tambah ini
  setCurveHover(null)
  setCurveDrag(null)
}
```

**Step 7: Update cursor logic untuk `vehicle-end`**

```typescript
} else if (mode === 'vehicle-end') {
  cursor = vehicleEndHover?.isValid ? 'crosshair' : 'not-allowed'
}
```

**Step 8: Render — end marker hover preview**

Di SVG render, setelah blok vehicle hover preview:
```tsx
{/* ── Vehicle End hover preview ── */}
{vehicleEndHover && (
  <g>
    <circle
      cx={vehicleEndHover.position.x} cy={vehicleEndHover.position.y}
      r={7} fill="none"
      stroke={vehicleEndHover.isValid ? '#4ade80' : '#f87171'}
      strokeWidth={2}
      strokeOpacity={0.8}
    />
    <circle
      cx={vehicleEndHover.position.x} cy={vehicleEndHover.position.y}
      r={3}
      fill={vehicleEndHover.isValid ? '#4ade80' : '#f87171'}
      fillOpacity={0.8}
    />
    {!vehicleEndHover.isValid && (
      <text
        x={vehicleEndHover.position.x + 12}
        y={vehicleEndHover.position.y + 4}
        fill="#f87171"
        fontSize={11}
        fontFamily="'JetBrains Mono', monospace"
        opacity={0.9}
      >
        no path
      </text>
    )}
  </g>
)}
```

**Step 9: Render — placed end markers**

Di SVG render, setelah blok placed vehicles, tambah:
```tsx
{/* ── Vehicle end markers ── */}
{Object.entries(vehicleEndPoints).map(([vId, ep]) => (
  <g key={`end-${vId}`}>
    <circle cx={ep.position.x} cy={ep.position.y} r={7}
      fill="none" stroke="#4ade80" strokeWidth={2} strokeOpacity={0.9} />
    <circle cx={ep.position.x} cy={ep.position.y} r={3}
      fill="#4ade80" fillOpacity={0.9} />
  </g>
))}
```

**Step 10: Verifikasi TypeScript**
```bash
npx tsc --noEmit
```
Expected: EXIT 0.

**Step 11: Commit**
```bash
git add src/components/Canvas.tsx
git commit -m "feat: add vehicle-end mode with path validation preview and end markers"
```

---

## Task 5: Canvas — Drag Vehicle Body (Start Position)

**Files:**
- Modify: `src/components/Canvas.tsx`

**Konteks:**
Dalam drag mode, hover pada body vehicle menampilkan grab cursor. Drag menggeser seluruh vehicle di sepanjang line (constrained ke line yang sama dengan rear axle). Semua axle di-recalculate menggunakan `calculateInitialAxlePositions`.

**Step 1: Tambah tipe DragHover dan ActiveDrag baru**

```typescript
type DragHover =
  | { type: 'line-start'; lineId: string }
  | { type: 'line-end';   lineId: string }
  | { type: 'line-body';  lineId: string }
  | { type: 'curve-from'; curveId: string }
  | { type: 'curve-to';   curveId: string }
  | { type: 'vehicle-body'; vehicleId: string }    // NEW

type ActiveDrag =
  | { type: 'line-start'; lineId: string; minLength: number }
  | { type: 'line-end';   lineId: string; minLength: number }
  | { type: 'line-body';  lineId: string; startMouse: Point; originalStart: Point; originalEnd: Point }
  | { type: 'curve-from'; curveId: string; fromLineId: string; toLineId: string }
  | { type: 'curve-to';   curveId: string; fromLineId: string; toLineId: string }
  | { type: 'vehicle-body'; vehicleId: string; lineId: string }  // NEW
```

**Step 2: Tambah vehicle body hover detection di `handleMouseMove` (drag mode)**

Di blok `if (mode === 'drag')`, dalam `else` (ketika tidak ada activeDrag) — tambah setelah `setDragHover(findDragHoverTarget(mouse))`:
```typescript
} else {
  const dragHoverTarget = findDragHoverTarget(mouse)
  if (dragHoverTarget) {
    setDragHover(dragHoverTarget)
  } else {
    // Cek vehicle body
    const hitVehicle = findVehicleHit(mouse)
    setDragHover(hitVehicle ? { type: 'vehicle-body', vehicleId: hitVehicle.id } : null)
  }
  return
}
```

**Step 3: Handle `vehicle-body` di `handleMouseDown` (drag mode)**

Di blok `if (mode === 'drag')`, setelah semua blok dragHover lainnya:
```typescript
} else if (dragHover?.type === 'vehicle-body') {
  const vehicle = vehiclesRef.current.find(v => v.id === dragHover.vehicleId)
  if (vehicle) {
    const rearmost = vehicle.axles[vehicle.axles.length - 1]
    setActiveDrag({ type: 'vehicle-body', vehicleId: vehicle.id, lineId: rearmost.lineId })
    onVehicleSelect(vehicle.id)
  }
}
```

**Step 4: Handle `vehicle-body` di `handleMouseMove` (activeDrag)**

Di blok `if (activeDrag)` dalam drag mode, tambah setelah blok `curve-to`:
```typescript
} else if (activeDrag.type === 'vehicle-body') {
  const vehicle = vehiclesRef.current.find(v => v.id === activeDrag.vehicleId)
  const line = linesRef.current.find(l => l.id === activeDrag.lineId)
  if (!vehicle || !line) return

  const { offset } = projectPointOnLine(mouse, line)
  const lineLen = getLineLength(line)
  const totalSpacing = vehicle.axleSpacings.reduce((a, b) => a + b, 0)
  // Rear axle (axles[N-1]) bisa di mana saja [0, lineLen]
  // Front axle = rear + totalSpacing, jadi rear max = lineLen - totalSpacing
  const rearOffset = Math.max(0, Math.min(offset, lineLen - totalSpacing))

  const axleStates = calculateInitialAxlePositions(line.id, rearOffset, vehicle.axleSpacings, line)
  const updatedVehicle: PlacedVehicle = {
    ...vehicle,
    axles: axleStates.map(a => ({ lineId: line.id, offset: a.absoluteOffset, position: a.position })),
  }
  onVehicleUpdate(updatedVehicle)
}
```

**Step 5: Update cursor logic untuk vehicle-body drag**

```typescript
if (mode === 'drag') {
  if (activeDrag) cursor = 'grabbing'
  else if (dragHover?.type === 'vehicle-body') cursor = 'grab'
  else if (dragHover) cursor = 'grab'
}
```

**Step 6: Verifikasi TypeScript**
```bash
npx tsc --noEmit
```
Expected: EXIT 0.

**Step 7: Commit**
```bash
git add src/components/Canvas.tsx
git commit -m "feat: add drag vehicle body along line in drag mode"
```

---

## Task 6: Canvas — Drag Vehicle End Marker

**Files:**
- Modify: `src/components/Canvas.tsx`

**Konteks:**
Dalam drag mode, hover pada end marker (circle r=7) menampilkan grab cursor. Drag memindahkan end marker ke posisi baru pada line mana saja. Real-time validation (`findPath`) — warna marker berubah hijau/merah saat drag. Mouse up → finalize (hanya jika valid) atau revert.

**Step 1: Tambah tipe DragHover dan ActiveDrag untuk vehicle-end**

```typescript
type DragHover =
  | ...existing...
  | { type: 'vehicle-end'; vehicleId: string }     // NEW

type ActiveDrag =
  | ...existing...
  | { type: 'vehicle-end'; vehicleId: string }     // NEW
```

**Step 2: Tambah fungsi `findVehicleEndHit`**

```typescript
function findVehicleEndHit(point: Point): string | null {
  const HIT_R = 12
  for (const [vId, ep] of Object.entries(vehicleEndPointsRef.current)) {
    if (libDistance(point, ep.position) <= HIT_R) return vId
  }
  return null
}
```

Tambah `vehicleEndPointsRef`:
```typescript
const vehicleEndPointsRef = useRef(vehicleEndPoints); vehicleEndPointsRef.current = vehicleEndPoints
```

**Step 3: Integrate `findVehicleEndHit` di `findDragHoverTarget` atau hover detection**

Di blok `else` (no activeDrag) dalam `handleMouseMove` drag mode, tambah sebelum vehicle body check:
```typescript
const hitEndVehicleId = findVehicleEndHit(mouse)
if (hitEndVehicleId) {
  setDragHover({ type: 'vehicle-end', vehicleId: hitEndVehicleId })
  return
}
```

**Step 4: Handle `vehicle-end` di `handleMouseDown` (drag mode)**

```typescript
} else if (dragHover?.type === 'vehicle-end') {
  setActiveDrag({ type: 'vehicle-end', vehicleId: dragHover.vehicleId })
}
```

**Step 5: Handle `vehicle-end` di `handleMouseMove` (activeDrag)**

```typescript
} else if (activeDrag.type === 'vehicle-end') {
  const vehicle = vehiclesRef.current.find(v => v.id === activeDrag.vehicleId)
  if (!vehicle) return
  const hit = findLineHit(mouse)
  if (hit) {
    const rearmost = vehicle.axles[vehicle.axles.length - 1]
    const path = findPath(
      graphRef.current,
      { lineId: rearmost.lineId, offset: rearmost.offset },
      hit.line.id,
      hit.offset
    )
    setVehicleEndHover({
      lineId: hit.line.id,
      offset: hit.offset,
      position: hit.point,
      isValid: path !== null,
    })
  } else {
    setVehicleEndHover(null)
  }
}
```

**Step 6: Handle `vehicle-end` di `handleMouseUp`**

Di `handleMouseUp`, setelah logic activeDrag lainnya:
```typescript
if (activeDrag?.type === 'vehicle-end') {
  if (vehicleEndHover?.isValid) {
    onVehicleEndSet(activeDrag.vehicleId, vehicleEndHover.lineId, vehicleEndHover.offset)
  }
  setVehicleEndHover(null)
  setActiveDrag(null)
  return
}
```

**Step 7: Update cursor untuk vehicle-end drag**

```typescript
else if (dragHover?.type === 'vehicle-end') cursor = 'grab'
```

**Step 8: Verifikasi TypeScript**
```bash
npx tsc --noEmit
```
Expected: EXIT 0.

**Step 9: Full smoke test manual**
Buka dev server:
```bash
npm run dev
```
Checklist:
- [ ] Panel menampilkan 2 section: "Line & Curve" dan "Vehicle"
- [ ] Mode drag/line/curve di section pertama bekerja normal
- [ ] Mode vehicle-start menempatkan vehicle (rename dari vehicle)
- [ ] Klik vehicle di canvas → selected (highlight orange)
- [ ] Klik vehicle di sidebar list → selected
- [ ] Mode vehicle-end + vehicle selected → hover line menampilkan preview
- [ ] Preview hijau jika path valid, merah + "no path" jika tidak
- [ ] Klik saat preview hijau → end marker muncul di canvas
- [ ] End point muncul di vehicle list di sidebar
- [ ] Tombol × di sidebar menghapus end point
- [ ] Drag vehicle body di drag mode → vehicle bergerak di line
- [ ] Drag end marker di drag mode → marker ikut, validasi real-time
- [ ] Mouse up pada posisi valid → end point update

**Step 10: Commit**
```bash
git add src/components/Canvas.tsx
git commit -m "feat: add drag vehicle end marker with real-time path validation"
```

---

## Ringkasan Tasks

| Task | Target | Risiko | Perkiraan |
|------|--------|--------|-----------|
| 1. Types & State | `types.ts`, `App.tsx` | Rendah | Foundation |
| 2. Panel restructure | `Panel.tsx` | Rendah | UI only |
| 3. Vehicle selection | `Canvas.tsx` | Rendah | Click + highlight |
| 4. Vehicle End mode | `Canvas.tsx` | Medium | New interaction |
| 5. Drag vehicle body | `Canvas.tsx` | Medium | Movement math |
| 6. Drag end marker | `Canvas.tsx` | Medium | Reuse pattern task 4-5 |
