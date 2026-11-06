import { compileMathExpression } from '../domain/math/ExpressionParser'
import {
  IDENTITY_MAT2,
  inverseMat2,
  multiplyMat2Vec2,
  type Mat2,
} from '../domain/math/Matrix2'
import type {
  PushforwardSamplingStyle,
  VectorFieldTransformMode,
} from '../domain/math/Transform'
import { isFiniteVec2, normVec2, scaleVec2, type Vec2 } from '../domain/math/Vector2'
import type { VectorFieldSceneObject } from '../domain/scene/SceneObject'

export interface EvaluatedVectorSample {
  /** Sample tail coordinate in world space */
  position: Vec2
  /** Raw mathematical vector value at this sample */
  vector: Vec2
  /** Scaled display displacement (tail -> tip) used for arrow rendering */
  displayDelta: Vec2
  /** Magnitude ||vector|| */
  magnitude: number
}

export interface EvaluatedVectorField {
  id: string
  name: string
  color: string
  strokeWidth: number
  visible: boolean
  mode: VectorFieldTransformMode
  pushforwardStyle: PushforwardSamplingStyle
  /** Validated expression error if P(x,y) or Q(x,y) failed to parse */
  expressionError: string | null
  /**
   * True when mode === 'pushforward' and the composite matrix is singular (det = 0),
   * meaning the inverse pullback formula F'(x') = A * F(A^-1 * x') is mathematically undefined.
   */
  singularPushforwardUnavailable: boolean
  singularExplanation: string | null
  originalSamples: EvaluatedVectorSample[]
  transformedSamples: EvaluatedVectorSample[]
}

/**
 * Evaluates a VectorFieldSceneObject under a composite 2x2 transformation matrix A.
 *
 * Strictly distinguishes between:
 * - Mode A ('fixed-samples'):
 *     G(x) = A * F(x)
 *     Sample positions x remain fixed on the original grid; vector values are transformed by A.
 *
 * - Mode B ('pushforward'):
 *     Geometric pushforward of the vector field under x' = A * x:
 *     F'(x') = A * F(A^-1 * x')
 *     - When A is invertible:
 *       - 'uniform-target-grid': evaluates F'(x') = A * F(A^-1 * x') at uniform grid points x'
 *       - 'mapped-sample-points': maps original grid points x -> x' = A*x with vector A*F(x)
 *     - When A is singular (det(A) = 0):
 *       Does NOT silently substitute Mode A. Sets `singularPushforwardUnavailable = true`
 *       with an explicit mathematical explanation. (If 'mapped-sample-points' is chosen,
 *       forward-mapped points x' = A*x on the collapsed subspace can still be inspected alongside
 *       the singular warning.)
 */
export function evaluateVectorField(
  field: VectorFieldSceneObject,
  matrix: Mat2 = IDENTITY_MAT2,
  mode: VectorFieldTransformMode = 'pushforward',
  pushforwardStyle: PushforwardSamplingStyle = 'uniform-target-grid',
): EvaluatedVectorField {
  const compiledP = compileMathExpression(field.exprP, ['x', 'y'])
  const compiledQ = compileMathExpression(field.exprQ, ['x', 'y'])

  if (!compiledP.ok || !compiledQ.ok) {
    const errMsg = !compiledP.ok
      ? `P(x, y): ${compiledP.error}`
      : !compiledQ.ok
        ? `Q(x, y): ${compiledQ.error}`
        : 'Invalid expression'
    return {
      id: field.id,
      name: field.name,
      color: field.style.color,
      strokeWidth: field.style.strokeWidth,
      visible: field.visible,
      mode,
      pushforwardStyle,
      expressionError: errMsg,
      singularPushforwardUnavailable: false,
      singularExplanation: null,
      originalSamples: [],
      transformedSamples: [],
    }
  }

  const evalF = (pt: Vec2): Vec2 | null => {
    const vx = compiledP.evaluate({ x: pt[0], y: pt[1] })
    const vy = compiledQ.evaluate({ x: pt[0], y: pt[1] })
    const vec: Vec2 = [vx, vy]
    return isFiniteVec2(vec) ? vec : null
  }

  const gridPoints = generateSampleGrid(field)
  const originalSamples: EvaluatedVectorSample[] = []

  for (const pos of gridPoints) {
    const rawVec = evalF(pos)
    if (!rawVec) continue
    originalSamples.push(buildVectorSample(pos, rawVec, field.arrowScale, field.normalizeArrows))
  }

  // Evaluate transformed samples according to selected mathematical semantics
  const transformedSamples: EvaluatedVectorSample[] = []
  let singularPushforwardUnavailable = false
  let singularExplanation: string | null = null

  if (mode === 'fixed-samples') {
    // Mode A: G(x) = A * F(x) at fixed sample coordinates x
    for (const orig of originalSamples) {
      const transformedVec = multiplyMat2Vec2(matrix, orig.vector)
      if (!isFiniteVec2(transformedVec)) continue
      transformedSamples.push(
        buildVectorSample(
          orig.position,
          transformedVec,
          field.arrowScale,
          field.normalizeArrows,
        ),
      )
    }
  } else {
    // Mode B: Geometric pushforward F'(x') = A * F(A^-1 * x')
    const invA = inverseMat2(matrix)

    if (!invA) {
      singularPushforwardUnavailable = true
      singularExplanation =
        'det(A) = 0 (Singular Matrix): The inverse A⁻¹ does not exist, so the pushforward formula F\'(x\') = A · F(A⁻¹x\') cannot be evaluated on the 2D plane because multiple source points collapse onto the same image point.'

      if (pushforwardStyle === 'mapped-sample-points') {
        for (const orig of originalSamples) {
          const mappedPos = multiplyMat2Vec2(matrix, orig.position)
          const mappedVec = multiplyMat2Vec2(matrix, orig.vector)
          if (!isFiniteVec2(mappedPos) || !isFiniteVec2(mappedVec)) continue
          transformedSamples.push(
            buildVectorSample(
              mappedPos,
              mappedVec,
              field.arrowScale,
              field.normalizeArrows,
            ),
          )
        }
      }
    } else if (pushforwardStyle === 'uniform-target-grid') {
      // Evaluate F'(x') = A * F(A^-1 * x') at each uniform grid point x'
      for (const targetPos of gridPoints) {
        const preimagePos = multiplyMat2Vec2(invA, targetPos)
        const fAtPreimage = evalF(preimagePos)
        if (!fAtPreimage) continue
        const pushedVec = multiplyMat2Vec2(matrix, fAtPreimage)
        if (!isFiniteVec2(pushedVec)) continue
        transformedSamples.push(
          buildVectorSample(
            targetPos,
            pushedVec,
            field.arrowScale,
            field.normalizeArrows,
          ),
        )
      }
    } else {
      // 'mapped-sample-points': x' = A * x, v' = A * F(x)
      // Since x = A^-1 * x', this satisfies v'(x') = A * F(A^-1 * x') at the transformed lattice points.
      for (const orig of originalSamples) {
        const mappedPos = multiplyMat2Vec2(matrix, orig.position)
        const mappedVec = multiplyMat2Vec2(matrix, orig.vector)
        if (!isFiniteVec2(mappedPos) || !isFiniteVec2(mappedVec)) continue
        transformedSamples.push(
          buildVectorSample(
            mappedPos,
            mappedVec,
            field.arrowScale,
            field.normalizeArrows,
          ),
        )
      }
    }
  }

  return {
    id: field.id,
    name: field.name,
    color: field.style.color,
    strokeWidth: field.style.strokeWidth,
    visible: field.visible,
    mode,
    pushforwardStyle,
    expressionError: null,
    singularPushforwardUnavailable,
    singularExplanation,
    originalSamples,
    transformedSamples,
  }
}

export function generateSampleGrid(field: VectorFieldSceneObject): Vec2[] {
  const stepsX = Math.max(2, Math.min(25, Math.round(field.stepsX)))
  const stepsY = Math.max(2, Math.min(25, Math.round(field.stepsY)))
  const { xMin, xMax, yMin, yMax } = field.domain

  const points: Vec2[] = []
  const dx = stepsX > 1 ? (xMax - xMin) / (stepsX - 1) : 0
  const dy = stepsY > 1 ? (yMax - yMin) / (stepsY - 1) : 0

  for (let ix = 0; ix < stepsX; ix++) {
    const x = xMin + ix * dx
    for (let iy = 0; iy < stepsY; iy++) {
      const y = yMin + iy * dy
      points.push([x, y])
    }
  }
  return points
}

function buildVectorSample(
  position: Vec2,
  vector: Vec2,
  arrowScale: number,
  normalizeArrows: boolean,
): EvaluatedVectorSample {
  const magnitude = normVec2(vector)
  let displayDelta: Vec2
  if (magnitude < 1e-9) {
    displayDelta = [0, 0]
  } else if (normalizeArrows) {
    displayDelta = scaleVec2(vector, (1 / magnitude) * arrowScale)
  } else {
    displayDelta = scaleVec2(vector, arrowScale)
  }
  return {
    position,
    vector,
    displayDelta,
    magnitude,
  }
}
