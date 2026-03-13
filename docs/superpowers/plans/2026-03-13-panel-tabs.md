# Panel Tabs + Line/Curve List Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan tab system (PATH / VEHICLE) ke Panel, dan tampilkan list Lines + Curves yang bisa diedit (rename/koordinat/offset) dan dihapus.

**Architecture:** Tab state lokal di Panel. App.tsx mendapat handler baru. Panel menerima `lines[]` + `curves[]` + callback baru. Sub-komponen `LineList` dan `CurveList` di-inline di Panel.tsx sesuai pola existing (semua sub-components dalam satu file). Semua edit line dilakukan via satu atomic handler `handleLineEdit` di App.tsx (menghindari React batching stale-closure issue).

**Tech Stack:** React 19, TypeScript, inline styles (pola existing di Panel.tsx).

---

## File Structure

- **Modify:** `src/App.tsx` — tambah handlers, update `<Panel>` props
- **Modify:** `src/components/Panel.tsx` — tab bar, Props baru, `LineList`, `CurveList`, rearrange content

---

## Chunk 1: App.tsx Changes

### Task 1: Tambah handlers baru di App.tsx

**Files:**
- Modify: `src/App.tsx`

Baca `src/App.tsx` sebelum mulai. Tambahkan setelah `handleCurveUpdate` (sekitar baris 131):

- [ ] **Step 1: Tambah `handleLineEdit` di App.tsx**

`handleLineEdit` menggabungkan rename + update koordinat dalam satu fungsi imperatif (menghindari stale closure dari dua setState terpisah). Gunakan impor yang sudah ada: `createBezierCurve`, `getPositionFromOffset`, `calculateInitialAxlePositions`.

```typescript
function handleLineEdit(oldId: string, updatedLine: Line) {
  const isRename = oldId !== updatedLine.id

  // 1. Build updated lines (lookup by oldId)
  const updatedLines = lines.map(l => l.id === oldId ? updatedLine : l)

  // 2. Build updated curves: rename refs + recompute bezier for connected curves
  const updatedCurves = curves.map(curve => {
    const renamedCurve = isRename ? {
      ...curve,
      fromLineId: curve.fromLineId === oldId ? updatedLine.id : curve.fromLineId,
      toLineId:   curve.toLineId   === oldId ? updatedLine.id : curve.toLineId,
    } : curve

    const connected = renamedCurve.fromLineId === updatedLine.id || renamedCurve.toLineId === updatedLine.id
    if (!connected) return renamedCurve

    const fromLine = renamedCurve.fromLineId === updatedLine.id
      ? updatedLine
      : updatedLines.find(l => l.id === renamedCurve.fromLineId)
    const toLine = renamedCurve.toLineId === updatedLine.id
      ? updatedLine
      : updatedLines.find(l => l.id === renamedCurve.toLineId)
    if (!fromLine || !toLine) return renamedCurve
    try {
      const bezier = createBezierCurve(fromLine, toLine, { tangentMode }, {
        fromOffset: renamedCurve.fromOffset, fromIsPercentage: false,
        toOffset: renamedCurve.toOffset, toIsPercentage: false,
      })
      return { ...renamedCurve, bezier }
    } catch { return renamedCurve }
  })

  // 3. Build updated vehicles: rename lineId refs + recalculate positions
  const updatedVehicles = vehicles.map(v => ({
    ...v,
    axles: v.axles.map(a => {
      const targetLineId = isRename && a.lineId === oldId ? updatedLine.id : a.lineId
      if (targetLineId !== updatedLine.id) return { ...a, lineId: targetLineId }
      return { ...a, lineId: targetLineId, position: getPositionFromOffset(updatedLine, a.offset) }
    }),
  }))

  // 4. Build updated vehicleEndPoints: rename lineId + axle lineIds + recalculate
  const updatedEndPoints: Record<string, VehicleEndPoint> = {}
  for (const [vId, ep] of Object.entries(vehicleEndPoints)) {
    const epLineId = isRename && ep.lineId === oldId ? updatedLine.id : ep.lineId
    if (epLineId === updatedLine.id) {
      const vehicle = updatedVehicles.find(v => v.id === vId)
      if (!vehicle) { updatedEndPoints[vId] = { ...ep, lineId: epLineId }; continue }
      const axleStates = calculateInitialAxlePositions(epLineId, ep.offset, vehicle.axleSpacings, updatedLine)
      updatedEndPoints[vId] = {
        ...ep,
        lineId: epLineId,
        axles: axleStates.map(a => ({ offset: a.absoluteOffset, position: a.position })),
      }
    } else {
      updatedEndPoints[vId] = { ...ep, lineId: epLineId }
    }
  }

  setLines(updatedLines)
  setCurves(updatedCurves)
  setVehicles(updatedVehicles)
  setVehicleEndPoints(updatedEndPoints)
}
```

- [ ] **Step 2: Tambah `handleLineDelete` di App.tsx**

```typescript
function handleLineDelete(lineId: string) {
  setLines(prev => prev.filter(l => l.id !== lineId))
  setCurves(prev => prev.filter(c => c.fromLineId !== lineId && c.toLineId !== lineId))
  // Hapus vehicles yang salah satu axle-nya berada di line ini
  setVehicles(prev => prev.filter(v => !v.axles.some(a => a.lineId === lineId)))
  setVehicleEndPoints(prev => {
    const next = { ...prev }
    for (const [vId, ep] of Object.entries(next)) {
      if (ep.lineId === lineId) delete next[vId]
    }
    return next
  })
}
```

- [ ] **Step 3: Tambah `handleCurveOffsetChange` di App.tsx**

`createBezierCurve` sudah diimport di baris 3 App.tsx.

```typescript
function handleCurveOffsetChange(curveId: string, fromOffset: number, toOffset: number) {
  const curve = curves.find(c => c.id === curveId)
  if (!curve) return
  const fromLine = lines.find(l => l.id === curve.fromLineId)
  const toLine   = lines.find(l => l.id === curve.toLineId)
  if (!fromLine || !toLine) return
  try {
    const bezier = createBezierCurve(
      fromLine, toLine,
      { tangentMode },
      { fromOffset, fromIsPercentage: false, toOffset, toIsPercentage: false }
    )
    setCurves(prev => prev.map(c => c.id === curveId ? { ...c, fromOffset, toOffset, bezier } : c))
  } catch { /* degenerate geometry — skip */ }
}
```

- [ ] **Step 4: Tambah `handleCurveDelete` di App.tsx**

```typescript
function handleCurveDelete(curveId: string) {
  setCurves(prev => prev.filter(c => c.id !== curveId))
}
```

- [ ] **Step 5: Update `<Panel>` JSX props di App.tsx**

Hapus `lineCount={lines.length}` dan `curveCount={curves.length}`. Tambah props baru:

```tsx
<Panel
  mode={mode}
  tangentMode={tangentMode}
  lines={lines}
  curves={curves}
  vehicles={vehicles}
  vehicleEndPoints={vehicleEndPoints}
  selectedVehicleId={selectedVehicleId}
  graphNodeCount={graph.adjacency.size}
  onModeChange={setMode}
  onTangentModeChange={setTangentMode}
  animatingVehicleId={animatingVehicleId}
  vehicleOriginId={vehicleOriginId}
  vehicleSpeed={vehicleSpeed}
  onVehicleSelect={handleVehicleSelect}
  onVehicleEndDelete={handleVehicleEndDelete}
  onVehicleRemove={handleVehicleRemove}
  onVehiclePlay={handleVehiclePlay}
  onVehicleReset={handleVehicleReset}
  onVehicleSpeedChange={setVehicleSpeed}
  onCopySnapshot={handleCopySnapshot}
  axleCount={axleCount}
  axleSpacings={axleSpacings}
  onAxleCountChange={handleAxleCountChange}
  onAxleSpacingsChange={setAxleSpacings}
  onLineEdit={handleLineEdit}
  onLineDelete={handleLineDelete}
  onCurveOffsetChange={handleCurveOffsetChange}
  onCurveDelete={handleCurveDelete}
/>
```

---

## Chunk 2: Panel.tsx — Props + Tab Bar

### Task 2: Update Props interface dan import di Panel.tsx

**Files:**
- Modify: `src/components/Panel.tsx` (baris 1–56)

- [ ] **Step 1: Tambah import Line**

Di baris 1:
```typescript
import type { Line } from 'vehicle-path2/core'
```

- [ ] **Step 2: Ganti interface Props**

```typescript
interface Props {
  mode: Mode
  axleCount: number
  axleSpacings: number[]
  onAxleCountChange: (count: number) => void
  onAxleSpacingsChange: (spacings: number[]) => void
  tangentMode: TangentMode
  lines: Line[]
  curves: StoredCurve[]
  vehicles: PlacedVehicle[]
  vehicleEndPoints: Record<string, VehicleEndPoint>
  selectedVehicleId: string | null
  animatingVehicleId: string | null
  vehicleOriginId: string | null
  vehicleSpeed: number
  graphNodeCount: number
  onModeChange: (m: Mode) => void
  onTangentModeChange: (t: TangentMode) => void
  onVehicleSelect: (id: string | null) => void
  onVehicleEndDelete: (vehicleId: string) => void
  onVehicleRemove: (vehicleId: string) => void
  onVehiclePlay: (id: string) => void
  onVehicleReset: (id: string) => void
  onVehicleSpeedChange: (speed: number) => void
  onCopySnapshot: () => void
  onLineEdit: (oldId: string, updatedLine: Line) => void
  onLineDelete: (lineId: string) => void
  onCurveOffsetChange: (curveId: string, fromOffset: number, toOffset: number) => void
  onCurveDelete: (curveId: string) => void
}
```

- [ ] **Step 3: Update destructuring parameter**

```typescript
export function Panel({
  mode,
  axleCount,
  axleSpacings,
  onAxleCountChange,
  onAxleSpacingsChange,
  tangentMode,
  lines,
  curves,
  vehicles,
  vehicleEndPoints,
  selectedVehicleId,
  animatingVehicleId,
  vehicleOriginId,
  vehicleSpeed,
  graphNodeCount,
  onModeChange,
  onTangentModeChange,
  onVehicleSelect,
  onVehicleEndDelete,
  onVehicleRemove,
  onVehiclePlay,
  onVehicleReset,
  onVehicleSpeedChange,
  onCopySnapshot,
  onLineEdit,
  onLineDelete,
  onCurveOffsetChange,
  onCurveDelete,
}: Props) {
```

### Task 3: Tambah tab state dan tab bar JSX

- [ ] **Step 1: Tambah state activeTab**

Setelah `const [copied, setCopied] = useState(false)`:
```typescript
const [activeTab, setActiveTab] = useState<'path' | 'vehicle'>('path')
```

- [ ] **Step 2: Tambah tab bar JSX setelah `</header>`**

```tsx
{/* ── Tab Bar ── */}
<div style={{ display: 'flex', borderBottom: '1px solid #1c2030' }}>
  {(['path', 'vehicle'] as const).map(tab => {
    const active = activeTab === tab
    const color = tab === 'path' ? '#4ade80' : '#fb923c'
    return (
      <button
        key={tab}
        onClick={() => setActiveTab(tab)}
        style={{
          flex: 1,
          padding: '10px 0',
          border: 'none',
          borderBottom: `2px solid ${active ? color : 'transparent'}`,
          background: 'transparent',
          color: active ? color : '#4a5878',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.12s ease',
          outline: 'none',
        }}
      >
        {tab}
      </button>
    )
  })}
</div>
```

---

## Chunk 3: Panel.tsx — Body Rearrangement

### Task 4: Ganti seluruh scrollable body dengan tab-aware content

**Files:**
- Modify: `src/components/Panel.tsx` — ganti seluruh `<div style={{ flex: 1, overflowY: 'auto' ... }}>` (baris 126–382)

```tsx
{/* ── Scrollable body ── */}
<div
  style={{
    flex: 1,
    overflowY: 'auto',
    padding: '22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 28,
  }}
>
  {activeTab === 'path' && (
    <>
      <section>
        <SectionLabel>Draw</SectionLabel>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
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

      <section>
        <SectionLabel>Lines ({lines.length})</SectionLabel>
        <LineList lines={lines} onEdit={onLineEdit} onDelete={onLineDelete} />
      </section>

      <section>
        <SectionLabel>Curves ({curves.length})</SectionLabel>
        <CurveList curves={curves} onOffsetChange={onCurveOffsetChange} onDelete={onCurveDelete} />
      </section>
    </>
  )}

  {activeTab === 'vehicle' && (
    <>
      <section>
        <SectionLabel>Vehicle</SectionLabel>
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

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={labelStyle}>Speed</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: '#fb923c', letterSpacing: 1 }}>
              {vehicleSpeed}<span style={{ fontSize: 11, color: '#4a5878', marginLeft: 3 }}>px/s</span>
            </span>
          </div>
          <input type="range" min={10} max={300} step={10} value={vehicleSpeed}
            onChange={e => onVehicleSpeedChange(Number(e.target.value))}
            disabled={animatingVehicleId !== null}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <Muted>10px/s</Muted><Muted>300px/s</Muted>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={labelStyle}>Axles</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: '#818cf8', letterSpacing: 1 }}>
              {axleCount}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[2, 3, 4, 5].map(n => {
              const active = axleCount === n
              return (
                <button key={n} onClick={() => onAxleCountChange(n)} style={{
                  flex: 1, padding: '8px 4px',
                  border: `1px solid ${active ? '#818cf8' : '#1c2030'}`,
                  background: active ? '#818cf815' : 'transparent',
                  color: active ? '#a5b4fc' : '#5a6e88',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  cursor: 'pointer', transition: 'all 0.12s ease', outline: 'none',
                }}>{n}</button>
              )
            })}
          </div>
        </div>

        {axleSpacings.map((spacing, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={labelStyle}>Spacing {i + 1}–{i + 2}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#818cf8', letterSpacing: 1 }}>
                {spacing}<span style={{ fontSize: 11, color: '#4a5878', marginLeft: 3 }}>px</span>
              </span>
            </div>
            <input type="range" min={5} max={200} step={1} value={spacing}
              onChange={e => {
                const next = [...axleSpacings]
                next[i] = Number(e.target.value)
                onAxleSpacingsChange(next)
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <Muted>5px</Muted><Muted>200px</Muted>
            </div>
          </div>
        ))}

        <VehicleList
          vehicles={vehicles}
          vehicleEndPoints={vehicleEndPoints}
          selectedVehicleId={selectedVehicleId}
          animatingVehicleId={animatingVehicleId}
          vehicleOriginId={vehicleOriginId}
          onSelect={onVehicleSelect}
          onDeleteEnd={onVehicleEndDelete}
          onPlay={onVehiclePlay}
          onReset={onVehicleReset}
          onRemove={onVehicleRemove}
        />
      </section>
    </>
  )}

  {/* ── Scene stats — always visible ── */}
  <section>
    <SectionLabel>Scene</SectionLabel>
    <div style={{ border: '1px solid #1c2030', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <StatRow label="Lines" value={lines.length} />
      <StatRow label="Curves" value={curves.length} />
      <div style={{ height: 1, background: '#1c2030', margin: '2px 0' }} />
      <StatRow label="Graph nodes" value={graphNodeCount} highlight={graphNodeCount > 0} />
    </div>
  </section>

  <section>
    <button onClick={handleCopy} style={{
      width: '100%', padding: '10px 12px',
      border: `1px solid ${copied ? '#4ade80' : '#1c2030'}`,
      background: copied ? '#4ade8015' : 'transparent',
      color: copied ? '#4ade80' : '#5a6e88',
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1.5,
      textTransform: 'uppercase', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      transition: 'all 0.15s ease', outline: 'none',
    }}>
      <span style={{ fontSize: 14 }}>{copied ? '✓' : '⎘'}</span>
      {copied ? 'Copied!' : 'Copy Snapshot'}
    </button>
  </section>

  <section style={{ marginTop: 'auto' }}>
    <SectionLabel>Guide</SectionLabel>
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#4a5878', lineHeight: 2, letterSpacing: 0.3 }}>
      {mode === 'drag' && (<><GuideRow>No action in drag mode</GuideRow><GuideRow>Switch to Line or Curve</GuideRow></>)}
      {mode === 'line' && (<><GuideRow>Click + drag to draw a line</GuideRow><GuideRow>○ start → end</GuideRow></>)}
      {mode === 'curve' && (<><GuideRow>Hover a line to place from-point</GuideRow><GuideRow>Drag to a second line</GuideRow><GuideRow>Release to confirm</GuideRow></>)}
      {mode === 'vehicle-start' && (<><GuideRow>Hover a line to preview</GuideRow><GuideRow>Click to place vehicle</GuideRow></>)}
      {mode === 'vehicle-end' && (<><GuideRow>Select a vehicle first</GuideRow><GuideRow>Hover a line to preview end</GuideRow><GuideRow>Green = path valid</GuideRow><GuideRow>Click to set end point</GuideRow></>)}
    </div>
  </section>
</div>
```

---

## Chunk 4: Panel.tsx — LineList + CurveList Components

### Task 5: Tambah style helpers baru

**Files:**
- Modify: `src/components/Panel.tsx` — setelah `const labelStyle: CSSProperties = { ... }`

```typescript
const inputStyle: CSSProperties = {
  background: '#0d1117',
  border: '1px solid #1c2030',
  color: '#d8e4f0',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  padding: '4px 6px',
  outline: 'none',
  flex: 1,
  minWidth: 0,
}

const applyButtonStyle: CSSProperties = {
  alignSelf: 'flex-end',
  padding: '5px 14px',
  border: '1px solid #4ade8040',
  background: '#4ade8010',
  color: '#4ade80',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  cursor: 'pointer',
  outline: 'none',
  transition: 'all 0.12s ease',
}
```

### Task 6: Tambah komponen LineList

**Files:**
- Modify: `src/components/Panel.tsx` — setelah `VehicleList`, sebelum `iconButtonStyle`

Draft state diinisialisasi tepat saat expand (di dalam `handleExpand`), sehingga input `onChange` selalu beroperasi pada draft yang sudah ada — tidak ada dummy Line fallback.

```tsx
function LineList({
  lines,
  onEdit,
  onDelete,
}: {
  lines: Line[]
  onEdit: (oldId: string, updatedLine: Line) => void
  onDelete: (lineId: string) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, {
    id: string; startX: string; startY: string; endX: string; endY: string
  }>>({})

  function handleExpand(line: Line) {
    if (expandedId === line.id) {
      setExpandedId(null)
      return
    }
    // Initialize draft from current line values when expanding
    setDrafts(prev => ({
      ...prev,
      [line.id]: {
        id: line.id,
        startX: String(Math.round(line.start.x)),
        startY: String(Math.round(line.start.y)),
        endX:   String(Math.round(line.end.x)),
        endY:   String(Math.round(line.end.y)),
      },
    }))
    setExpandedId(line.id)
  }

  function handleApply(line: Line) {
    const d = drafts[line.id]
    if (!d) return
    const newId = d.id.trim() || line.id
    onEdit(line.id, {
      ...line,
      id: newId,
      start: { x: Number(d.startX) || line.start.x, y: Number(d.startY) || line.start.y },
      end:   { x: Number(d.endX)   || line.end.x,   y: Number(d.endY)   || line.end.y   },
    })
    setExpandedId(null)
  }

  if (lines.length === 0) return <Muted>No lines</Muted>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lines.map(line => {
        const expanded = expandedId === line.id
        const d = drafts[line.id]
        return (
          <div key={line.id} style={{
            border: `1px solid ${expanded ? '#4ade8040' : '#1c2030'}`,
            background: expanded ? '#4ade8006' : 'transparent',
            transition: 'all 0.12s ease',
          }}>
            {/* Row header */}
            <div onClick={() => handleExpand(line)} style={{
              padding: '7px 10px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4a5878' }}>
                  {expanded ? '▾' : '▸'}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#8899aa' }}>
                  {line.id}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!expanded && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#3a4a5e' }}>
                    ({Math.round(line.start.x)},{Math.round(line.start.y)})→({Math.round(line.end.x)},{Math.round(line.end.y)})
                  </span>
                )}
                <button onClick={e => { e.stopPropagation(); onDelete(line.id) }}
                  style={iconButtonStyle('#ef4444')} title="Delete line">×</button>
              </div>
            </div>

            {/* Edit form */}
            {expanded && d && (
              <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* ID */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, width: 36, flexShrink: 0 }}>ID</span>
                  <input value={d.id}
                    onChange={e => setDrafts(p => ({ ...p, [line.id]: { ...p[line.id], id: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleApply(line)}
                    style={inputStyle} />
                </div>
                {/* Start */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, width: 36, flexShrink: 0 }}>Start</span>
                  <span style={labelStyle}>x</span>
                  <input value={d.startX}
                    onChange={e => setDrafts(p => ({ ...p, [line.id]: { ...p[line.id], startX: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleApply(line)}
                    style={{ ...inputStyle, width: 52 }} />
                  <span style={labelStyle}>y</span>
                  <input value={d.startY}
                    onChange={e => setDrafts(p => ({ ...p, [line.id]: { ...p[line.id], startY: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleApply(line)}
                    style={{ ...inputStyle, width: 52 }} />
                </div>
                {/* End */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, width: 36, flexShrink: 0 }}>End</span>
                  <span style={labelStyle}>x</span>
                  <input value={d.endX}
                    onChange={e => setDrafts(p => ({ ...p, [line.id]: { ...p[line.id], endX: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleApply(line)}
                    style={{ ...inputStyle, width: 52 }} />
                  <span style={labelStyle}>y</span>
                  <input value={d.endY}
                    onChange={e => setDrafts(p => ({ ...p, [line.id]: { ...p[line.id], endY: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleApply(line)}
                    style={{ ...inputStyle, width: 52 }} />
                </div>
                <button onClick={() => handleApply(line)} style={applyButtonStyle}>Apply</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

### Task 7: Tambah komponen CurveList

**Files:**
- Modify: `src/components/Panel.tsx` — setelah `LineList`

```tsx
function CurveList({
  curves,
  onOffsetChange,
  onDelete,
}: {
  curves: StoredCurve[]
  onOffsetChange: (curveId: string, fromOffset: number, toOffset: number) => void
  onDelete: (curveId: string) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { fromOffset: string; toOffset: string }>>({})

  function handleExpand(curve: StoredCurve) {
    if (expandedId === curve.id) {
      setExpandedId(null)
      return
    }
    setDrafts(prev => ({
      ...prev,
      [curve.id]: {
        fromOffset: String(Math.round(curve.fromOffset)),
        toOffset:   String(Math.round(curve.toOffset)),
      },
    }))
    setExpandedId(curve.id)
  }

  function handleApply(curve: StoredCurve) {
    const d = drafts[curve.id]
    if (!d) return
    const fromOffset = Number(d.fromOffset)
    const toOffset   = Number(d.toOffset)
    if (!isNaN(fromOffset) && !isNaN(toOffset)) {
      onOffsetChange(curve.id, fromOffset, toOffset)
    }
    setExpandedId(null)
  }

  if (curves.length === 0) return <Muted>No curves</Muted>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {curves.map(curve => {
        const expanded = expandedId === curve.id
        const d = drafts[curve.id]
        return (
          <div key={curve.id} style={{
            border: `1px solid ${expanded ? '#818cf840' : '#1c2030'}`,
            background: expanded ? '#818cf806' : 'transparent',
            transition: 'all 0.12s ease',
          }}>
            {/* Row header */}
            <div onClick={() => handleExpand(curve)} style={{
              padding: '7px 10px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4a5878' }}>
                  {expanded ? '▾' : '▸'}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#8899aa' }}>
                  {curve.id}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!expanded && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#3a4a5e' }}>
                    {curve.fromLineId.slice(-6)}@{Math.round(curve.fromOffset)}→{curve.toLineId.slice(-6)}@{Math.round(curve.toOffset)}
                  </span>
                )}
                <button onClick={e => { e.stopPropagation(); onDelete(curve.id) }}
                  style={iconButtonStyle('#ef4444')} title="Delete curve">×</button>
              </div>
            </div>

            {/* Edit form */}
            {expanded && d && (
              <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* From */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, width: 30, flexShrink: 0 }}>From</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4a5878', flex: 1 }}>
                    {curve.fromLineId}
                  </span>
                  <input value={d.fromOffset}
                    onChange={e => setDrafts(p => ({ ...p, [curve.id]: { ...p[curve.id], fromOffset: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleApply(curve)}
                    style={{ ...inputStyle, width: 52 }} />
                  <span style={labelStyle}>px</span>
                </div>
                {/* To */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, width: 30, flexShrink: 0 }}>To</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4a5878', flex: 1 }}>
                    {curve.toLineId}
                  </span>
                  <input value={d.toOffset}
                    onChange={e => setDrafts(p => ({ ...p, [curve.id]: { ...p[curve.id], toOffset: e.target.value } }))}
                    onKeyDown={e => e.key === 'Enter' && handleApply(curve)}
                    style={{ ...inputStyle, width: 52 }} />
                  <span style={labelStyle}>px</span>
                </div>
                <button onClick={() => handleApply(curve)} style={applyButtonStyle}>Apply</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

---

## Chunk 5: Build + Verify + Commit

### Task 8: Build check, verifikasi manual, commit

- [ ] **Step 1: Build**

```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npm run build
```

Expected: `✓ built in Xms` tanpa TypeScript error.

- [ ] **Step 2: Manual verify di dev server**

```bash
npm run dev
```

Buka `http://localhost:5173` dan verifikasi:
- [ ] Tab bar PATH / VEHICLE muncul di bawah "PATH EDITOR"
- [ ] Tab PATH: Drag/Line/Curve buttons + tangent mode + Lines list + Curves list
- [ ] Tab VEHICLE: Vehicle-start/End + Speed + Axles + Vehicle list
- [ ] Scene stats, Copy Snapshot, Guide selalu visible di bawah tab content
- [ ] Tambah line → muncul di Lines list dengan ID dan koordinat collapsed
- [ ] Klik row line → expand form (ID, Start x/y, End x/y, Apply)
- [ ] Edit koordinat + Apply → line bergerak di canvas
- [ ] Edit ID (rename) + Apply → ID berubah, curves terkait ter-update
- [ ] Delete line (×) → line + curves terkait hilang dari canvas
- [ ] Tambah curve → muncul di Curves list
- [ ] Klik curve → expand (From offset, To offset, Apply)
- [ ] Edit offset + Apply → curve attachment bergeser di canvas
- [ ] Delete curve (×) → curve hilang

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/components/Panel.tsx
git commit -m "feat: add PATH/VEHICLE tabs to Panel with Line and Curve list management"
```

---

## Catatan Implementasi

**`handleLineEdit` adalah single atomic function** — tidak ada dua panggilan terpisah dari Panel. Panel memanggil `onLineEdit(line.id, updatedLine)` dengan `line.id` sebagai old ID dan `updatedLine.id` sebagai potential new ID.

**Draft initialization di expand** — `setDraft` dummy sudah dihapus. Draft hanya diinisialisasi di dalam `handleExpand`. Handler `onChange` di input selalu menggunakan `p[line.id]` (draft yang sudah ada), tidak ada fallback ke dummy.

**`handleCurveOffsetChange`** — recompute bezier dilakukan di App.tsx (bukan Panel) karena Panel tidak memiliki `createBezierCurve`. Ini sedikit berbeda dari spec original yang mengusulkan reuse `onCurveUpdate`, tapi lebih bersih karena Panel tidak perlu import library internals.
