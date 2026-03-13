import { useState, useRef, useEffect } from 'react'
import type { Line, Point, BezierCurve, TangentMode, Graph, Curve } from 'vehicle-path2/core'
import { createBezierCurve, getLineLength, distance as libDistance, calculateInitialAxlePositions, findPath, projectPointOnLine, getPositionFromOffset, computeMinLineLength, getValidRearOffsetRange } from 'vehicle-path2/core'
import type { Mode, StoredCurve, PlacedVehicle, VehicleEndPoint } from '../types'

// ─── Hit detection radii ─────────────────────────────────────────────────────

const ENDPOINT_HIT_R = 10  // radius for line/curve endpoints
const LINE_HIT_D     = 12  // perpendicular distance for line body

// ─── Drag mode types ─────────────────────────────────────────────────────────

type DragHover =
  | { type: 'line-start'; lineId: string }
  | { type: 'line-end';   lineId: string }
  | { type: 'line-body';  lineId: string }
  | { type: 'curve-from'; curveId: string }
  | { type: 'curve-to';   curveId: string }
  | { type: 'vehicle-body'; vehicleId: string }
  | { type: 'vehicle-end'; vehicleId: string }

type ActiveDrag =
  | { type: 'line-start'; lineId: string; minLength: number }
  | { type: 'line-end';   lineId: string; minLength: number }
  | { type: 'line-body';  lineId: string; startMouse: Point; originalStart: Point; originalEnd: Point }
  | { type: 'curve-from'; curveId: string; fromLineId: string; toLineId: string }
  | { type: 'curve-to';   curveId: string; fromLineId: string; toLineId: string }
  | { type: 'vehicle-body'; vehicleId: string; lineId: string }
  | { type: 'vehicle-end'; vehicleId: string }

// ─── Curve draw types ────────────────────────────────────────────────────────

interface HoverState {
  lineId: string
  offset: number
  point: Point
}

interface LineDrawing {
  start: Point
  current: Point
}

interface CurveDrag {
  fromLineId: string
  fromOffset: number
  fromPoint: Point
  currentMouse: Point
  toHover: {
    lineId: string
    offset: number
    point: Point
    bezier: BezierCurve
  } | null
}

// ─── Vehicle hover preview ────────────────────────────────────────────────────

interface VehicleHover {
  lineId: string
  axles: Array<{ offset: number; position: Point }>
  axleSpacings: number[]
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  lines: Line[]
  curves: StoredCurve[]
  vehicles: PlacedVehicle[]
  mode: Mode
  axleSpacings: number[]
  tangentMode: TangentMode
  graph: Graph
  selectedVehicleId: string | null
  vehicleEndPoints: Record<string, VehicleEndPoint>
  onLineAdd: (line: Line) => void
  onCurveAdd: (curve: StoredCurve) => void
  onLineUpdate: (line: Line) => void
  onCurveUpdate: (curve: StoredCurve) => void
  onVehicleAdd: (vehicle: PlacedVehicle) => void
  onVehicleUpdate: (vehicle: PlacedVehicle) => void
  onVehicleSelect: (id: string | null) => void
  onVehicleEndSet: (vehicleId: string, lineId: string, offset: number) => void
  locked: boolean
}

// ─── ID generator ────────────────────────────────────────────────────────────

let lineSeq    = 0
let curveSeq   = 0
let vehicleSeq = 0
const nextLineId    = () => `line-${++lineSeq}`
const nextCurveId   = () => `curve-${++curveSeq}`
const nextVehicleId = () => `vehicle-${++vehicleSeq}`

// ─── Pure helpers ────────────────────────────────────────────────────────────

function bezierPath(b: BezierCurve): string {
  return `M ${b.p0.x} ${b.p0.y} C ${b.p1.x} ${b.p1.y}, ${b.p2.x} ${b.p2.y}, ${b.p3.x} ${b.p3.y}`
}

/**
 * Compute the arrowhead geometry for a line.
 * Returns the line body end point and the triangle points string.
 */
function lineArrow(line: Line) {
  const dx = line.end.x - line.start.x
  const dy = line.end.y - line.start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 2) return null
  const ux = dx / len
  const uy = dy / len
  const perpX = -uy
  const perpY = ux
  const arrowLen  = 11
  const arrowHalf = 4.5
  const bx = line.end.x - ux * arrowLen
  const by = line.end.y - uy * arrowLen
  const pts = [
    `${line.end.x},${line.end.y}`,
    `${bx + perpX * arrowHalf},${by + perpY * arrowHalf}`,
    `${bx - perpX * arrowHalf},${by - perpY * arrowHalf}`,
  ].join(' ')
  return { bodyEndX: bx, bodyEndY: by, arrowPts: pts }
}

/**
 * Clamp `proposed` so that distance(result, anchor) >= minDist.
 * Used to enforce minimum line length during endpoint drag.
 */
function clampEndpoint(proposed: Point, anchor: Point, minDist: number): Point {
  const dx   = proposed.x - anchor.x
  const dy   = proposed.y - anchor.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist >= minDist || minDist <= 0) return proposed
  if (dist < 0.001) return { x: anchor.x + minDist, y: anchor.y }
  const scale = minDist / dist
  return { x: anchor.x + dx * scale, y: anchor.y + dy * scale }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Canvas({
  lines,
  curves,
  vehicles,
  mode,
  axleSpacings,
  tangentMode,
  graph,
  selectedVehicleId,
  vehicleEndPoints,
  onLineAdd,
  onCurveAdd,
  onLineUpdate,
  onCurveUpdate,
  onVehicleAdd,
  onVehicleUpdate,
  onVehicleSelect,
  onVehicleEndSet,
  locked,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Always-fresh refs for use in event handlers (avoids stale closures)
  const linesRef              = useRef(lines);              linesRef.current              = lines
  const curvesRef             = useRef(curves);             curvesRef.current             = curves
  const vehiclesRef           = useRef(vehicles);           vehiclesRef.current           = vehicles
  const axleSpacingsRef       = useRef(axleSpacings);       axleSpacingsRef.current       = axleSpacings
  const tangentModeRef        = useRef(tangentMode);        tangentModeRef.current        = tangentMode
  const graphRef              = useRef(graph);              graphRef.current              = graph
  const selectedVehicleIdRef  = useRef(selectedVehicleId);  selectedVehicleIdRef.current  = selectedVehicleId
  const vehicleEndPointsRef   = useRef(vehicleEndPoints);   vehicleEndPointsRef.current   = vehicleEndPoints

  // ── State ─────────────────────────────────────────────────────────────────
  const [lineDrawing,      setLineDrawing]      = useState<LineDrawing | null>(null)
  const [curveHover,       setCurveHover]       = useState<HoverState | null>(null)
  const [curveDrag,        setCurveDrag]        = useState<CurveDrag | null>(null)
  const [activeDrag,       setActiveDrag]       = useState<ActiveDrag | null>(null)
  const [dragHover,        setDragHover]        = useState<DragHover | null>(null)
  const [vehicleHover,     setVehicleHover]     = useState<VehicleHover | null>(null)
  const [vehicleEndHover,  setVehicleEndHover]  = useState<{ lineId: string; offset: number; axles: Array<{ offset: number; position: Point }>; isValid: boolean } | null>(null)
  const [mousePos,         setMousePos]         = useState<Point | null>(null)

  // Clear all mode-specific state when mode switches
  useEffect(() => {
    setLineDrawing(null)
    setCurveHover(null)
    setCurveDrag(null)
    setActiveDrag(null)
    setDragHover(null)
    setVehicleHover(null)
    setVehicleEndHover(null)
  }, [mode])

  // ── Utilities ──────────────────────────────────────────────────────────────

  function getSvgPos(e: React.MouseEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** Find the line closest to mouse within LINE_HIT_D, optionally excluding one. */
  function findLineHit(
    mouse: Point,
    excludeId?: string
  ): { line: Line; offset: number; point: Point } | null {
    let best: { line: Line; offset: number; point: Point; dist: number } | null = null
    for (const line of linesRef.current) {
      if (line.id === excludeId) continue
      const { offset, distance } = projectPointOnLine(mouse, line)
      if (distance < LINE_HIT_D && (best === null || distance < best.dist)) {
        best = { line, offset, point: getPositionFromOffset(line, offset), dist: distance }
      }
    }
    return best ? { line: best.line, offset: best.offset, point: best.point } : null
  }

  /**
   * Determine what draggable element is under the cursor.
   * Priority: curve endpoints > line endpoints > line body.
   */
  function findDragHoverTarget(mouse: Point): DragHover | null {
    // 1. Curve attachment points (smallest targets — check first)
    for (const curve of curvesRef.current) {
      if (libDistance(mouse, curve.bezier.p0) < ENDPOINT_HIT_R) {
        return { type: 'curve-from', curveId: curve.id }
      }
      if (libDistance(mouse, curve.bezier.p3) < ENDPOINT_HIT_R) {
        return { type: 'curve-to', curveId: curve.id }
      }
    }
    // 2. Line endpoints
    for (const line of linesRef.current) {
      if (libDistance(mouse, line.start) < ENDPOINT_HIT_R) {
        return { type: 'line-start', lineId: line.id }
      }
      if (libDistance(mouse, line.end) < ENDPOINT_HIT_R) {
        return { type: 'line-end', lineId: line.id }
      }
    }
    // 3. Line body
    for (const line of linesRef.current) {
      const { distance } = projectPointOnLine(mouse, line)
      if (distance < LINE_HIT_D) {
        return { type: 'line-body', lineId: line.id }
      }
    }
    return null
  }

  function findVehicleHit(point: Point): PlacedVehicle | null {
    const HIT_R = 12
    for (const v of vehiclesRef.current) {
      for (const axle of v.axles) {
        if (libDistance(point, axle.position) <= HIT_R) return v
      }
      for (let i = 0; i < v.axles.length - 1; i++) {
        const a = v.axles[i], b = v.axles[i + 1]
        const { distance: d } = projectPointOnLine(point, { id: '', start: a.position, end: b.position })
        if (d <= HIT_R) return v
      }
    }
    return null
  }

  function findVehicleEndHit(point: Point): string | null {
    const HIT_R = 12
    for (const [vId, ep] of Object.entries(vehicleEndPointsRef.current)) {
      for (const axle of ep.axles) {
        if (libDistance(point, axle.position) <= HIT_R) return vId
      }
    }
    return null
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || locked) return
    const mouse = getSvgPos(e)

    // ── Drag mode ──
    if (mode === 'drag') {
      const target = findDragHoverTarget(mouse)
      if (!target) {
        // ── Vehicle click selection ──
        const hitVehicle = findVehicleHit(mouse)
        if (hitVehicle) {
          onVehicleSelect(selectedVehicleId === hitVehicle.id ? null : hitVehicle.id)
          return
        }
        if (selectedVehicleId) {
          onVehicleSelect(null)
        }
        return
      }

      if (target.type === 'line-start') {
        setActiveDrag({
          type: 'line-start',
          lineId: target.lineId,
          // Math.max(5, ...) preserves the 5px floor that was hardcoded in the old local function
          minLength: Math.max(5, computeMinLineLength(target.lineId, curvesRef.current as Curve[])),
        })
      } else if (target.type === 'line-end') {
        setActiveDrag({
          type: 'line-end',
          lineId: target.lineId,
          // Math.max(5, ...) preserves the 5px floor that was hardcoded in the old local function
          minLength: Math.max(5, computeMinLineLength(target.lineId, curvesRef.current as Curve[])),
        })
      } else if (target.type === 'line-body') {
        const line = linesRef.current.find(l => l.id === target.lineId)!
        setActiveDrag({
          type: 'line-body',
          lineId: target.lineId,
          startMouse: mouse,
          originalStart: { ...line.start },
          originalEnd: { ...line.end },
        })
      } else if (target.type === 'curve-from') {
        const curve = curvesRef.current.find(c => c.id === target.curveId)!
        setActiveDrag({
          type: 'curve-from',
          curveId: curve.id,
          fromLineId: curve.fromLineId,
          toLineId: curve.toLineId,
        })
      } else if (target.type === 'curve-to') {
        const curve = curvesRef.current.find(c => c.id === target.curveId)!
        setActiveDrag({
          type: 'curve-to',
          curveId: curve.id,
          fromLineId: curve.fromLineId,
          toLineId: curve.toLineId,
        })
      } else if (target.type === 'vehicle-end') {
        setActiveDrag({ type: 'vehicle-end', vehicleId: target.vehicleId })
      } else if (target.type === 'vehicle-body') {
        const vehicle = vehiclesRef.current.find(v => v.id === target.vehicleId)
        if (vehicle) {
          const rearmost = vehicle.axles[vehicle.axles.length - 1]
          setActiveDrag({ type: 'vehicle-body', vehicleId: vehicle.id, lineId: rearmost.lineId })
          onVehicleSelect(vehicle.id)
        }
      }
      return
    }

    // ── Vehicle End mode ──
    if (mode === 'vehicle-end') {
      const selId = selectedVehicleId
      if (!selId || !vehicleEndHover?.isValid) return
      onVehicleEndSet(selId, vehicleEndHover.lineId, vehicleEndHover.offset)
      return
    }

    // ── Line mode ──
    if (mode === 'line') {
      setLineDrawing({ start: mouse, current: mouse })
      return
    }

    // ── Curve mode ──
    if (mode === 'curve') {
      const hit = findLineHit(mouse)
      if (hit) {
        const len = getLineLength(hit.line)
        if (hit.offset <= len) {
          setCurveDrag({
            fromLineId: hit.line.id,
            fromOffset: hit.offset,
            fromPoint: hit.point,
            currentMouse: mouse,
            toHover: null,
          })
          setCurveHover(null)
        }
      }
    }

    // ── Vehicle Start mode ──
    if (mode === 'vehicle-start' && vehicleHover) {
      onVehicleAdd({
        id: nextVehicleId(),
        axles: vehicleHover.axles.map(a => ({ lineId: vehicleHover.lineId, offset: a.offset, position: a.position })),
        axleSpacings: vehicleHover.axleSpacings,
      })
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (locked) return
    const mouse = getSvgPos(e)
    setMousePos(mouse)

    // ── Drag mode ──
    if (mode === 'drag') {
      if (activeDrag) {
        const tm = tangentModeRef.current

        if (activeDrag.type === 'line-start') {
          const line = linesRef.current.find(l => l.id === activeDrag.lineId)!
          const clampedStart = clampEndpoint(mouse, line.end, activeDrag.minLength)
          onLineUpdate({ ...line, start: clampedStart })

        } else if (activeDrag.type === 'line-end') {
          const line = linesRef.current.find(l => l.id === activeDrag.lineId)!
          const clampedEnd = clampEndpoint(mouse, line.start, activeDrag.minLength)
          onLineUpdate({ ...line, end: clampedEnd })

        } else if (activeDrag.type === 'line-body') {
          const delta = {
            x: mouse.x - activeDrag.startMouse.x,
            y: mouse.y - activeDrag.startMouse.y,
          }
          onLineUpdate({
            id: activeDrag.lineId,
            start: { x: activeDrag.originalStart.x + delta.x, y: activeDrag.originalStart.y + delta.y },
            end:   { x: activeDrag.originalEnd.x   + delta.x, y: activeDrag.originalEnd.y   + delta.y },
          })

        } else if (activeDrag.type === 'curve-from') {
          const curve    = curvesRef.current.find(c => c.id === activeDrag.curveId)!
          const fromLine = linesRef.current.find(l => l.id === activeDrag.fromLineId)!
          const toLine   = linesRef.current.find(l => l.id === activeDrag.toLineId)!
          const { offset } = projectPointOnLine(mouse, fromLine)
          const fromLen    = getLineLength(fromLine)
          const clamped = Math.max(0, Math.min(offset, fromLen))
          try {
            const bezier = createBezierCurve(
              fromLine, toLine,
              { tangentMode: tm },
              { fromOffset: clamped, fromIsPercentage: false, toOffset: curve.toOffset, toIsPercentage: false }
            )
            onCurveUpdate({ ...curve, fromOffset: clamped, bezier })
          } catch { /* degenerate geometry — skip */ }

        } else if (activeDrag.type === 'curve-to') {
          const curve    = curvesRef.current.find(c => c.id === activeDrag.curveId)!
          const fromLine = linesRef.current.find(l => l.id === activeDrag.fromLineId)!
          const toLine   = linesRef.current.find(l => l.id === activeDrag.toLineId)!
          const { offset } = projectPointOnLine(mouse, toLine)
          const toLen      = getLineLength(toLine)
          const clamped = Math.max(0, Math.min(offset, toLen))
          try {
            const bezier = createBezierCurve(
              fromLine, toLine,
              { tangentMode: tm },
              { fromOffset: curve.fromOffset, fromIsPercentage: false, toOffset: clamped, toIsPercentage: false }
            )
            onCurveUpdate({ ...curve, toOffset: clamped, bezier })
          } catch { /* degenerate geometry — skip */ }

        } else if (activeDrag.type === 'vehicle-body') {
          const vehicle = vehiclesRef.current.find(v => v.id === activeDrag.vehicleId)
          const line = linesRef.current.find(l => l.id === activeDrag.lineId)
          if (!vehicle || !line) return
          const { offset } = projectPointOnLine(mouse, line)
          const [, maxOffset] = getValidRearOffsetRange(line, vehicle.axleSpacings)
          const rearOffset = Math.max(0, Math.min(offset, maxOffset))
          const axleStates = calculateInitialAxlePositions(line.id, rearOffset, vehicle.axleSpacings, line)
          onVehicleUpdate({
            ...vehicle,
            axles: axleStates.map(a => ({ lineId: line.id, offset: a.absoluteOffset, position: a.position })),
          })

        } else if (activeDrag.type === 'vehicle-end') {
          const vehicle = vehiclesRef.current.find(v => v.id === activeDrag.vehicleId)
          if (!vehicle) return
          const hit = findLineHit(mouse)
          if (hit) {
            const [, maxOffset] = getValidRearOffsetRange(hit.line, vehicle.axleSpacings)
            const lineLen = getLineLength(hit.line)
            const rearOffset = hit.offset
            if (rearOffset < 0 || rearOffset > maxOffset) {
              setVehicleEndHover(null); return
            }
            const frontEndOffset = rearOffset + (lineLen - maxOffset)
            const front = vehicle.axles[0]
            const path = findPath(
              graphRef.current,
              { lineId: front.lineId, offset: front.offset },
              hit.line.id,
              frontEndOffset
            )
            const axleStates = calculateInitialAxlePositions(hit.line.id, rearOffset, vehicle.axleSpacings, hit.line)
            setVehicleEndHover({
              lineId: hit.line.id,
              offset: rearOffset,
              axles: axleStates.map(a => ({ offset: a.absoluteOffset, position: a.position })),
              isValid: path !== null,
            })
          } else {
            setVehicleEndHover(null)
          }
        }
      } else {
        // No active drag — update hover highlight
        const dragHoverTarget = findDragHoverTarget(mouse)
        if (dragHoverTarget) {
          setDragHover(dragHoverTarget)
        } else {
          // Check vehicle end markers first (higher priority than body)
          const hitEndVehicleId = findVehicleEndHit(mouse)
          if (hitEndVehicleId) {
            setDragHover({ type: 'vehicle-end', vehicleId: hitEndVehicleId })
          } else {
            const hitVehicle = findVehicleHit(mouse)
            setDragHover(hitVehicle ? { type: 'vehicle-body', vehicleId: hitVehicle.id } : null)
          }
        }
      }
      return
    }

    // ── Line mode ──
    if (mode === 'line') {
      if (lineDrawing) {
        setLineDrawing(prev => (prev ? { ...prev, current: mouse } : null))
      }
      return
    }

    // ── Vehicle End mode ──
    if (mode === 'vehicle-end') {
      const selId = selectedVehicleIdRef.current
      if (!selId) { setVehicleEndHover(null); return }
      const vehicle = vehiclesRef.current.find(v => v.id === selId)
      if (!vehicle) { setVehicleEndHover(null); return }
      const hit = findLineHit(mouse)
      if (hit) {
        const [, maxOffset] = getValidRearOffsetRange(hit.line, vehicle.axleSpacings)
        const lineLen = getLineLength(hit.line)
        const rearOffset = hit.offset
        if (rearOffset < 0 || rearOffset > maxOffset) {
          setVehicleEndHover(null); return
        }
        const frontEndOffset = rearOffset + (lineLen - maxOffset)
        const front = vehicle.axles[0]
        const path = findPath(
          graphRef.current,
          { lineId: front.lineId, offset: front.offset },
          hit.line.id,
          frontEndOffset
        )
        const axleStates = calculateInitialAxlePositions(hit.line.id, rearOffset, vehicle.axleSpacings, hit.line)
        setVehicleEndHover({
          lineId: hit.line.id,
          offset: rearOffset,
          axles: axleStates.map(a => ({ offset: a.absoluteOffset, position: a.position })),
          isValid: path !== null,
        })
      } else {
        setVehicleEndHover(null)
      }
      return
    }

    // ── Vehicle Start mode ──
    if (mode === 'vehicle-start') {
      const hit = findLineHit(mouse)
      if (hit) {
        const spacings    = axleSpacingsRef.current
        const totalSpacing = spacings.reduce((s, v) => s + v, 0)
        const validMax    = getLineLength(hit.line) - totalSpacing
        if (validMax > 0 && hit.offset >= 0 && hit.offset <= validMax) {
          const axleStates = calculateInitialAxlePositions(hit.line.id, hit.offset, spacings, hit.line)
          setVehicleHover({
            lineId: hit.line.id,
            axles: axleStates.map(a => ({ offset: a.absoluteOffset, position: a.position })),
            axleSpacings: spacings,
          })
        } else {
          setVehicleHover(null)
        }
      } else {
        setVehicleHover(null)
      }
      return
    }

    // ── Curve mode ──
    if (mode === 'curve') {
      if (curveDrag) {
        const tm = tangentModeRef.current
        const hit = findLineHit(mouse, curveDrag.fromLineId)

        if (hit) {
          const len = getLineLength(hit.line)
          if (hit.offset >= 0 && hit.offset <= len) {
            const fromLine = linesRef.current.find(l => l.id === curveDrag.fromLineId)!
            try {
              const bezier = createBezierCurve(
                fromLine, hit.line,
                { tangentMode: tm },
                { fromOffset: curveDrag.fromOffset, fromIsPercentage: false, toOffset: hit.offset, toIsPercentage: false }
              )
              setCurveDrag(prev =>
                prev ? { ...prev, currentMouse: mouse, toHover: { lineId: hit.line.id, offset: hit.offset, point: hit.point, bezier } } : null
              )
              return
            } catch { /* fall through */ }
          }
        }
        setCurveDrag(prev => (prev ? { ...prev, currentMouse: mouse, toHover: null } : null))
      } else {
        const hit = findLineHit(mouse)
        if (hit) {
          const len = getLineLength(hit.line)
          if (hit.offset <= len) {
            setCurveHover({ lineId: hit.line.id, offset: hit.offset, point: hit.point })
          } else {
            setCurveHover(null)
          }
        } else {
          setCurveHover(null)
        }
      }
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (e.button !== 0 || locked) return

    if (mode === 'drag') {
      if (activeDrag?.type === 'vehicle-end') {
        if (vehicleEndHover?.isValid) {
          onVehicleEndSet(activeDrag.vehicleId, vehicleEndHover.lineId, vehicleEndHover.offset)
        }
        setVehicleEndHover(null)
      }
      setActiveDrag(null)
      return
    }

    if (mode === 'line' && lineDrawing) {
      const dx = lineDrawing.current.x - lineDrawing.start.x
      const dy = lineDrawing.current.y - lineDrawing.start.y
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        onLineAdd({ id: nextLineId(), start: lineDrawing.start, end: lineDrawing.current })
      }
      setLineDrawing(null)
      return
    }

    if (mode === 'curve' && curveDrag) {
      if (curveDrag.toHover) {
        onCurveAdd({
          id: nextCurveId(),
          fromLineId: curveDrag.fromLineId,
          toLineId: curveDrag.toHover.lineId,
          fromOffset: curveDrag.fromOffset,
          toOffset: curveDrag.toHover.offset,
          bezier: curveDrag.toHover.bezier,
        })
      }
      setCurveDrag(null)
    }
  }

  function handleMouseLeave() {
    setMousePos(null)
    setActiveDrag(null)
    setDragHover(null)
    if (mode === 'line')          setLineDrawing(null)
    if (mode === 'curve')         { setCurveHover(null); setCurveDrag(null) }
    if (mode === 'vehicle-start') setVehicleHover(null)
    if (mode === 'vehicle-end')   setVehicleEndHover(null)
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  let cursor = 'default'
  if (locked) {
    cursor = 'not-allowed'
  } else if (mode === 'drag') {
    if (activeDrag) cursor = 'grabbing'
    else if (dragHover) cursor = 'grab'
  } else if (mode === 'line') {
    cursor = 'crosshair'
  } else if (mode === 'curve') {
    cursor = curveHover || curveDrag ? 'crosshair' : 'default'
  } else if (mode === 'vehicle-start') {
    cursor = vehicleHover ? 'crosshair' : 'default'
  } else if (mode === 'vehicle-end') {
    cursor = vehicleEndHover?.isValid ? 'crosshair' : 'not-allowed'
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{ display: 'block', cursor, userSelect: 'none' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <defs>
        <pattern id="dot-grid" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="0.9" fill="#141720" />
        </pattern>
      </defs>

      {/* Background */}
      <rect width="100%" height="100%" fill="#06080c" />
      <rect width="100%" height="100%" fill="url(#dot-grid)" />

      {/* ── Drag mode: line body hover highlight ── */}
      {mode === 'drag' && !activeDrag && dragHover?.type === 'line-body' && (() => {
        const line = lines.find(l => l.id === dragHover.lineId)
        if (!line) return null
        return (
          <line
            x1={line.start.x} y1={line.start.y}
            x2={line.end.x}   y2={line.end.y}
            stroke="#4ade80"
            strokeWidth={6}
            strokeOpacity={0.12}
          />
        )
      })()}

      {/* ── Stored curves ── */}
      {curves.map(curve => (
        <path
          key={curve.id}
          d={bezierPath(curve.bezier)}
          stroke="#4ade80"
          strokeWidth={1.5}
          fill="none"
          strokeOpacity={0.65}
        />
      ))}

      {/* ── Placed vehicles ── */}
      {vehicles.map(v => (
        <g key={v.id}>
          {/* Body segments antara axle berurutan */}
          {v.axles.slice(0, -1).map((axle, i) => (
            <line key={i}
              x1={axle.position.x} y1={axle.position.y}
              x2={v.axles[i + 1].position.x} y2={v.axles[i + 1].position.y}
              stroke="#fb923c" strokeWidth={2.5} strokeLinecap="round"
            />
          ))}
          {/* Selection ring untuk vehicle yang dipilih */}
          {v.id === selectedVehicleId && v.axles.map((axle, i) => (
            <circle key={`sel-${i}`}
              cx={axle.position.x} cy={axle.position.y} r={9}
              fill="none" stroke="#fb923c" strokeWidth={1.5} strokeOpacity={0.6}
            />
          ))}
          {/* Tiap axle sebagai donut: axles[0]=front=amber, axles[N-1]=rear=red, mid=slate */}
          {v.axles.map((axle, i) => {
            const color = i === 0 ? '#fbbf24' : i === v.axles.length - 1 ? '#f87171' : '#94a3b8'
            return (
              <g key={i}>
                <circle cx={axle.position.x} cy={axle.position.y} r={5} fill="#06080c" stroke={color} strokeWidth={1.8} />
                <circle cx={axle.position.x} cy={axle.position.y} r={2} fill={color} />
              </g>
            )
          })}
        </g>
      ))}

      {/* ── Vehicle end markers (placed) ── */}
      {Object.entries(vehicleEndPoints).map(([vId, ep]) => (
        <g key={`end-${vId}`}>
          {/* Body segments */}
          {ep.axles.slice(0, -1).map((axle, i) => (
            <line key={i}
              x1={axle.position.x} y1={axle.position.y}
              x2={ep.axles[i + 1].position.x} y2={ep.axles[i + 1].position.y}
              stroke="#4ade80" strokeWidth={2} strokeLinecap="round" strokeOpacity={0.5}
            />
          ))}
          {/* Axle donuts */}
          {ep.axles.map((axle, i) => (
            <g key={i}>
              <circle cx={axle.position.x} cy={axle.position.y} r={5}
                fill="#06080c" stroke="#4ade80" strokeWidth={1.8} strokeOpacity={0.85} />
              <circle cx={axle.position.x} cy={axle.position.y} r={2}
                fill="#4ade80" fillOpacity={0.85} />
            </g>
          ))}
        </g>
      ))}

      {/* ── Vehicle End hover preview ── */}
      {vehicleEndHover && (() => {
        const color = vehicleEndHover.isValid ? '#4ade80' : '#f87171'
        const lastAxle = vehicleEndHover.axles[vehicleEndHover.axles.length - 1]
        return (
          <g>
            {/* Body segments */}
            {vehicleEndHover.axles.slice(0, -1).map((axle, i) => (
              <line key={i}
                x1={axle.position.x} y1={axle.position.y}
                x2={vehicleEndHover.axles[i + 1].position.x} y2={vehicleEndHover.axles[i + 1].position.y}
                stroke={color} strokeWidth={2.5} strokeLinecap="round"
                strokeOpacity={0.45} strokeDasharray="6 3"
              />
            ))}
            {/* Axle donuts */}
            {vehicleEndHover.axles.map((axle, i) => (
              <circle key={i}
                cx={axle.position.x} cy={axle.position.y} r={5}
                fill="#06080c" stroke={color} strokeWidth={1.8} strokeOpacity={0.55}
              />
            ))}
            {/* "no path" label di dekat rear axle */}
            {!vehicleEndHover.isValid && (
              <text
                x={lastAxle.position.x + 10} y={lastAxle.position.y + 4}
                fill="#f87171" fontSize={11}
                fontFamily="'JetBrains Mono', monospace" opacity={0.9}
              >
                no path
              </text>
            )}
          </g>
        )
      })()}

      {/* ── Vehicle hover preview ── */}
      {vehicleHover && (
        <g>
          {/* Body segments preview */}
          {vehicleHover.axles.slice(0, -1).map((axle, i) => (
            <line key={i}
              x1={axle.position.x} y1={axle.position.y}
              x2={vehicleHover.axles[i + 1].position.x} y2={vehicleHover.axles[i + 1].position.y}
              stroke="#fb923c" strokeWidth={2.5} strokeLinecap="round"
              strokeOpacity={0.45} strokeDasharray="6 3"
            />
          ))}
          {/* Axle donuts preview */}
          {vehicleHover.axles.map((axle, i) => {
            const color = i === 0 ? '#fbbf24' : i === vehicleHover.axles.length - 1 ? '#f87171' : '#94a3b8'
            return (
              <circle key={i} cx={axle.position.x} cy={axle.position.y} r={5} fill="#06080c" stroke={color} strokeWidth={1.8} strokeOpacity={0.55} />
            )
          })}
        </g>
      )}

      {/* ── Stored lines ── */}
      {lines.map(line => {
        const arrow = lineArrow(line)
        if (!arrow) return null
        const isBeingDragged =
          activeDrag?.type === 'line-body' && activeDrag.lineId === line.id
        const color = isBeingDragged ? '#7ae8a0' : '#5c6882'
        return (
          <g key={line.id}>
            <line
              x1={line.start.x} y1={line.start.y}
              x2={arrow.bodyEndX} y2={arrow.bodyEndY}
              stroke={color} strokeWidth={1.5}
            />
            <polygon points={arrow.arrowPts} fill={color} />
            {/* START donut */}
            <circle cx={line.start.x} cy={line.start.y} r={5.5} fill="#06080c" stroke={color} strokeWidth={1.5} />
            <circle cx={line.start.x} cy={line.start.y} r={1.8} fill={color} />
          </g>
        )
      })}

      {/* ── Drag mode: endpoint hover rings ── */}
      {mode === 'drag' && !activeDrag && dragHover && dragHover.type !== 'line-body' && (() => {
        let cx = 0, cy = 0
        if (dragHover.type === 'line-start') {
          const line = lines.find(l => l.id === dragHover.lineId)
          if (!line) return null
          cx = line.start.x; cy = line.start.y
        } else if (dragHover.type === 'line-end') {
          const line = lines.find(l => l.id === dragHover.lineId)
          if (!line) return null
          cx = line.end.x; cy = line.end.y
        } else if (dragHover.type === 'curve-from') {
          const curve = curves.find(c => c.id === dragHover.curveId)
          if (!curve) return null
          cx = curve.bezier.p0.x; cy = curve.bezier.p0.y
        } else if (dragHover.type === 'curve-to') {
          const curve = curves.find(c => c.id === dragHover.curveId)
          if (!curve) return null
          cx = curve.bezier.p3.x; cy = curve.bezier.p3.y
        }
        return (
          <circle cx={cx} cy={cy} r={13} fill="none" stroke="#4ade80" strokeWidth={1} strokeOpacity={0.45} />
        )
      })()}

      {/* ── Curve attachment dots (visible in drag mode for discoverability) ── */}
      {mode === 'drag' && curves.map(curve => (
        <g key={`pts-${curve.id}`}>
          <circle cx={curve.bezier.p0.x} cy={curve.bezier.p0.y} r={4} fill="#facc15" fillOpacity={0.7} />
          <circle cx={curve.bezier.p3.x} cy={curve.bezier.p3.y} r={4} fill="#4ade80" fillOpacity={0.7} />
        </g>
      ))}

      {/* ── Line drawing preview ── */}
      {lineDrawing && (
        <>
          <line
            x1={lineDrawing.start.x} y1={lineDrawing.start.y}
            x2={lineDrawing.current.x} y2={lineDrawing.current.y}
            stroke="#4ade80" strokeWidth={1.5} strokeDasharray="8 5" strokeOpacity={0.8}
          />
          <circle cx={lineDrawing.start.x} cy={lineDrawing.start.y} r={5.5} fill="#06080c" stroke="#4ade80" strokeWidth={1.5} />
          <circle cx={lineDrawing.start.x} cy={lineDrawing.start.y} r={1.8} fill="#4ade80" />
          <circle cx={lineDrawing.current.x} cy={lineDrawing.current.y} r={3} fill="#4ade80" fillOpacity={0.5} />
        </>
      )}

      {/* ── Curve hover dot (from-point candidate) ── */}
      {!curveDrag && curveHover && (
        <g>
          <circle cx={curveHover.point.x} cy={curveHover.point.y} r={9} fill="#facc1514" stroke="#facc15" strokeWidth={1} strokeOpacity={0.5} />
          <circle cx={curveHover.point.x} cy={curveHover.point.y} r={3.5} fill="#facc15" />
        </g>
      )}

      {/* ── Curve draw drag ── */}
      {curveDrag && (
        <>
          <circle cx={curveDrag.fromPoint.x} cy={curveDrag.fromPoint.y} r={3.5} fill="#facc15" />
          {curveDrag.toHover ? (
            <>
              <path d={bezierPath(curveDrag.toHover.bezier)} stroke="#4ade80" strokeWidth={1.5} fill="none" strokeDasharray="7 4" />
              <circle cx={curveDrag.toHover.point.x} cy={curveDrag.toHover.point.y} r={9} fill="#4ade8014" stroke="#4ade80" strokeWidth={1} strokeOpacity={0.5} />
              <circle cx={curveDrag.toHover.point.x} cy={curveDrag.toHover.point.y} r={3.5} fill="#4ade80" />
            </>
          ) : (
            <line
              x1={curveDrag.fromPoint.x} y1={curveDrag.fromPoint.y}
              x2={curveDrag.currentMouse.x} y2={curveDrag.currentMouse.y}
              stroke="#facc1580" strokeWidth={1} strokeDasharray="6 5"
            />
          )}
        </>
      )}

      {/* ── Mouse coordinates ── */}
      {mousePos && mode !== 'drag' && (
        <text
          x={mousePos.x + 14} y={mousePos.y - 10}
          fill="#2a3048" fontSize={10}
          fontFamily="JetBrains Mono, monospace"
          style={{ pointerEvents: 'none' }}
        >
          {Math.round(mousePos.x)}, {Math.round(mousePos.y)}
        </text>
      )}

      {/* ── Empty state ── */}
      {lines.length === 0 && !lineDrawing && (
        <text
          x="50%" y="50%"
          textAnchor="middle" dominantBaseline="middle"
          fill="#1c2030" fontSize={13}
          fontFamily="JetBrains Mono, monospace" letterSpacing={2}
        >
          SELECT  LINE  MODE  TO  BEGIN
        </text>
      )}
    </svg>
  )
}
