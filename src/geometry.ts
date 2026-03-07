import type { Line, Point } from 'vehicle-path2/core'

/**
 * Project a point onto a line segment.
 * Returns the absolute offset along the line (distance from START)
 * and the perpendicular distance from the mouse to the line.
 */
export function projectPointOnLine(
  mouse: Point,
  line: Line
): { offset: number; distance: number } {
  const dx = line.end.x - line.start.x
  const dy = line.end.y - line.start.y
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) {
    const dist = Math.sqrt(
      (mouse.x - line.start.x) ** 2 + (mouse.y - line.start.y) ** 2
    )
    return { offset: 0, distance: dist }
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((mouse.x - line.start.x) * dx + (mouse.y - line.start.y) * dy) / lenSq
    )
  )

  const projX = line.start.x + t * dx
  const projY = line.start.y + t * dy
  const distance = Math.sqrt((mouse.x - projX) ** 2 + (mouse.y - projY) ** 2)
  const offset = t * Math.sqrt(lenSq)

  return { offset, distance }
}

/**
 * Get the absolute Point at a given offset along a line.
 */
export function getPointAtOffset(line: Line, offset: number): Point {
  const dx = line.end.x - line.start.x
  const dy = line.end.y - line.start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return { x: line.start.x, y: line.start.y }
  const t = Math.max(0, Math.min(1, offset / len))
  return {
    x: line.start.x + dx * t,
    y: line.start.y + dy * t,
  }
}
