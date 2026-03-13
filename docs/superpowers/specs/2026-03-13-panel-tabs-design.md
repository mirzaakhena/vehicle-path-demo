# Panel Tabs + Line/Curve List Management Design

**Goal:** Pisahkan Panel menjadi dua tab (Path dan Vehicle), tambahkan list Lines dan Curves yang bisa diedit dan dihapus.

**Architecture:** Tab state lokal di Panel (`activeTab: 'path' | 'vehicle'`). Props baru diteruskan dari App ke Panel: `lines`, `curves`, dan empat callback delete/update. Sub-komponen baru `LineList` dan `CurveList` menangani expanded/collapsed state secara lokal.

**Tech Stack:** React (existing), inline styles (existing pattern), TypeScript.

---

## Tab Structure

Tab bar di bawah header "PATH EDITOR", dua tombol: **PATH** dan **VEHICLE**.

- Active tab: border-bottom berwarna — hijau (`#4ade80`) untuk Path, oranye (`#fb923c`) untuk Vehicle
- Tab state: `useState<'path' | 'vehicle'>('path')` di dalam Panel

**Tab PATH berisi:**
1. Mode buttons: Drag / Line / Curve
2. Tangent mode selector (proportional-40 / magic-55)
3. `LineList` — list semua lines
4. `CurveList` — list semua curves

**Tab VEHICLE berisi:**
1. Mode buttons: Vehicle-start / Vehicle-end
2. Speed slider
3. Axle count selector + spacing sliders
4. `VehicleList` (existing)

**Selalu visible (di luar tab):**
- Scene stats (Lines count, Curves count, Graph nodes)
- Copy Snapshot button
- Guide / Instructions

---

## LineList Component

Setiap line item punya dua state: **collapsed** dan **expanded**.

**Collapsed:**
```
line-1   start(120,45) → end(340,200)   [×]
```

**Expanded** (toggle dengan klik row):
```
▾ line-1                               [×]
  ID    [________________]
  Start  x [____]  y [____]
  End    x [____]  y [____]
                        [Apply]
```

- Input koordinat: numerik, divalidasi sebagai number
- Apply: klik tombol atau tekan Enter — panggil `onLineUpdate` dengan line ter-update
- Rename (ID change): cascade otomatis via `handleLineUpdate` yang sudah ada di App.tsx
- Delete (×): panggil `onLineDelete(lineId)` — hapus line + cascade hapus curves terkait
- Empty state: tampilkan teks "No lines" jika `lines.length === 0`

---

## CurveList Component

Setiap curve item punya dua state: **collapsed** dan **expanded**.

**Collapsed:**
```
curve-1   line-1 @45 → line-2 @120   [×]
```

**Expanded** (toggle dengan klik row):
```
▾ curve-1                             [×]
  From  line-1  offset [___] px  (read-only lineId)
  To    line-2  offset [___] px  (read-only lineId)
                            [Apply]
```

- fromLineId dan toLineId: **read-only label** (reconnect di-skip)
- offset: numerik px absolut (`isPercentage` di-skip untuk sekarang)
- Apply: panggil `onCurveUpdate` dengan StoredCurve ter-update (bezier di-recompute di App.tsx via `handleCurveUpdate`)
- Delete (×): panggil `onCurveDelete(curveId)`
- Empty state: tampilkan teks "No curves" jika `curves.length === 0`

---

## Data Flow Changes

### Props baru di Panel

```typescript
// Tambahan di interface Props:
lines: Line[]
curves: StoredCurve[]
onLineUpdate: (line: Line) => void       // existing di App.tsx
onLineDelete: (lineId: string) => void   // baru
onCurveUpdate: (curve: StoredCurve) => void  // existing di App.tsx
onCurveDelete: (curveId: string) => void     // baru
```

Props yang bisa **dihapus** dari Panel (derivable dari arrays):
- `lineCount: number` → ganti dengan `lines.length`
- `curveCount: number` → ganti dengan `curves.length`

### Fungsi baru di App.tsx

```typescript
function handleLineDelete(lineId: string) {
  setLines(prev => prev.filter(l => l.id !== lineId))
  setCurves(prev => prev.filter(c => c.fromLineId !== lineId && c.toLineId !== lineId))
}

function handleCurveDelete(curveId: string) {
  setCurves(prev => prev.filter(c => c.id !== curveId))
}
```

### Pass ke Panel

```tsx
<Panel
  lines={lines}
  curves={curves}
  onLineUpdate={handleLineUpdate}   // existing
  onLineDelete={handleLineDelete}   // baru
  onCurveUpdate={handleCurveUpdate} // existing
  onCurveDelete={handleCurveDelete} // baru
  // hapus: lineCount, curveCount
  // ... props lainnya tetap
/>
```

---

## File yang Dimodifikasi

- **Modify:** `src/components/Panel.tsx` — tambah tab bar, `LineList`, `CurveList`, update Props interface, hapus `lineCount`/`curveCount`
- **Modify:** `src/App.tsx` — tambah `handleLineDelete`, `handleCurveDelete`, update Panel props

## Out of Scope

- `isPercentage` untuk curve offset — skip untuk sekarang
- Reconnect curve ke line lain — skip
- Reorder lines/curves — skip
