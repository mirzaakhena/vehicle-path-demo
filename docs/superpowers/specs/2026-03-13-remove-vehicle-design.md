# Remove Vehicle — Design Spec

**Date:** 2026-03-13
**Scope:** `vehicle-path-demo` only. Library `vehicle-path2` tidak diubah.

---

## Goal

User dapat menghapus vehicle yang sudah ditempatkan di canvas melalui tombol `×` di Panel.

---

## Behaviour

- Tombol `×` **selalu visible** di header card setiap vehicle (tidak perlu hover/select dulu).
- Klik `×` → vehicle langsung dihapus tanpa konfirmasi.
- Jika vehicle yang dihapus sedang ter-select, `selectedVehicleId` direset ke `null`.
- Tombol `×` **disabled** saat `isLocked` (ada animasi berjalan).
- End point vehicle (`vehicleEndPoints[vehicleId]`) ikut dihapus bersama vehicle.

---

## Files yang Diubah

| File | Perubahan |
|------|-----------|
| `src/App.tsx` | Tambah handler `handleVehicleRemove`, pass prop `onVehicleRemove` ke Panel |
| `src/components/Panel.tsx` | Tambah prop `onVehicleRemove`, teruskan ke VehicleList, render tombol `×` di header card |

`src/components/Canvas.tsx` tidak diubah — vehicle menghilang otomatis karena `vehicles` prop berubah.

---

## Handler Logic (`App.tsx`)

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

---

## UI (`Panel.tsx` → `VehicleList`)

Tombol `×` di header card, kiri dari label `V1`:

```tsx
<button
  onClick={e => { e.stopPropagation(); onRemove(v.id) }}
  disabled={isLocked}
  style={iconButtonStyle('#ef4444')}
  title="Remove vehicle"
>×</button>
```

Style mengikuti `iconButtonStyle` yang sudah ada, warna merah `#ef4444` untuk membedakan dari tombol lain.

---

## Out of Scope

- Konfirmasi dialog sebelum hapus
- Undo/redo
- Bulk delete
