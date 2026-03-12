# Remove Vehicle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan tombol `×` di setiap vehicle card di Panel sehingga user bisa menghapus vehicle yang sudah ditempatkan.

**Architecture:** Handler di App.tsx meng-update 3 state sekaligus (vehicles, vehicleEndPoints, selectedVehicleId). Prop `onVehicleRemove` diteruskan ke Panel → VehicleList. Tidak ada perubahan di Canvas.tsx.

**Tech Stack:** React 18, TypeScript, Vite

---

## Task 1 — Tambah handler & prop di App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Tambah handler `handleVehicleRemove`**

Tepat setelah `handleVehicleEndDelete`, tambahkan:

```typescript
function handleVehicleRemove(vehicleId: string) {
  setVehicles(prev => prev.filter(v => v.id !== vehicleId))
  setVehicleEndPoints(prev => {
    const next = { ...prev }
    delete next[vehicleId]
    return next
  })
  setSelectedVehicleId(prev => prev === vehicleId ? null : prev)
}
```

- [ ] **Step 2: Pass prop `onVehicleRemove` ke `<Panel>`**

Di JSX `<Panel ...>`, tambahkan setelah `onVehicleEndDelete={handleVehicleEndDelete}`:

```tsx
onVehicleRemove={handleVehicleRemove}
```

---

## Task 2 — Update Panel.tsx

**Files:**
- Modify: `src/components/Panel.tsx`

- [ ] **Step 1: Tambah prop ke interface `Props`**

Di `interface Props`, tambahkan setelah `onVehicleEndDelete`:

```typescript
onVehicleRemove: (vehicleId: string) => void
```

- [ ] **Step 2: Destructure prop baru di function Panel**

Di destructuring `Panel({ ... })`, tambahkan setelah `onVehicleEndDelete`:

```typescript
onVehicleRemove,
```

- [ ] **Step 3: Tambah `onRemove` ke destructuring dan type signature VehicleList**

Di function `VehicleList({ ... }: { ... })`, lakukan dua perubahan:

**3a. Di destructuring parameter** — tambahkan setelah `onReset,`:
```typescript
onRemove,
```

**3b. Di type object** — tambahkan setelah `onReset: (id: string) => void`:
```typescript
onRemove: (id: string) => void
```

- [ ] **Step 4: Pass ke VehicleList di JSX**

Di `<VehicleList ...>` (di dalam Panel), tambahkan prop:

```tsx
onRemove={onVehicleRemove}
```

- [ ] **Step 5: Render tombol `×` di header card vehicle**

Struktur header row saat ini (lihat Panel.tsx):
```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <span style={...}>V{i+1}</span>          {/* ← kiri: hanya span */}
  <div style={{ display: 'flex', ... }}>   {/* ← kanan: tombol reset/play */}
    ...
  </div>
</div>
```

Ganti sisi kiri (dari `<span>V{i+1}</span>`) dengan wrapper div yang memuat tombol `×` dan label:

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
  <button
    onClick={e => { e.stopPropagation(); onRemove(v.id) }}
    disabled={isLocked}
    style={iconButtonStyle('#ef4444')}
    title="Remove vehicle"
  >×</button>
  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: isAnimating ? '#4ade80' : selected ? '#fb923c' : '#8899aa', letterSpacing: 1 }}>
    V{i + 1}
  </span>
</div>
```

> **Catatan:** `iconButtonStyle` sudah ada di file sebagai helper — gunakan warna `#ef4444` (merah) agar berbeda dari tombol lain. Span style dipertahankan persis seperti semula.

---

## Task 3 — Verifikasi & commit

- [ ] **Step 1: Build check**

```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
npm run build
```

Expected: `✓ built in ...ms` tanpa TypeScript error.

- [ ] **Step 2: Manual test**

- [ ] Place 2 vehicle di canvas
- [ ] Klik `×` pada vehicle pertama → vehicle hilang dari canvas dan panel
- [ ] selectedVehicleId reset (tidak ada vehicle yang highlight)
- [ ] vehicleEndPoint ikut hilang
- [ ] Vehicle kedua tidak terpengaruh

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Mirza/workspace/vehicle-path-demo
git add src/App.tsx src/components/Panel.tsx
git commit -m "feat: add remove vehicle button in panel

Each vehicle card now has an × button to remove the vehicle.
Removal clears the vehicle, its end point, and deselects it.
Button is disabled while any animation is running.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
