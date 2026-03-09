import { useState, useMemo } from 'react'
import type { Line } from 'vehicle-path2/core'
import { buildGraph, createBezierCurve, serializeScene } from 'vehicle-path2/core'
import type { Mode, StoredCurve, TangentMode, PlacedVehicle } from './types'
import { Canvas } from './components/Canvas'
import { Panel } from './components/Panel'

export default function App() {
  const [lines, setLines] = useState<Line[]>([])
  const [curves, setCurves] = useState<StoredCurve[]>([])
  const [vehicles, setVehicles] = useState<PlacedVehicle[]>([])
  const [mode, setMode] = useState<Mode>('drag')
  const [maxWheelbase, setMaxWheelbase] = useState(10)
  const [tangentMode, setTangentMode] = useState<TangentMode>('proportional-40')

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

    setLines(updatedLines)
    setCurves(updatedCurves)
  }

  /**
   * Update a curve (e.g. after its attachment point was dragged).
   * The new bezier is already computed in Canvas before this is called.
   */
  function handleCurveUpdate(updatedCurve: StoredCurve) {
    setCurves(prev => prev.map(c => (c.id === updatedCurve.id ? updatedCurve : c)))
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
          onLineAdd={line => setLines(prev => [...prev, line])}
          onCurveAdd={curve => setCurves(prev => [...prev, curve])}
          onLineUpdate={handleLineUpdate}
          onCurveUpdate={handleCurveUpdate}
          onVehicleAdd={vehicle => setVehicles(prev => [...prev, vehicle])}
        />
      </div>

      {/* Panel — 1/4 width */}
      <Panel
        mode={mode}
        maxWheelbase={maxWheelbase}
        tangentMode={tangentMode}
        lineCount={lines.length}
        curveCount={curves.length}
        vehicleCount={vehicles.length}
        graphNodeCount={graph.adjacency.size}
        onModeChange={setMode}
        onMaxWheelbaseChange={setMaxWheelbase}
        onTangentModeChange={setTangentMode}
        onCopySnapshot={handleCopySnapshot}
      />
    </div>
  )
}
