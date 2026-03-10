import { useState, useMemo, useEffect, useRef } from 'react'
import type { Line } from 'vehicle-path2/core'
import { buildGraph, createBezierCurve, serializeScene, getPositionFromOffset, calculateInitialAxlePositions, PathEngine } from 'vehicle-path2/core'
import type { VehiclePathState, PathExecution } from 'vehicle-path2/core'
import type { Mode, StoredCurve, TangentMode, PlacedVehicle, VehicleEndPoint } from './types'
import { Canvas } from './components/Canvas'
import { Panel } from './components/Panel'

export default function App() {
  const [lines, setLines] = useState<Line[]>([])
  const [curves, setCurves] = useState<StoredCurve[]>([])
  const [vehicles, setVehicles] = useState<PlacedVehicle[]>([])
  const [mode, setMode] = useState<Mode>('drag')
  const [maxWheelbase, setMaxWheelbase] = useState(10)
  const [tangentMode, setTangentMode] = useState<TangentMode>('proportional-40')
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [vehicleEndPoints, setVehicleEndPoints] = useState<Record<string, VehicleEndPoint>>({})
  const [animatingVehicleId, setAnimatingVehicleId] = useState<string | null>(null)
  const [vehicleOriginId, setVehicleOriginId] = useState<string | null>(null)
  const [vehicleSpeed, setVehicleSpeed] = useState(80)

  // ── Animation refs ──────────────────────────────────────────────────────────
  const rafRef           = useRef<number | null>(null)
  const engineRef        = useRef<PathEngine | null>(null)
  const animStateRef     = useRef<{ vehicleId: string; state: VehiclePathState; exec: PathExecution } | null>(null)
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
        { maxWheelbase, tangentMode }
      ),
    [lines, curves, maxWheelbase, tangentMode]
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
          { maxWheelbase, tangentMode },
          false,
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

    const engine = new PathEngine({ maxWheelbase, tangentMode })
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
    const state = engine.initializeVehicle(rearAxle.lineId, rearAxle.offset, vehicle.axleSpacings)
    if (!state) return

    const totalSpacing = vehicle.axleSpacings.reduce((a, b) => a + b, 0)
    const exec = engine.preparePath(state, endPoint.lineId, endPoint.offset + totalSpacing)
    if (!exec) return

    vehicleOriginRef.current = vehicle
    animStateRef.current = { vehicleId, state, exec }
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
      const result = engine.moveVehicle(anim.state, anim.exec, vehicleSpeedRef.current * deltaTime)
      animStateRef.current = { ...anim, state: result.state, exec: result.execution }

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
    const json = serializeScene(lines, curves, vehicles)
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
          maxWheelbase={maxWheelbase}
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
        maxWheelbase={maxWheelbase}
        tangentMode={tangentMode}
        lineCount={lines.length}
        curveCount={curves.length}
        vehicles={vehicles}
        vehicleEndPoints={vehicleEndPoints}
        selectedVehicleId={selectedVehicleId}
        graphNodeCount={graph.adjacency.size}
        onModeChange={setMode}
        onMaxWheelbaseChange={setMaxWheelbase}
        onTangentModeChange={setTangentMode}
        animatingVehicleId={animatingVehicleId}
        vehicleOriginId={vehicleOriginId}
        vehicleSpeed={vehicleSpeed}
        onVehicleSelect={handleVehicleSelect}
        onVehicleEndDelete={handleVehicleEndDelete}
        onVehiclePlay={handleVehiclePlay}
        onVehicleReset={handleVehicleReset}
        onVehicleSpeedChange={setVehicleSpeed}
        onCopySnapshot={handleCopySnapshot}
      />
    </div>
  )
}
