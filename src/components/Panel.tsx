import { useState, type CSSProperties } from 'react'
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

export function Panel({
  mode,
  maxWheelbase,
  tangentMode,
  lineCount,
  curveCount,
  vehicles,
  vehicleEndPoints,
  selectedVehicleId,
  graphNodeCount,
  onModeChange,
  onMaxWheelbaseChange,
  onTangentModeChange,
  onVehicleSelect,
  onVehicleEndDelete,
  onCopySnapshot,
}: Props) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    onCopySnapshot()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <aside
      style={{
        width: '25vw',
        minWidth: 240,
        maxWidth: 320,
        height: '100%',
        borderLeft: '1px solid #1c2030',
        background: '#080a0e',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Chakra Petch', sans-serif",
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          padding: '20px 22px 18px',
          borderBottom: '1px solid #1c2030',
          position: 'relative',
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 3,
            color: '#4a5878',
            textTransform: 'uppercase',
            marginBottom: 6,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          vehicle-path2
        </div>

        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: '#d8e4f0',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
          }}
        >
          Path Editor
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 22,
            width: 32,
            height: 1,
            background: '#4ade80',
            opacity: 0.6,
          }}
        />
      </header>

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
        {/* ── Section 1: Line & Curve ── */}
        <section>
          <SectionLabel>Line &amp; Curve</SectionLabel>
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

          <VehicleList
            vehicles={vehicles}
            vehicleEndPoints={vehicleEndPoints}
            selectedVehicleId={selectedVehicleId}
            onSelect={onVehicleSelect}
            onDeleteEnd={onVehicleEndDelete}
          />
        </section>

        {/* ── Scene stats ── */}
        <section>
          <SectionLabel>Scene</SectionLabel>
          <div
            style={{
              border: '1px solid #1c2030',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <StatRow label="Lines" value={lineCount} />
            <StatRow label="Curves" value={curveCount} />
            <div style={{ height: 1, background: '#1c2030', margin: '2px 0' }} />
            <StatRow
              label="Graph nodes"
              value={graphNodeCount}
              highlight={graphNodeCount > 0}
            />
          </div>
        </section>

        {/* ── Copy Snapshot ── */}
        <section>
          <button
            onClick={handleCopy}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: `1px solid ${copied ? '#4ade80' : '#1c2030'}`,
              background: copied ? '#4ade8015' : 'transparent',
              color: copied ? '#4ade80' : '#5a6e88',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
              outline: 'none',
            }}
          >
            <span style={{ fontSize: 14 }}>{copied ? '✓' : '⎘'}</span>
            {copied ? 'Copied!' : 'Copy Snapshot'}
          </button>
        </section>

        {/* ── Instructions ── */}
        <section style={{ marginTop: 'auto' }}>
          <SectionLabel>Guide</SectionLabel>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: '#4a5878',
              lineHeight: 2,
              letterSpacing: 0.3,
            }}
          >
            {mode === 'drag' && (
              <>
                <GuideRow>No action in drag mode</GuideRow>
                <GuideRow>Switch to Line or Curve</GuideRow>
              </>
            )}
            {mode === 'line' && (
              <>
                <GuideRow>Click + drag to draw a line</GuideRow>
                <GuideRow>○ start  → end</GuideRow>
              </>
            )}
            {mode === 'curve' && (
              <>
                <GuideRow>Hover a line to place from-point</GuideRow>
                <GuideRow>From valid: [wb → end]</GuideRow>
                <GuideRow>Drag to a second line</GuideRow>
                <GuideRow>To valid: [0 → end − wb]</GuideRow>
                <GuideRow>Release to confirm</GuideRow>
              </>
            )}
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
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <footer
        style={{
          padding: '12px 22px',
          borderTop: '1px solid #1c2030',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: '#3a4a5e',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        }}
      >
        vehicle-path2 · path editor
      </footer>
    </aside>
  )
}

// ── Style helpers ───────────────────────────────────────────────────────────────

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

const labelStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 10,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: '#4a5878',
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: 2.5,
        textTransform: 'uppercase',
        color: '#4a5878',
        marginBottom: 10,
        fontFamily: "'JetBrains Mono', monospace",
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function StatRow({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          fontSize: 11,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: '#4a5878',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 17,
          fontWeight: 500,
          color: highlight ? '#4ade80' : '#4a5878',
          transition: 'color 0.2s',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        color: '#3a4a5e',
      }}
    >
      {children}
    </span>
  )
}

function GuideRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: '#3a4a5e' }}>›</span>
      <span>{children}</span>
    </div>
  )
}
