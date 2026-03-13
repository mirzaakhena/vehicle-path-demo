import { useState, useMemo, useEffect, useRef } from 'react'
import type { Line } from 'vehicle-path2/core'
import { buildGraph, createBezierCurve, serializeScene, getPositionFromOffset, calculateInitialAxlePositions, PathEngine, moveVehicleWithAcceleration } from 'vehicle-path2/core'
import type { VehiclePathState, PathExecution, AccelerationConfig, AccelerationState } from 'vehicle-path2/core'
import type { Mode, StoredCurve, TangentMode, PlacedVehicle, VehicleEndPoint } from './types'
import { Canvas } from './components/Canvas'
import { Panel } from './components/Panel'

export default function App() {
  const [lines, setLines] = useState<Line[]>([])
  const [curves, setCurves] = useState<StoredCurve[]>([])
  const [vehicles, setVehicles] = useState<PlacedVehicle[]>([])
  const [mode, setMode] = useState<Mode>('drag')
  const [tangentMode, setTangentMode] = useState<TangentMode>('proportional-40')
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [vehicleEndPoints, setVehicleEndPoints] = useState<Record<string, VehicleEndPoint>>({})
  const [animatingVehicleId, setAnimatingVehicleId] = useState<string | null>(null)
  const [vehicleOriginId, setVehicleOriginId] = useState<string | null>(null)
  const [vehicleSpeed, setVehicleSpeed] = useState(80)
  const [axleCount, setAxleCount] = useState(2)
  const [axleSpacings, setAxleSpacings] = useState<number[]>([40])

  function handleAxleCountChange(count: number) {
    setAxleCount(count)
    setAxleSpacings(prev => {
      const needed = count - 1
      if (prev.length === needed) return prev
      if (prev.length > needed) return prev.slice(0, needed)
      return [...prev, ...Array(needed - prev.length).fill(40)]
    })
  }

  // ── Animation refs ──────────────────────────────────────────────────────────
  const rafRef           = useRef<number | null>(null)
  const engineRef        = useRef<PathEngine | null>(null)
  const animStateRef     = useRef<{ vehicleId: string; state: VehiclePathState; exec: PathExecution; accelState: AccelerationState } | null>(null)
  const vehicleOriginRef = useRef<PlacedVehicle | null>(null)
  const lastTimestampRef = useRef<number | null>(null)
  const vehicleSpeedRef  = useRef(vehicleSpeed); vehicleSpeedRef.current = vehicleSpeed

  // Keep the graph up-to-date as scene changes — maximizing library usage
  const graph = useMemo(
    () =>
      buildGraph(
        lines,
        curves.map(c => ({
          fromLineId: c.fromLineId,
          toLineId: c.toLineId,
          fromOffset: c.fromOffset,
          fromIsPercentage: false,
          toOffset: c.toOffset,
          toIsPercentage: false,
        })),
        { tangentMode }
      ),
    [lines, curves, tangentMode]
  )

  /**
   * Update a line and cascade-recompute all bezier curves that reference it.
   * Called on every mousemove during line endpoint/body drag for real-time feedback.
   */
  function handleLineUpdate(updatedLine: Line) {
    const updatedLines = lines.map(l => (l.id === updatedLine.id ? updatedLine : l))

    const updatedCurves = curves.map(curve => {
      if (curve.fromLineId !== updatedLine.id && curve.toLineId !== updatedLine.id) {
        return curve
      }
      const fromLine =
        curve.fromLineId === updatedLine.id
          ? updatedLine
          : updatedLines.find(l => l.id === curve.fromLineId)
      const toLine =
        curve.toLineId === updatedLine.id
          ? updatedLine
          : updatedLines.find(l => l.id === curve.toLineId)
      if (!fromLine || !toLine) return curve
      try {
        const bezier = createBezierCurve(
          fromLine,
          toLine,
          { tangentMode },
          {
            fromOffset: curve.fromOffset,
            fromIsPercentage: false,
            toOffset: curve.toOffset,
            toIsPercentage: false,
          }
        )
        return { ...curve, bezier }
      } catch {
        return curve
      }
    })

    const updatedVehicles = vehicles.map(v => ({
      ...v,
      axles: v.axles.map(a =>
        a.lineId === updatedLine.id
          ? { ...a, position: getPositionFromOffset(updatedLine, a.offset) }
          : a
      ),
    }))

    const updatedEndPoints: Record<string, VehicleEndPoint> = {}
    for (const [vId, ep] of Object.entries(vehicleEndPoints)) {
      if (ep.lineId === updatedLine.id) {
        const vehicle = updatedVehicles.find(v => v.id === vId)
        if (!vehicle) { updatedEndPoints[vId] = ep; continue }
        const axleStates = calculateInitialAxlePositions(updatedLine.id, ep.offset, vehicle.axleSpacings, updatedLine)
        updatedEndPoints[vId] = {
          ...ep,
          axles: axleStates.map(a => ({ offset: a.absoluteOffset, position: a.position })),
        }
      } else {
        updatedEndPoints[vId] = ep
      }
    }

    setLines(updatedLines)
    setCurves(updatedCurves)
    setVehicles(updatedVehicles)
    setVehicleEndPoints(updatedEndPoints)
  }

  /**
   * Update a curve (e.g. after its attachment point was dragged).
   * The new bezier is already computed in Canvas before this is called.
   */
  function handleCurveUpdate(updatedCurve: StoredCurve) {
    setCurves(prev => prev.map(c => (c.id === updatedCurve.id ? updatedCurve : c)))
  }

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

  function handleCurveDelete(curveId: string) {
    setCurves(prev => prev.filter(c => c.id !== curveId))
  }

  function handleVehicleSelect(id: string | null) {
    setSelectedVehicleId(id)
  }

  function handleVehicleEndSet(vehicleId: string, lineId: string, offset: number) {
    const line = lines.find(l => l.id === lineId)
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (!line || !vehicle) return
    const axleStates = calculateInitialAxlePositions(lineId, offset, vehicle.axleSpacings, line)
    setVehicleEndPoints(prev => ({
      ...prev,
      [vehicleId]: {
        lineId,
        offset,
        axles: axleStates.map(a => ({ offset: a.absoluteOffset, position: a.position })),
      },
    }))
  }

  function handleVehicleRemove(vehicleId: string) {
    setVehicles(prev => prev.filter(v => v.id !== vehicleId))
    setVehicleEndPoints(prev => {
      const next = { ...prev }
      delete next[vehicleId]
      return next
    })
    setSelectedVehicleId(prev => prev === vehicleId ? null : prev)
  }

  function handleVehicleEndDelete(vehicleId: string) {
    setVehicleEndPoints(prev => {
      const next = { ...prev }
      delete next[vehicleId]
      return next
    })
  }

  function handleVehiclePlay(vehicleId: string) {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    const endPoint = vehicleEndPoints[vehicleId]
    if (!vehicle || !endPoint) return

    const engine = new PathEngine({ tangentMode })
    engine.setScene(lines, curves.map(c => ({
      fromLineId: c.fromLineId,
      toLineId: c.toLineId,
      fromOffset: c.fromOffset,
      fromIsPercentage: false,
      toOffset: c.toOffset,
      toIsPercentage: false,
    })))
    engineRef.current = engine

    const rearAxle = vehicle.axles[vehicle.axles.length - 1]
    const state = engine.initializeVehicle(rearAxle.lineId, rearAxle.offset, vehicle)
    if (!state) return

    const exec = engine.preparePath(state, endPoint.lineId, endPoint.offset)
    if (!exec) return

    vehicleOriginRef.current = vehicle
    animStateRef.current = { vehicleId, state, exec, accelState: { currentSpeed: 0 } }
    lastTimestampRef.current = null
    setVehicleOriginId(vehicleId)
    setAnimatingVehicleId(vehicleId)
  }

  function handleVehicleReset(vehicleId: string) {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setAnimatingVehicleId(null)
    animStateRef.current = null
    const origin = vehicleOriginRef.current
    if (origin && origin.id === vehicleId) {
      setVehicles(prev => prev.map(v => v.id === vehicleId ? origin : v))
      vehicleOriginRef.current = null
      setVehicleOriginId(null)
    }
  }

  // ── Animation RAF loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!animatingVehicleId) return

    function tick(timestamp: number) {
      const anim = animStateRef.current
      const engine = engineRef.current
      if (!anim || !engine) return

      const last = lastTimestampRef.current
      lastTimestampRef.current = timestamp
      if (last === null) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const deltaTime = Math.min((timestamp - last) / 1000, 0.1)
      const linesMap = new Map(engine.lines.map(l => [l.id, l]))
      const accelConfig: AccelerationConfig = {
        acceleration: vehicleSpeedRef.current * 0.3,
        deceleration: vehicleSpeedRef.current * 0.2,
        maxSpeed: vehicleSpeedRef.current,
        minCurveSpeed: Math.max(10, vehicleSpeedRef.current * 0.3),
      }
      const result = moveVehicleWithAcceleration(anim.state, anim.exec, anim.accelState, accelConfig, deltaTime, linesMap)
      animStateRef.current = { ...anim, state: result.state, exec: result.execution, accelState: result.accelState }

      setVehicles(prev => prev.map(v =>
        v.id === anim.vehicleId
          ? { ...v, axles: result.state.axles.map(a => ({ lineId: a.lineId, offset: a.offset, position: a.position })) }
          : v
      ))

      if (result.arrived) {
        setAnimatingVehicleId(null)
        animStateRef.current = null
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [animatingVehicleId])

  function handleCopySnapshot() {
    const json = serializeScene(lines, curves)
    navigator.clipboard.writeText(json)
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: '#080a0e',
      }}
    >
      {/* Canvas — 3/4 width */}
      <div style={{ flex: 3, position: 'relative', overflow: 'hidden' }}>
        <Canvas
          lines={lines}
          curves={curves}
          vehicles={vehicles}
          mode={mode}
          axleSpacings={axleSpacings}
          tangentMode={tangentMode}
          graph={graph}
          selectedVehicleId={selectedVehicleId}
          vehicleEndPoints={vehicleEndPoints}
          onLineAdd={line => setLines(prev => [...prev, line])}
          onCurveAdd={curve => setCurves(prev => [...prev, curve])}
          onLineUpdate={handleLineUpdate}
          onCurveUpdate={handleCurveUpdate}
          onVehicleAdd={vehicle => setVehicles(prev => [...prev, vehicle])}
          onVehicleUpdate={vehicle => setVehicles(prev => prev.map(v => v.id === vehicle.id ? vehicle : v))}
          onVehicleSelect={handleVehicleSelect}
          onVehicleEndSet={handleVehicleEndSet}
          locked={animatingVehicleId !== null}
        />
      </div>

      {/* Panel — 1/4 width */}
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
    </div>
  )
}
