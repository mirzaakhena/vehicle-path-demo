import { useState, useMemo } from 'react'
import type { Line } from 'vehicle-path2/core'
import { buildGraph, createBezierCurve, serializeScene, getPositionFromOffset } from 'vehicle-path2/core'
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
        updatedEndPoints[vId] = { ...ep, position: getPositionFromOffset(updatedLine, ep.offset) }
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
        onVehicleSelect={handleVehicleSelect}
        onVehicleEndDelete={handleVehicleEndDelete}
        onCopySnapshot={handleCopySnapshot}
      />
    </div>
  )
}
