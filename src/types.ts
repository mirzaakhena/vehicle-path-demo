import type { BezierCurve, TangentMode, Point } from 'vehicle-path2/core'

export type Mode = 'drag' | 'line' | 'curve' | 'vehicle-start' | 'vehicle-end'

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
 * axles[0] = terdepan (front), axles[N-1] = paling belakang (rear).
 * axleSpacings[i] = jarak arc-length antara axles[i] dan axles[i+1].
 */
export interface PlacedVehicle {
  id: string
  axles: Array<{ lineId: string; offset: number; position: Point }>
  axleSpacings: number[]
}

/**
 * Posisi end (target goto) untuk satu vehicle.
 * position = pre-computed Point untuk rendering.
 */
export interface VehicleEndPoint {
  lineId: string
  offset: number
  position: Point
}

export type { TangentMode }
