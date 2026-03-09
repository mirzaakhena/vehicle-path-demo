import type { BezierCurve, TangentMode, Point } from 'vehicle-path2/core'

export type Mode = 'drag' | 'line' | 'curve' | 'vehicle'

export interface StoredCurve {
  id: string
  fromLineId: string
  toLineId: string
  /** Absolute offset (px from START) on the from-line */
  fromOffset: number
  /** Absolute offset (px from START) on the to-line */
  toOffset: number
  /** Pre-computed bezier for rendering */
  bezier: BezierCurve
}

/**
 * A vehicle placed on the canvas.
 * rear = reference axle; front = always wheelbase ahead along the arc.
 */
export interface PlacedVehicle {
  id: string
  rear:  { lineId: string; offset: number; position: Point }
  front: { lineId: string; offset: number; position: Point }
}

export type { TangentMode }
