# Multi-Axle Vehicle Configuration — Implementation Plan

**Goal:** Tambahkan axle count selector (2–5) dan per-spacing sliders di Panel, sehingga vehicle yang ditempatkan di canvas menggunakan axleSpacings yang dikonfigurasi user.

**Scope:** Hanya `vehicle-path-demo`. Library `vehicle-path2` tidak diubah — ia sudah mendukung N axle.

**Files yang diubah:**
- Modify: `src/App.tsx` — tambah state `axleCount` + `axleSpacings`, pass ke Panel & Canvas
- Modify: `src/components/Panel.tsx` — tambah props + render selector & sliders
- Modify: `src/components/Canvas.tsx` — terima `axleSpacings` prop, gunakan saat place vehicle

---

## Context Penting

### Bagaimana vehicle dibuat saat ini (Canvas.tsx ~line 566)
```typescript
// vehicle-start mode, saat user klik Line:
const wb = maxWheelbaseRef.current
const axleSpacings = [wb]   // ← hardcoded 1 spacing (2 axle)
const axleStates = calculateInitialAxlePositions(hit.line.id, hit.offset, axleSpacings, hit.line)
setVehicleHover({ lineId: hit.line.id, axles: ..., axleSpacings })
```

### Canvas props saat ini (Canvas.tsx ~line 67)
```typescript
interface Props {
  ...
  maxWheelbase: number   // sudah ada
  // belum ada: axleSpacings: number[]
  ...
}
```

### Panel props saat ini (Panel.tsx ~line 4)
```typescript
interface Props {
  maxWheelbase: number
  onMaxWheelbaseChange: (v: number) => void
  // belum ada: axleCount, axleSpacings, callbacks-nya
  ...
}
```

### App.tsx saat ini
- `maxWheelbase` state sudah ada, dipass ke Panel dan Canvas
- Tidak ada `axleCount` atau `axleSpacings` state

### Aturan axleSpacings
- `axleSpacings.length = axleCount - 1`
- Contoh: 3 axle → `axleSpacings = [40, 40]` (2 slider)
- Default setiap spacing: 40px
- Range slider: sama dengan maxWheelbase slider (5–200px)

---

## Task 1 — Tambah state di App.tsx

**File:** `src/App.tsx`

### Step 1: Tambah state

Tepat setelah baris `const [vehicleSpeed, setVehicleSpeed] = useState(80)`, tambahkan:

```typescript
const [axleCount, setAxleCount] = useState(2)
const [axleSpacings, setAxleSpacings] = useState<number[]>([40])
```

### Step 2: Handler saat axleCount berubah

Saat user mengubah jumlah axle, `axleSpacings` harus disesuaikan panjangnya (N-1 entries), mempertahankan nilai lama yang masih valid:

```typescript
function handleAxleCountChange(count: number) {
  setAxleCount(count)
  setAxleSpacings(prev => {
    const needed = count - 1
    if (prev.length === needed) return prev
    if (prev.length > needed) return prev.slice(0, needed)
    return [...prev, ...Array(needed - prev.length).fill(40)]
  })
}
```

### Step 3: Pass ke Panel

Di JSX `<Panel ...>`, tambahkan 4 props baru:
```tsx
axleCount={axleCount}
axleSpacings={axleSpacings}
onAxleCountChange={handleAxleCountChange}
onAxleSpacingsChange={setAxleSpacings}
```

### Step 4: Pass ke Canvas

Di JSX `<Canvas ...>`, tambahkan 1 prop baru:
```tsx
axleSpacings={axleSpacings}
```

---

## Task 2 — Update Panel.tsx

**File:** `src/components/Panel.tsx`

### Step 1: Tambah props ke interface

Di `interface Props`, tambahkan setelah `maxWheelbase: number`:
```typescript
axleCount: number
axleSpacings: number[]
onAxleCountChange: (count: number) => void
onAxleSpacingsChange: (spacings: number[]) => void
```

### Step 2: Destructure props baru

Di function `Panel({ ... })`, tambahkan ke destructuring:
```typescript
axleCount,
axleSpacings,
onAxleCountChange,
onAxleSpacingsChange,
```

### Step 3: Tambah UI di Section Vehicle

Tepat **setelah** blok Speed slider (sebelum `<VehicleList ...>`), tambahkan blok axle configuration:

```tsx
{/* Axle Count */}
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
        <button
          key={n}
          onClick={() => onAxleCountChange(n)}
          style={{
            flex: 1,
            padding: '8px 4px',
            border: `1px solid ${active ? '#818cf8' : '#1c2030'}`,
            background: active ? '#818cf815' : 'transparent',
            color: active ? '#a5b4fc' : '#5a6e88',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            cursor: 'pointer',
            transition: 'all 0.12s ease',
            outline: 'none',
          }}
        >
          {n}
        </button>
      )
    })}
  </div>
</div>

{/* Per-axle Spacing Sliders */}
{axleSpacings.map((spacing, i) => (
  <div key={i} style={{ marginBottom: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <span style={labelStyle}>Spacing {i + 1}–{i + 2}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#818cf8', letterSpacing: 1 }}>
        {spacing}<span style={{ fontSize: 11, color: '#4a5878', marginLeft: 3 }}>px</span>
      </span>
    </div>
    <input
      type="range"
      min={5}
      max={200}
      step={1}
      value={spacing}
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
```

**Catatan label "Spacing i–i+1":** menunjukkan jarak antara axle ke-i dan axle ke-(i+1) (0-indexed), sehingga user intuitif tahu spacing mana yang dikonfigurasi.

---

## Task 3 — Update Canvas.tsx

**File:** `src/components/Canvas.tsx`

### Step 1: Tambah prop ke interface

Di `interface Props`, tambahkan setelah `maxWheelbase: number`:
```typescript
axleSpacings: number[]
```

### Step 2: Destructure di function Canvas

Di baris destructuring props Canvas, tambahkan `axleSpacings`.

### Step 3: Buat ref untuk axleSpacings

Canvas menggunakan refs untuk menghindari stale closure di event handlers. Cari pola `maxWheelbaseRef`:
```typescript
// Sudah ada di Canvas:
const maxWheelbaseRef = useRef(maxWheelbase)
maxWheelbaseRef.current = maxWheelbase
```

Tambahkan persis setelahnya:
```typescript
const axleSpacingsRef = useRef(axleSpacings)
axleSpacingsRef.current = axleSpacings
```

### Step 4: Ganti hardcoded axleSpacings di vehicle-start

Cari (sekitar line 572):
```typescript
const wb = maxWheelbaseRef.current
const lineLen = getLineLength(hit.line)
// Default: 2-axle vehicle dengan spacing = maxWheelbase
const axleSpacings = [wb]
const validMax = lineLen - wb
```

Ganti dengan:
```typescript
const spacings = axleSpacingsRef.current
const totalSpacing = spacings.reduce((s, v) => s + v, 0)
const validMax = getLineLength(hit.line) - totalSpacing
```

### Step 5: Update kondisi validitas dan hover

Cari:
```typescript
if (validMax > 0 && hit.offset >= 0 && hit.offset <= validMax) {
  const axleStates = calculateInitialAxlePositions(hit.line.id, hit.offset, axleSpacings, hit.line)
  setVehicleHover({
    lineId: hit.line.id,
    axles: axleStates.map(a => ({ offset: a.absoluteOffset, position: a.position })),
    axleSpacings,
  })
```

Ganti seluruh kondisi tersebut (ubah `axleSpacings` → `spacings`):
```typescript
if (validMax > 0 && hit.offset >= 0 && hit.offset <= validMax) {
  const axleStates = calculateInitialAxlePositions(hit.line.id, hit.offset, spacings, hit.line)
  setVehicleHover({
    lineId: hit.line.id,
    axles: axleStates.map(a => ({ offset: a.absoluteOffset, position: a.position })),
    axleSpacings: spacings,
  })
```

---

## Task 4 — Verifikasi & Commit

### Step 1: Jalankan dev server
```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npm run dev
```

### Step 2: Test manual
- [ ] Set axle count = 2 → 1 slider spacing → place vehicle → 2 titik axle di canvas
- [ ] Set axle count = 3 → 2 slider spacing → place vehicle → 3 titik axle di canvas
- [ ] Set axle count = 5 → 4 slider spacing → place vehicle → 5 titik axle di canvas
- [ ] Ubah nilai spacing slider → preview hover berubah sesuai
- [ ] Vehicle bergerak dengan animasi acceleration normal
- [ ] Mengubah axle count setelah vehicle sudah ada tidak mempengaruhi vehicle lama

### Step 3: Build check
```bash
npm run build
```
Pastikan tidak ada TypeScript error.

### Step 4: Commit
```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
git add src/App.tsx src/components/Panel.tsx src/components/Canvas.tsx
git commit -m "feat: add multi-axle vehicle configuration in panel

User can now select 2-5 axles before placing a vehicle.
N-1 spacing sliders appear (range 5-200px, default 40px each).
Vehicle is placed with configured axleSpacings.
Existing vehicles are not affected when axle count changes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Ringkasan Perubahan

| File | Jenis | Detail |
|------|-------|--------|
| `App.tsx` | +2 state, +1 handler, +5 props | `axleCount`, `axleSpacings`, `handleAxleCountChange` |
| `Panel.tsx` | +4 props, +UI block | Axle selector + N-1 spacing sliders |
| `Canvas.tsx` | +1 prop, +1 ref, ~5 lines | Gunakan `axleSpacingsRef` saat place vehicle |

Library `vehicle-path2` tidak diubah sama sekali.
