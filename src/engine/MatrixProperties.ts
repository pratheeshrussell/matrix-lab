import {
  SINGULAR_EPSILON,
  cleanZero,
  determinantMat2,
  formatNumber,
  inverseMat2,
  traceMat2,
  type Mat2,
} from '../domain/math/Matrix2'
import { normalizeVec2, type Vec2 } from '../domain/math/Vector2'

export type OrientationStatus = 'preserved' | 'reversed' | 'collapsed'

export interface RealEigenpair {
  eigenvalue: number
  eigenvector: Vec2
}

export interface EigenAnalysis {
  kind: 'two-distinct-real' | 'repeated-real-isotropic' | 'repeated-real-defective' | 'complex'
  discriminant: number
  realPairs: RealEigenpair[]
  complexPair: { real: number; imagAbs: number } | null
  summary: string
}

export interface MatrixAnalysis {
  matrix: Mat2
  transformedBasisE1: Vec2
  transformedBasisE2: Vec2
  determinant: number
  areaScaleFactor: number
  orientation: OrientationStatus
  determinantExplanation: string
  rank: 0 | 1 | 2
  rankExplanation: string
  trace: number
  invertible: boolean
  inverse: Mat2 | null
  invertibilityExplanation: string
  eigen: EigenAnalysis
}

/**
 * Computes the rank of a 2x2 matrix with numerical tolerance.
 */
export function computeRankMat2(A: Mat2, epsilon = SINGULAR_EPSILON): 0 | 1 | 2 {
  const det = determinantMat2(A)
  if (Math.abs(det) >= epsilon) {
    return 2
  }
  const hasNonZeroEntry =
    Math.abs(A[0]) >= epsilon ||
    Math.abs(A[1]) >= epsilon ||
    Math.abs(A[2]) >= epsilon ||
    Math.abs(A[3]) >= epsilon
  return hasNonZeroEntry ? 1 : 0
}

/**
 * Computes eigenvalues and normalized real eigenvectors for a 2x2 matrix:
 * Characteristic polynomial: lambda^2 - tr(A)*lambda + det(A) = 0
 * Discriminant: Delta = tr(A)^2 - 4*det(A)
 */
export function analyzeEigenMat2(A: Mat2, epsilon = 1e-7): EigenAnalysis {
  const [a, b, c, d] = A
  const tr = traceMat2(A)
  const det = determinantMat2(A)
  const disc = cleanZero(tr * tr - 4 * det, 1e-10)

  if (disc < -epsilon) {
    const realPart = cleanZero(tr / 2)
    const imagAbs = cleanZero(Math.sqrt(-disc) / 2)
    return {
      kind: 'complex',
      discriminant: disc,
      realPairs: [],
      complexPair: { real: realPart, imagAbs },
      summary: `Complex conjugate eigenvalues ${formatNumber(realPart)} ± ${formatNumber(imagAbs)}i. No real direction stays on its own span (the map involves rotation).`,
    }
  }

  if (Math.abs(disc) <= epsilon) {
    const lambda = cleanZero(tr / 2)
    const isIsotropic =
      Math.abs(a - lambda) <= epsilon &&
      Math.abs(d - lambda) <= epsilon &&
      Math.abs(b) <= epsilon &&
      Math.abs(c) <= epsilon

    if (isIsotropic) {
      return {
        kind: 'repeated-real-isotropic',
        discriminant: 0,
        realPairs: [
          { eigenvalue: lambda, eigenvector: [1, 0] },
          { eigenvalue: lambda, eigenvector: [0, 1] },
        ],
        complexPair: null,
        summary: `Repeated eigenvalue λ = ${formatNumber(lambda)} (geometric multiplicity 2). Every non-zero vector in ℝ² is an eigenvector scaled by ${formatNumber(lambda)}.`,
      }
    }

    const v = findEigenvectorForLambda(A, lambda, epsilon)
    return {
      kind: 'repeated-real-defective',
      discriminant: 0,
      realPairs: [{ eigenvalue: lambda, eigenvector: v }],
      complexPair: null,
      summary: `Repeated eigenvalue λ = ${formatNumber(lambda)} with a single invariant line (shear-like / defective matrix).`,
    }
  }

  // Two distinct real eigenvalues
  const sqrtDisc = Math.sqrt(disc)
  const lambda1 = cleanZero((tr + sqrtDisc) / 2)
  const lambda2 = cleanZero((tr - sqrtDisc) / 2)
  const v1 = findEigenvectorForLambda(A, lambda1, epsilon)
  const v2 = findEigenvectorForLambda(A, lambda2, epsilon)

  return {
    kind: 'two-distinct-real',
    discriminant: disc,
    realPairs: [
      { eigenvalue: lambda1, eigenvector: v1 },
      { eigenvalue: lambda2, eigenvector: v2 },
    ],
    complexPair: null,
    summary: `Two real invariant directions: λ₁ = ${formatNumber(lambda1)} along (${formatNumber(v1[0])}, ${formatNumber(v1[1])}) and λ₂ = ${formatNumber(lambda2)} along (${formatNumber(v2[0])}, ${formatNumber(v2[1])}).`,
  }
}

function findEigenvectorForLambda(A: Mat2, lambda: number, epsilon = 1e-7): Vec2 {
  const m00 = A[0] - lambda
  const m01 = A[1]
  const m10 = A[2]
  const m11 = A[3] - lambda

  // Pick the row of (A - lambda*I) with larger norm to construct orthogonal vector (-row_y, row_x)
  const row0NormSq = m00 * m00 + m01 * m01
  const row1NormSq = m10 * m10 + m11 * m11

  if (row0NormSq >= row1NormSq && row0NormSq > epsilon * epsilon) {
    const raw: Vec2 = [-m01, m00]
    return canonicalizeDirection(normalizeVec2(raw))
  }
  if (row1NormSq > epsilon * epsilon) {
    const raw: Vec2 = [-m11, m10]
    return canonicalizeDirection(normalizeVec2(raw))
  }
  return [1, 0]
}

function canonicalizeDirection(v: Vec2): Vec2 {
  if (v[0] < -1e-9 || (Math.abs(v[0]) <= 1e-9 && v[1] < -1e-9)) {
    return [cleanZero(-v[0]), cleanZero(-v[1])]
  }
  return [cleanZero(v[0]), cleanZero(v[1])]
}

/**
 * Full mathematical analysis of a 2x2 transformation matrix.
 */
export function analyzeMatrix2(A: Mat2): MatrixAnalysis {
  const det = determinantMat2(A)
  const areaScaleFactor = cleanZero(Math.abs(det))
  const rank = computeRankMat2(A)
  const trace = traceMat2(A)
  const inverse = inverseMat2(A)
  const invertible = inverse !== null

  let orientation: OrientationStatus = 'preserved'
  let determinantExplanation = ''

  if (Math.abs(det) < SINGULAR_EPSILON) {
    orientation = 'collapsed'
    determinantExplanation =
      'det(A) = 0: The transformation is singular and collapses 2D area to zero (plane squashes into a line or the origin).'
  } else if (det < 0) {
    orientation = 'reversed'
    determinantExplanation = `det(A) = ${formatNumber(det)} < 0: Reverses orientation (flips handedness of basis vectors) and scales areas by |det| = ${formatNumber(areaScaleFactor)}×.`
  } else {
    orientation = 'preserved'
    determinantExplanation = `det(A) = ${formatNumber(det)} > 0: Preserves orientation and scales 2D areas by ${formatNumber(areaScaleFactor)}×.`
  }

  let rankExplanation = ''
  if (rank === 2) {
    rankExplanation = 'Rank 2: Image spans the entire 2D plane ℝ² (bijective linear map).'
  } else if (rank === 1) {
    rankExplanation = 'Rank 1: Image collapses onto a 1D line passing through the origin.'
  } else {
    rankExplanation = 'Rank 0: Zero map — every point in ℝ² collapses to the origin (0, 0).'
  }

  const invertibilityExplanation = invertible
    ? 'Invertible (det ≠ 0): Every transformed point can be uniquely mapped back via A⁻¹.'
    : 'Singular (det = 0): No inverse matrix A⁻¹ exists because multiple input points collapse onto the same output point.'

  const eigen = analyzeEigenMat2(A)

  return {
    matrix: A,
    transformedBasisE1: [A[0], A[2]],
    transformedBasisE2: [A[1], A[3]],
    determinant: det,
    areaScaleFactor,
    orientation,
    determinantExplanation,
    rank,
    rankExplanation,
    trace,
    invertible,
    inverse,
    invertibilityExplanation,
    eigen,
  }
}
