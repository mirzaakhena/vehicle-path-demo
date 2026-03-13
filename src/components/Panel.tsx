import { useState, type CSSProperties } from 'react'
import type { Line } from 'vehicle-path2/core'
import type { Mode, TangentMode, StoredCurve, PlacedVehicle, VehicleEndPoint } from '../types'

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
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'path' | 'vehicle'>('path')

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

// ── Sub-components ─────────────────────────────────────────────────────────────

function VehicleList({
  vehicles,
  vehicleEndPoints,
  selectedVehicleId,
  animatingVehicleId,
  vehicleOriginId,
  onSelect,
  onDeleteEnd,
  onPlay,
  onReset,
  onRemove,
}: {
  vehicles: PlacedVehicle[]
  vehicleEndPoints: Record<string, VehicleEndPoint>
  selectedVehicleId: string | null
  animatingVehicleId: string | null
  vehicleOriginId: string | null
  onSelect: (id: string | null) => void
  onDeleteEnd: (id: string) => void
  onPlay: (id: string) => void
  onReset: (id: string) => void
  onRemove: (id: string) => void
}) {
  if (vehicles.length === 0) {
    return <Muted>No vehicles placed</Muted>
  }
  const isLocked = animatingVehicleId !== null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {vehicles.map((v, i) => {
        const selected = selectedVehicleId === v.id
        const endPoint = vehicleEndPoints[v.id]
        const isAnimating = animatingVehicleId === v.id
        const hasOrigin = vehicleOriginId === v.id
        const canPlay = !!endPoint && !isLocked
        const canReset = hasOrigin && !isAnimating

        return (
          <div
            key={v.id}
            onClick={() => !isLocked && onSelect(selected ? null : v.id)}
            style={{
              padding: '8px 10px',
              border: `1px solid ${isAnimating ? '#4ade80' : selected ? '#fb923c' : '#1c2030'}`,
              background: isAnimating ? '#4ade8008' : selected ? '#fb923c10' : 'transparent',
              cursor: isLocked ? 'default' : 'pointer',
              transition: 'all 0.12s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {/* Header row: V label + status + play/reset */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {isAnimating && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4ade80', opacity: 0.8, letterSpacing: 1 }}>
                    MOVING
                  </span>
                )}
                {!isAnimating && selected && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#fb923c', opacity: 0.7, letterSpacing: 1 }}>
                    SELECTED
                  </span>
                )}
                {/* Reset button */}
                {canReset && (
                  <button
                    onClick={e => { e.stopPropagation(); onReset(v.id) }}
                    style={iconButtonStyle('#4a5878')}
                    title="Reset to start"
                  >↺</button>
                )}
                {/* Play button */}
                {canPlay && (
                  <button
                    onClick={e => { e.stopPropagation(); onPlay(v.id) }}
                    style={iconButtonStyle('#4ade80')}
                    title="Play"
                  >▶</button>
                )}
              </div>
            </div>

            {/* Front axle info */}
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4a5878' }}>
              front: {v.axles[0].lineId.slice(-4)} @{Math.round(v.axles[0].offset)}
            </div>

            {/* End point row */}
            {endPoint ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#4ade80' }}>
                  end: {endPoint.lineId.slice(-4)} @{Math.round(endPoint.offset)}
                </span>
                {!isLocked && (
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteEnd(v.id) }}
                    style={{ background: 'none', border: 'none', color: '#4a5878', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}
                    title="Remove end point"
                  >×</button>
                )}
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

function iconButtonStyle(color: string): CSSProperties {
  return {
    background: 'none',
    border: `1px solid ${color}40`,
    color,
    cursor: 'pointer',
    fontSize: 11,
    padding: '1px 5px',
    lineHeight: 1.4,
    fontFamily: "'JetBrains Mono', monospace",
    transition: 'all 0.12s ease',
    outline: 'none',
  }
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
