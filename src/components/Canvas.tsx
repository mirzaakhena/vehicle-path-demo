import { useState, useRef, useEffect } from 'react'
import type { Line, Point, BezierCurve, TangentMode } from 'vehicle-path2/core'
import { createBezierCurve, getLineLength, distance as libDistance } from 'vehicle-path2/core'
import type { Mode, StoredCurve } from '../types'
import { projectPointOnLine, getPointAtOffset } from '../geometry'

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

type ActiveDrag =
  | { type: 'line-start'; lineId: string; minLength: number }
  | { type: 'line-end';   lineId: string; minLength: number }
  | { type: 'line-body';  lineId: string; startMouse: Point; originalStart: Point; originalEnd: Point }
  | { type: 'curve-from'; curveId: string; fromLineId: string; toLineId: string }
  | { type: 'curve-to';   curveId: string; fromLineId: string; toLineId: string }

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

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  lines: Line[]
  curves: StoredCurve[]
  mode: Mode
  wheelbase: number
  tangentMode: TangentMode
  onLineAdd: (line: Line) => void
  onCurveAdd: (curve: StoredCurve) => void
  onLineUpdate: (line: Line) => void
  onCurveUpdate: (curve: StoredCurve) => void
}

// ─── ID generator ────────────────────────────────────────────────────────────

let lineSeq = 0
let curveSeq = 0
const nextLineId  = () => `line-${++lineSeq}`
const nextCurveId = () => `curve-${++curveSeq}`

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
  mode,
  wheelbase,
  tangentMode,
  onLineAdd,
  onCurveAdd,
  onLineUpdate,
  onCurveUpdate,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Always-fresh refs for use in event handlers (avoids stale closures)
  const linesRef        = useRef(lines);        linesRef.current        = lines
  const curvesRef       = useRef(curves);       curvesRef.current       = curves
  const wheelbaseRef    = useRef(wheelbase);    wheelbaseRef.current    = wheelbase
  const tangentModeRef  = useRef(tangentMode);  tangentModeRef.current  = tangentMode

  // ── State ─────────────────────────────────────────────────────────────────
  const [lineDrawing, setLineDrawing] = useState<LineDrawing | null>(null)
  const [curveHover,  setCurveHover]  = useState<HoverState | null>(null)
  const [curveDrag,   setCurveDrag]   = useState<CurveDrag | null>(null)
  const [activeDrag,  setActiveDrag]  = useState<ActiveDrag | null>(null)
  const [dragHover,   setDragHover]   = useState<DragHover | null>(null)
  const [mousePos,    setMousePos]    = useState<Point | null>(null)

  // Clear all mode-specific state when mode switches
  useEffect(() => {
    setLineDrawing(null)
    setCurveHover(null)
    setCurveDrag(null)
    setActiveDrag(null)
    setDragHover(null)
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
        best = { line, offset, point: getPointAtOffset(line, offset), dist: distance }
      }
    }
    return best ? { line: best.line, offset: best.offset, point: best.point } : null
  }

  /**
   * Compute the minimum allowed length for a line so that all attached
   * curve offsets remain within valid range.
   *
   * - As FROM line: fromOffset must be <= lineLength  → min = max(fromOffsets)
   * - As TO   line: toOffset + wheelbase <= lineLength → min = max(toOffsets + wb)
   */
  function computeMinLineLength(lineId: string): number {
    const wb = wheelbaseRef.current
    let min = 5  // always allow at least 5px
    for (const curve of curvesRef.current) {
      if (curve.fromLineId === lineId) {
        min = Math.max(min, curve.fromOffset)
      }
      if (curve.toLineId === lineId) {
        min = Math.max(min, curve.toOffset + wb)
      }
    }
    return min
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

  // ── Event handlers ─────────────────────────────────────────────────────────

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const mouse = getSvgPos(e)

    // ── Drag mode ──
    if (mode === 'drag') {
      const target = findDragHoverTarget(mouse)
      if (!target) return

      if (target.type === 'line-start') {
        setActiveDrag({
          type: 'line-start',
          lineId: target.lineId,
          minLength: computeMinLineLength(target.lineId),
        })
      } else if (target.type === 'line-end') {
        setActiveDrag({
          type: 'line-end',
          lineId: target.lineId,
          minLength: computeMinLineLength(target.lineId),
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
      }
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
        const wb  = wheelbaseRef.current
        if (hit.offset >= wb && hit.offset <= len) {
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
  }

  function handleMouseMove(e: React.MouseEvent) {
    const mouse = getSvgPos(e)
    setMousePos(mouse)

    // ── Drag mode ──
    if (mode === 'drag') {
      if (activeDrag) {
        const wb = wheelbaseRef.current
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
          // Valid from-range: [wheelbase, lineLength]
          const clamped = Math.max(wb, Math.min(offset, fromLen))
          try {
            const bezier = createBezierCurve(
              fromLine, toLine,
              { wheelbase: wb, tangentMode: tm },
              false,
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
          const validMax   = toLen - wb
          if (validMax > 0) {
            // Valid to-range: [0, lineLength - wheelbase]
            const clamped = Math.max(0, Math.min(offset, validMax))
            try {
              const bezier = createBezierCurve(
                fromLine, toLine,
                { wheelbase: wb, tangentMode: tm },
                false,
                { fromOffset: curve.fromOffset, fromIsPercentage: false, toOffset: clamped, toIsPercentage: false }
              )
              onCurveUpdate({ ...curve, toOffset: clamped, bezier })
            } catch { /* degenerate geometry — skip */ }
          }
        }
      } else {
        // No active drag — update hover highlight
        setDragHover(findDragHoverTarget(mouse))
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

    // ── Curve mode ──
    if (mode === 'curve') {
      if (curveDrag) {
        const wb = wheelbaseRef.current
        const tm = tangentModeRef.current
        const hit = findLineHit(mouse, curveDrag.fromLineId)

        if (hit) {
          const len      = getLineLength(hit.line)
          const validMax = len - wb
          if (validMax > 0 && hit.offset >= 0 && hit.offset <= validMax) {
            const fromLine = linesRef.current.find(l => l.id === curveDrag.fromLineId)!
            try {
              const bezier = createBezierCurve(
                fromLine, hit.line,
                { wheelbase: wb, tangentMode: tm },
                false,
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
          const wb  = wheelbaseRef.current
          if (hit.offset >= wb && hit.offset <= len) {
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
    if (e.button !== 0) return

    if (mode === 'drag') {
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
    if (mode === 'line')  setLineDrawing(null)
    if (mode === 'curve') { setCurveHover(null); setCurveDrag(null) }
  }

  // ── Cursor ────────────────────────────────────────────────────────────────

  let cursor = 'default'
  if (mode === 'drag') {
    if (activeDrag) cursor = 'grabbing'
    else if (dragHover) cursor = 'grab'
  } else if (mode === 'line') {
    cursor = 'crosshair'
  } else if (mode === 'curve') {
    cursor = curveHover || curveDrag ? 'crosshair' : 'default'
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
