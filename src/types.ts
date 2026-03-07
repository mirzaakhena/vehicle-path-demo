import type { BezierCurve, TangentMode } from 'vehicle-path2/core'

export type Mode = 'drag' | 'line' | 'curve'

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

export type { TangentMode }
