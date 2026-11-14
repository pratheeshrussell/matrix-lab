import type { Vec2 } from '../math/Vector2'

export interface ObjectStyle {
  color: string
  fillOpacity: number
  strokeWidth: number
}

export interface BaseSceneObject {
  id: string
  name: string
  visible: boolean
  style: ObjectStyle
}

export interface PointSceneObject extends BaseSceneObject {
  category: 'geometric'
  type: 'point'
  x: number
  y: number
}

export interface VectorSceneObject extends BaseSceneObject {
  category: 'geometric'
  type: 'vector'
  /** Tail (origin) coordinates */
  ox: number
  oy: number
  /** Vector components (dx, dy) */
  dx: number
  dy: number
}

export interface LineSceneObject extends BaseSceneObject {
  category: 'geometric'
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  /** If true, renders an infinite line through P1 and P2; otherwise a line segment */
  infinite: boolean
}

export interface PolygonSceneObject extends BaseSceneObject {
  category: 'geometric'
  type: 'polygon'
  shapeKind: 'rectangle' | 'polygon'
  vertices: Vec2[]
}

export interface CircleSceneObject extends BaseSceneObject {
  category: 'geometric'
  type: 'circle'
  cx: number
  cy: number
  radius: number
}

export interface CurveSceneObject extends BaseSceneObject {
  category: 'geometric'
  type: 'curve'
  curveKind: 'function' | 'parametric'
  /** For 'function', exprY is f(x) and exprX is unused ('x'). For 'parametric', x(t) and y(t). */
  exprX: string
  exprY: string
  tMin: number
  tMax: number
  samples: number
}

export type GeometricSceneObject =
  | PointSceneObject
  | VectorSceneObject
  | LineSceneObject
  | PolygonSceneObject
  | CircleSceneObject
  | CurveSceneObject

export type VectorFieldPresetId = 'radial' | 'rotational' | 'saddle' | 'constant' | 'custom'
export type VectorFieldInputMode = 'vector' | 'scalar-gradient'
export type ScalarFieldPresetId = 'bowl' | 'peak' | 'saddle' | 'waves' | 'custom'
export type FieldColorOverlayMode = 'none' | 'divergence' | 'curl' | 'scalar'

export interface VectorFieldDomain {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/**
 * First-class mathematical vector field object:
 *   F(x, y) = (P(x, y), Q(x, y))  or  F(x, y) = ∇f(x, y)
 * Stored by its mathematical definition and sampling parameters, never as static arrows.
 */
export interface VectorFieldSceneObject extends BaseSceneObject {
  category: 'field'
  type: 'vector-field'
  preset: VectorFieldPresetId
  exprP: string
  exprQ: string
  /** Optional input mode ('vector' for (P, Q), 'scalar-gradient' for ∇f) */
  inputMode?: VectorFieldInputMode
  scalarPreset?: ScalarFieldPresetId
  exprScalar?: string
  colorOverlay?: FieldColorOverlayMode
  showContours?: boolean
  domain: VectorFieldDomain
  stepsX: number
  stepsY: number
  arrowScale: number
  normalizeArrows: boolean
}

export type SceneObject = GeometricSceneObject | VectorFieldSceneObject

export const SCALAR_FIELD_PRESETS: Record<
  Exclude<ScalarFieldPresetId, 'custom'>,
  {
    label: string
    exprScalar: string
    exprP: string
    exprQ: string
    description: string
  }
> = {
  bowl: {
    label: 'Paraboloid Bowl (Minimum)',
    exprScalar: '(x^2 + y^2) / 4',
    exprP: 'x / 2',
    exprQ: 'y / 2',
    description: 'Valley at origin — ∇f points radially outward uphill (Source: ∇·F = 1, Curl = 0)',
  },
  peak: {
    label: 'Gaussian Hill (Peak)',
    exprScalar: '3 * exp(-(x^2 + y^2) / 4)',
    exprP: '-1.5 * x * exp(-(x^2 + y^2) / 4)',
    exprQ: '-1.5 * y * exp(-(x^2 + y^2) / 4)',
    description: 'Summit at origin — ∇f points radially inward uphill toward peak (Sink near peak, Curl = 0)',
  },
  saddle: {
    label: 'Hyperbolic Saddle Pass',
    exprScalar: '(x^2 - y^2) / 4',
    exprP: 'x / 2',
    exprQ: '-y / 2',
    description: 'Uphill along x, downhill along y — harmonic potential (∇·F = 0, Curl = 0)',
  },
  waves: {
    label: 'Sinusoidal Hills & Valleys',
    exprScalar: 'sin(x) * cos(y)',
    exprP: 'cos(x) * cos(y)',
    exprQ: '-sin(x) * sin(y)',
    description: 'Alternating peaks and troughs — ∇f climbs perpendicular to level contours',
  },
}

export const VECTOR_FIELD_PRESETS: Record<
  Exclude<VectorFieldPresetId, 'custom'>,
  { label: string; exprP: string; exprQ: string; description: string }
> = {
  radial: {
    label: 'Radial Outward',
    exprP: 'x',
    exprQ: 'y',
    description: 'F(x, y) = (x, y) — pure source diverging from the origin',
  },
  rotational: {
    label: 'Rotational (Counterclockwise)',
    exprP: '-y',
    exprQ: 'x',
    description: 'F(x, y) = (-y, x) — divergence-free circulation around the origin',
  },
  saddle: {
    label: 'Hyperbolic Saddle',
    exprP: 'x',
    exprQ: '-y',
    description: 'F(x, y) = (x, -y) — stretching along x-axis, compressing along y-axis',
  },
  constant: {
    label: 'Constant Uniform Flow',
    exprP: '1',
    exprQ: '0',
    description: 'F(x, y) = (1, 0) — uniform horizontal vector field',
  },
}
