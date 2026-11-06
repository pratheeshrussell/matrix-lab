import type { Vec2 } from './Vector2'

/**
 * 2x2 Matrix representation using row-major 4-tuple [a, b, c, d]:
 *
 *   [ a  b ]
 *   [ c  d ]
 *
 * Convention throughout Matrix-Lab:
 * - Vectors are column vectors v = [x, y]^T.
 * - A matrix acts on the left: v' = A * v = [a*x + b*y, c*x + d*y]^T.
 * - First column [a, c]^T is the transformed basis vector A * e1.
 * - Second column [b, d]^T is the transformed basis vector A * e2.
 * - For ordered pipeline steps [T1, T2, ..., Tn] where T1 is applied first,
 *   the composite matrix is M = Tn * ... * T2 * T1, so v' = M * v.
 */
export type Mat2 = readonly [number, number, number, number]

export const IDENTITY_MAT2: Mat2 = [1, 0, 0, 1]
export const ZERO_MAT2: Mat2 = [0, 0, 0, 0]
export const SINGULAR_EPSILON = 1e-9

export function mat2(a: number, b: number, c: number, d: number): Mat2 {
  return [cleanZero(a), cleanZero(b), cleanZero(c), cleanZero(d)]
}

/**
 * Cleans -0 and tiny floating point noise near integer values if needed
 */
export function cleanZero(val: number, eps = 1e-12): number {
  if (!Number.isFinite(val)) return 0
  if (Math.abs(val) < eps) return 0
  return val
}

/**
 * Multiplies two 2x2 matrices: C = A * B
 * (B acts first on a column vector, then A).
 */
export function multiplyMat2(A: Mat2, B: Mat2): Mat2 {
  const [a1, b1, c1, d1] = A
  const [a2, b2, c2, d2] = B
  return mat2(
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
  )
}

/**
 * Multiplies a 2x2 matrix A with a column vector v: v' = A * v
 */
export function multiplyMat2Vec2(A: Mat2, v: Vec2): Vec2 {
  const [a, b, c, d] = A
  const [x, y] = v
  return [cleanZero(a * x + b * y), cleanZero(c * x + d * y)]
}

/**
 * Composes an ordered sequence of transformation matrices [T1, T2, ..., Tn]
 * where T1 is applied first to the scene, followed by T2, ..., up to Tn.
 *
 * Algebraic composition for column vectors:
 *   M = Tn * ... * T2 * T1
 * so that M * v = Tn * (... * (T2 * (T1 * v))).
 */
export function composePipeline(stepsInApplicationOrder: readonly Mat2[]): Mat2 {
  let composite: Mat2 = IDENTITY_MAT2
  for (const stepMatrix of stepsInApplicationOrder) {
    composite = multiplyMat2(stepMatrix, composite)
  }
  return composite
}

export function determinantMat2(A: Mat2): number {
  return cleanZero(A[0] * A[3] - A[1] * A[2])
}

export function traceMat2(A: Mat2): number {
  return cleanZero(A[0] + A[3])
}

export function transposeMat2(A: Mat2): Mat2 {
  return [A[0], A[2], A[1], A[3]]
}

export function isInvertibleMat2(A: Mat2, epsilon = SINGULAR_EPSILON): boolean {
  return Math.abs(determinantMat2(A)) >= epsilon
}

/**
 * Computes the inverse A^-1 of a 2x2 matrix if invertible, or null if singular.
 */
export function inverseMat2(A: Mat2, epsilon = SINGULAR_EPSILON): Mat2 | null {
  const det = determinantMat2(A)
  if (Math.abs(det) < epsilon) {
    return null
  }
  const invDet = 1 / det
  return mat2(A[3] * invDet, -A[1] * invDet, -A[2] * invDet, A[0] * invDet)
}

/**
 * Linearly interpolates between two 2x2 matrices A and B: (1 - t)*A + t*B
 */
export function lerpMat2(A: Mat2, B: Mat2, t: number): Mat2 {
  return mat2(
    A[0] + (B[0] - A[0]) * t,
    A[1] + (B[1] - A[1]) * t,
    A[2] + (B[2] - A[2]) * t,
    A[3] + (B[3] - A[3]) * t,
  )
}

export function approxEqualMat2(A: Mat2, B: Mat2, epsilon = 1e-6): boolean {
  return (
    Math.abs(A[0] - B[0]) <= epsilon &&
    Math.abs(A[1] - B[1]) <= epsilon &&
    Math.abs(A[2] - B[2]) <= epsilon &&
    Math.abs(A[3] - B[3]) <= epsilon
  )
}

// ============================================================================
// Standard 2D Linear Transformation Matrix Constructors
// ============================================================================

/**
 * Counterclockwise rotation by `angleDeg` degrees:
 * [ cos(theta)  -sin(theta) ]
 * [ sin(theta)   cos(theta) ]
 */
export function rotationMatrix(angleDeg: number): Mat2 {
  const rad = (angleDeg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return mat2(c, -s, s, c)
}

/**
 * Scaling along x and y axes:
 * [ sx   0 ]
 * [  0  sy ]
 */
export function scalingMatrix(sx: number, sy: number): Mat2 {
  return mat2(sx, 0, 0, sy)
}

export type ReflectionKind =
  | 'x-axis'
  | 'y-axis'
  | 'origin'
  | 'line-y-eq-x'
  | 'line-y-eq-neg-x'
  | 'custom-angle'

/**
 * Reflection across a line through the origin (or point reflection through origin).
 * For a line at angle `angleDeg` from the positive x-axis:
 * [ cos(2*theta)   sin(2*theta) ]
 * [ sin(2*theta)  -cos(2*theta) ]
 */
export function reflectionMatrix(kind: ReflectionKind, customAngleDeg = 0): Mat2 {
  switch (kind) {
    case 'x-axis':
      return [1, 0, 0, -1]
    case 'y-axis':
      return [-1, 0, 0, 1]
    case 'origin':
      return [-1, 0, 0, -1]
    case 'line-y-eq-x':
      return [0, 1, 1, 0]
    case 'line-y-eq-neg-x':
      return [0, -1, -1, 0]
    case 'custom-angle': {
      const twoRad = (2 * customAngleDeg * Math.PI) / 180
      const c = Math.cos(twoRad)
      const s = Math.sin(twoRad)
      return mat2(c, s, s, -c)
    }
  }
}

/**
 * Shear transformation:
 * [  1   shx ]
 * [ shy   1  ]
 */
export function shearMatrix(shx: number, shy: number): Mat2 {
  return mat2(1, shx, shy, 1)
}

export type ProjectionKind = 'x-axis' | 'y-axis' | 'line-y-eq-x' | 'custom-angle'

/**
 * Orthogonal projection onto a line through the origin:
 * For unit direction u = (cos theta, sin theta):
 * P = u * u^T = [ cos^2(theta)          cos(theta)sin(theta) ]
 *               [ cos(theta)sin(theta)  sin^2(theta)         ]
 */
export function projectionMatrix(kind: ProjectionKind, customAngleDeg = 0): Mat2 {
  switch (kind) {
    case 'x-axis':
      return [1, 0, 0, 0]
    case 'y-axis':
      return [0, 0, 0, 1]
    case 'line-y-eq-x':
      return [0.5, 0.5, 0.5, 0.5]
    case 'custom-angle': {
      const rad = (customAngleDeg * Math.PI) / 180
      const c = Math.cos(rad)
      const s = Math.sin(rad)
      return mat2(c * c, c * s, c * s, s * s)
    }
  }
}

export function formatNumber(n: number, decimals = 3): string {
  const cleaned = cleanZero(n)
  if (Number.isInteger(cleaned)) {
    return cleaned.toString()
  }
  return Number(cleaned.toFixed(decimals)).toString()
}
