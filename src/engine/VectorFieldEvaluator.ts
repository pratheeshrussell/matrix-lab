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
import type {
  FieldColorOverlayMode,
  VectorFieldDomain,
  VectorFieldInputMode,
  VectorFieldSceneObject,
} from '../domain/scene/SceneObject'

export type ScalarSamplerFn = (pt: Vec2) => number | null
export type VectorSamplerFn = (pt: Vec2) => Vec2 | null

export interface EvaluatedVectorSample {
  /** Sample tail coordinate in world space */
  position: Vec2
  /** Raw mathematical vector value at this sample */
  vector: Vec2
  /** Scaled display displacement (tail -> tip) used for arrow rendering */
  displayDelta: Vec2
  /** Magnitude ||vector|| */
  magnitude: number
  /** Local 2D divergence ∂P/∂x + ∂Q/∂y */
  divergence: number
  /** Local 2D scalar curl (vorticity) ∂Q/∂x - ∂P/∂y */
  curl: number
  /** Scalar potential f(x, y) when in scalar-gradient mode */
  scalarValue: number | null
}

export interface OriginCalculusSummary {
  origDiv: number
  origCurl: number
  origScalar: number | null
  transDiv: number | null
  transCurl: number | null
  transScalar: number | null
}

export interface EvaluatedVectorField {
  id: string
  name: string
  color: string
  strokeWidth: number
  visible: boolean
  mode: VectorFieldTransformMode
  pushforwardStyle: PushforwardSamplingStyle
  inputMode: VectorFieldInputMode
  exprScalar: string
  colorOverlay: FieldColorOverlayMode
  showContours: boolean
  /** Validated expression error if P(x,y), Q(x,y), or f(x,y) failed to parse */
  expressionError: string | null
  /**
   * True when mode === 'pushforward' and the composite matrix is singular (det = 0),
   * meaning the inverse pullback formula F'(x') = A * F(A^-1 * x') is mathematically undefined.
   */
  singularPushforwardUnavailable: boolean
  singularExplanation: string | null
  originalSamples: EvaluatedVectorSample[]
  transformedSamples: EvaluatedVectorSample[]
  originCalculus: OriginCalculusSummary
  maxAbsDivergence: number
  maxAbsCurl: number
  scalarRange: [number, number] | null
  originalContourPaths: Vec2[][]
  transformedContourPaths: Vec2[][]
}

export interface FieldProbeResult {
  position: Vec2
  inputMode: VectorFieldInputMode
  origVector: Vec2 | null
  origDivergence: number | null
  origCurl: number | null
  origScalar: number | null
  transVector: Vec2 | null
  transDivergence: number | null
  transCurl: number | null
  transScalar: number | null
}

export interface CompiledContinuousField {
  ok: true
  inputMode: VectorFieldInputMode
  exprScalar: string
  evalVector: VectorSamplerFn
  evalScalar: ScalarSamplerFn | null
}

export interface CompiledContinuousFieldError {
  ok: false
  inputMode: VectorFieldInputMode
  exprScalar: string
  error: string
}

const GRADIENT_STEP_H = 1e-4
const DERIV_STEP_H = 1e-3
const CONTOUR_GRID_N = 28
const CONTOUR_LEVEL_COUNT = 6

/**
 * Compiles either vector expressions (P, Q) or a scalar potential expression f(x, y)
 * whose gradient ∇f = (∂f/∂x, ∂f/∂y) defines the vector field.
 */
export function compileFieldDefinition(
  field: VectorFieldSceneObject,
): CompiledContinuousField | CompiledContinuousFieldError {
  const inputMode: VectorFieldInputMode = field.inputMode ?? 'vector'
  const exprScalar = field.exprScalar ?? '(x^2 + y^2) / 4'

  if (inputMode === 'scalar-gradient') {
    const compiledScalar = compileMathExpression(exprScalar, ['x', 'y'])
    if (!compiledScalar.ok) {
      return {
        ok: false,
        inputMode,
        exprScalar,
        error: `f(x, y): ${compiledScalar.error}`,
      }
    }

    const evalScalar: ScalarSamplerFn = (pt: Vec2): number | null => {
      const val = compiledScalar.evaluate({ x: pt[0], y: pt[1] })
      return typeof val === 'number' && Number.isFinite(val) ? val : null
    }

    const evalVector: VectorSamplerFn = (pt: Vec2): Vec2 | null => {
      const fxP = evalScalar([pt[0] + GRADIENT_STEP_H, pt[1]])
      const fxM = evalScalar([pt[0] - GRADIENT_STEP_H, pt[1]])
      const fyP = evalScalar([pt[0], pt[1] + GRADIENT_STEP_H])
      const fyM = evalScalar([pt[0], pt[1] - GRADIENT_STEP_H])
      if (fxP === null || fxM === null || fyP === null || fyM === null) {
        return null
      }
      const vec: Vec2 = [
        (fxP - fxM) / (2 * GRADIENT_STEP_H),
        (fyP - fyM) / (2 * GRADIENT_STEP_H),
      ]
      return isFiniteVec2(vec) ? vec : null
    }

    return {
      ok: true,
      inputMode,
      exprScalar,
      evalVector,
      evalScalar,
    }
  }

  const compiledP = compileMathExpression(field.exprP, ['x', 'y'])
  const compiledQ = compileMathExpression(field.exprQ, ['x', 'y'])

  if (!compiledP.ok || !compiledQ.ok) {
    const errMsg = !compiledP.ok
      ? `P(x, y): ${compiledP.error}`
      : !compiledQ.ok
        ? `Q(x, y): ${compiledQ.error}`
        : 'Invalid expression'
    return {
      ok: false,
      inputMode,
      exprScalar,
      error: errMsg,
    }
  }

  const evalVector: VectorSamplerFn = (pt: Vec2): Vec2 | null => {
    const vx = compiledP.evaluate({ x: pt[0], y: pt[1] })
    const vy = compiledQ.evaluate({ x: pt[0], y: pt[1] })
    const vec: Vec2 = [vx, vy]
    return isFiniteVec2(vec) ? vec : null
  }

  return {
    ok: true,
    inputMode,
    exprScalar,
    evalVector,
    evalScalar: null,
  }
}

/**
 * Computes central-difference 2D divergence and scalar curl (vorticity) of a continuous vector sampler.
 */
export function computeDivergenceAndCurl(
  evalVec: VectorSamplerFn,
  pt: Vec2,
): { divergence: number; curl: number } | null {
  const vxRight = evalVec([pt[0] + DERIV_STEP_H, pt[1]])
  const vxLeft = evalVec([pt[0] - DERIV_STEP_H, pt[1]])
  const vyUp = evalVec([pt[0], pt[1] + DERIV_STEP_H])
  const vyDown = evalVec([pt[0], pt[1] - DERIV_STEP_H])

  if (!vxRight || !vxLeft || !vyUp || !vyDown) {
    return null
  }

  const dPdx = (vxRight[0] - vxLeft[0]) / (2 * DERIV_STEP_H)
  const dQdx = (vxRight[1] - vxLeft[1]) / (2 * DERIV_STEP_H)
  const dPdy = (vyUp[0] - vyDown[0]) / (2 * DERIV_STEP_H)
  const dQdy = (vyUp[1] - vyDown[1]) / (2 * DERIV_STEP_H)

  const divergence = dPdx + dQdy
  const curl = dQdx - dPdy

  if (!Number.isFinite(divergence) || !Number.isFinite(curl)) {
    return null
  }

  return { divergence, curl }
}

function buildTransformedSamplers(
  evalF: VectorSamplerFn,
  evalScalar: ScalarSamplerFn | null,
  matrix: Mat2,
  mode: VectorFieldTransformMode,
): {
  invA: Mat2 | null
  evalTransformedContinuous: VectorSamplerFn | null
  evalTransformedScalar: ScalarSamplerFn | null
} {
  const invA = inverseMat2(matrix)

  const evalTransformedContinuous: VectorSamplerFn | null =
    mode === 'fixed-samples'
      ? (pt: Vec2): Vec2 | null => {
          const f = evalF(pt)
          if (!f) return null
          const mapped = multiplyMat2Vec2(matrix, f)
          return isFiniteVec2(mapped) ? mapped : null
        }
      : invA
        ? (targetPt: Vec2): Vec2 | null => {
            const preimage = multiplyMat2Vec2(invA, targetPt)
            const fAtPreimage = evalF(preimage)
            if (!fAtPreimage) return null
            const pushed = multiplyMat2Vec2(matrix, fAtPreimage)
            return isFiniteVec2(pushed) ? pushed : null
          }
        : null

  const evalTransformedScalar: ScalarSamplerFn | null = !evalScalar
    ? null
    : mode === 'fixed-samples'
      ? evalScalar
      : invA
        ? (targetPt: Vec2): number | null => evalScalar(multiplyMat2Vec2(invA, targetPt))
        : null

  return { invA, evalTransformedContinuous, evalTransformedScalar }
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
  const compiled = compileFieldDefinition(field)
  const colorOverlay: FieldColorOverlayMode = field.colorOverlay ?? 'none'
  const showContours = field.showContours ?? true

  if (!compiled.ok) {
    return {
      id: field.id,
      name: field.name,
      color: field.style.color,
      strokeWidth: field.style.strokeWidth,
      visible: field.visible,
      mode,
      pushforwardStyle,
      inputMode: compiled.inputMode,
      exprScalar: compiled.exprScalar,
      colorOverlay,
      showContours,
      expressionError: compiled.error,
      singularPushforwardUnavailable: false,
      singularExplanation: null,
      originalSamples: [],
      transformedSamples: [],
      originCalculus: {
        origDiv: 0,
        origCurl: 0,
        origScalar: null,
        transDiv: null,
        transCurl: null,
        transScalar: null,
      },
      maxAbsDivergence: 0,
      maxAbsCurl: 0,
      scalarRange: null,
      originalContourPaths: [],
      transformedContourPaths: [],
    }
  }

  const evalF = compiled.evalVector
  const evalScalar = compiled.evalScalar
  const { invA, evalTransformedContinuous, evalTransformedScalar } = buildTransformedSamplers(
    evalF,
    evalScalar,
    matrix,
    mode,
  )

  const gridPoints = generateSampleGrid(field)
  const originalSamples: EvaluatedVectorSample[] = []

  for (const pos of gridPoints) {
    const rawVec = evalF(pos)
    if (!rawVec) continue
    const dc = computeDivergenceAndCurl(evalF, pos)
    const scalarValue = evalScalar ? evalScalar(pos) : null
    originalSamples.push(
      buildVectorSample(
        pos,
        rawVec,
        field.arrowScale,
        field.normalizeArrows,
        dc?.divergence ?? 0,
        dc?.curl ?? 0,
        scalarValue,
      ),
    )
  }

  const transformedSamples: EvaluatedVectorSample[] = []
  let singularPushforwardUnavailable = false
  let singularExplanation: string | null = null

  if (mode === 'fixed-samples') {
    for (const orig of originalSamples) {
      const transformedVec = multiplyMat2Vec2(matrix, orig.vector)
      if (!isFiniteVec2(transformedVec)) continue
      const dc = evalTransformedContinuous
        ? computeDivergenceAndCurl(evalTransformedContinuous, orig.position)
        : null
      const scalarValue = evalTransformedScalar ? evalTransformedScalar(orig.position) : null
      transformedSamples.push(
        buildVectorSample(
          orig.position,
          transformedVec,
          field.arrowScale,
          field.normalizeArrows,
          dc?.divergence ?? 0,
          dc?.curl ?? 0,
          scalarValue,
        ),
      )
    }
  } else {
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
              0,
              0,
              orig.scalarValue,
            ),
          )
        }
      }
    } else if (pushforwardStyle === 'uniform-target-grid') {
      for (const targetPos of gridPoints) {
        const pushedVec = evalTransformedContinuous?.(targetPos)
        if (!pushedVec) continue
        const dc = evalTransformedContinuous
          ? computeDivergenceAndCurl(evalTransformedContinuous, targetPos)
          : null
        const scalarValue = evalTransformedScalar ? evalTransformedScalar(targetPos) : null
        transformedSamples.push(
          buildVectorSample(
            targetPos,
            pushedVec,
            field.arrowScale,
            field.normalizeArrows,
            dc?.divergence ?? 0,
            dc?.curl ?? 0,
            scalarValue,
          ),
        )
      }
    } else {
      for (const orig of originalSamples) {
        const mappedPos = multiplyMat2Vec2(matrix, orig.position)
        const mappedVec = multiplyMat2Vec2(matrix, orig.vector)
        if (!isFiniteVec2(mappedPos) || !isFiniteVec2(mappedVec)) continue
        const dc = evalTransformedContinuous
          ? computeDivergenceAndCurl(evalTransformedContinuous, mappedPos)
          : null
        const scalarValue = evalTransformedScalar ? evalTransformedScalar(mappedPos) : orig.scalarValue
        transformedSamples.push(
          buildVectorSample(
            mappedPos,
            mappedVec,
            field.arrowScale,
            field.normalizeArrows,
            dc?.divergence ?? 0,
            dc?.curl ?? 0,
            scalarValue,
          ),
        )
      }
    }
  }

  let maxAbsDivergence = 0
  let maxAbsCurl = 0
  let minScalar = Number.POSITIVE_INFINITY
  let maxScalar = Number.NEGATIVE_INFINITY

  for (const s of [...originalSamples, ...transformedSamples]) {
    const absDiv = Math.abs(s.divergence)
    const absCurl = Math.abs(s.curl)
    if (absDiv > maxAbsDivergence) maxAbsDivergence = absDiv
    if (absCurl > maxAbsCurl) maxAbsCurl = absCurl
    if (s.scalarValue !== null) {
      if (s.scalarValue < minScalar) minScalar = s.scalarValue
      if (s.scalarValue > maxScalar) maxScalar = s.scalarValue
    }
  }

  const scalarRange: [number, number] | null =
    Number.isFinite(minScalar) && Number.isFinite(maxScalar) ? [minScalar, maxScalar] : null

  const origAtOrigin = computeDivergenceAndCurl(evalF, [0, 0])
  const transAtOrigin = evalTransformedContinuous
    ? computeDivergenceAndCurl(evalTransformedContinuous, [0, 0])
    : null

  const originCalculus: OriginCalculusSummary = {
    origDiv: origAtOrigin?.divergence ?? 0,
    origCurl: origAtOrigin?.curl ?? 0,
    origScalar: evalScalar ? evalScalar([0, 0]) : null,
    transDiv: transAtOrigin ? transAtOrigin.divergence : null,
    transCurl: transAtOrigin ? transAtOrigin.curl : null,
    transScalar: evalTransformedScalar ? evalTransformedScalar([0, 0]) : null,
  }

  let originalContourPaths: Vec2[][] = []
  let transformedContourPaths: Vec2[][] = []

  if (compiled.inputMode === 'scalar-gradient' && evalScalar && showContours) {
    const origContourData = extractScalarContours(evalScalar, field.domain)
    originalContourPaths = origContourData.segments

    if (evalTransformedScalar) {
      if (mode === 'fixed-samples') {
        transformedContourPaths = originalContourPaths
      } else {
        const transContourData = extractScalarContours(
          evalTransformedScalar,
          field.domain,
          origContourData.levels,
        )
        transformedContourPaths = transContourData.segments
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
    inputMode: compiled.inputMode,
    exprScalar: compiled.exprScalar,
    colorOverlay,
    showContours,
    expressionError: null,
    singularPushforwardUnavailable,
    singularExplanation,
    originalSamples,
    transformedSamples,
    originCalculus,
    maxAbsDivergence,
    maxAbsCurl,
    scalarRange,
    originalContourPaths,
    transformedContourPaths,
  }
}

/**
 * Probes a single world coordinate point (x, y) to compute exact original and transformed
 * vector value, divergence, curl, and scalar potential value for live cursor inspection.
 */
export function probeVectorFieldAt(
  field: VectorFieldSceneObject,
  worldPt: Vec2,
  matrix: Mat2 = IDENTITY_MAT2,
  mode: VectorFieldTransformMode = 'pushforward',
): FieldProbeResult | null {
  if (!isFiniteVec2(worldPt)) return null
  const compiled = compileFieldDefinition(field)
  if (!compiled.ok) return null

  const evalF = compiled.evalVector
  const evalScalar = compiled.evalScalar
  const { evalTransformedContinuous, evalTransformedScalar } = buildTransformedSamplers(
    evalF,
    evalScalar,
    matrix,
    mode,
  )

  const origVector = evalF(worldPt)
  const origDC = computeDivergenceAndCurl(evalF, worldPt)
  const origScalar = evalScalar ? evalScalar(worldPt) : null

  const transVector = evalTransformedContinuous ? evalTransformedContinuous(worldPt) : null
  const transDC = evalTransformedContinuous
    ? computeDivergenceAndCurl(evalTransformedContinuous, worldPt)
    : null
  const transScalar = evalTransformedScalar ? evalTransformedScalar(worldPt) : null

  return {
    position: worldPt,
    inputMode: compiled.inputMode,
    origVector,
    origDivergence: origDC?.divergence ?? null,
    origCurl: origDC?.curl ?? null,
    origScalar,
    transVector,
    transDivergence: transDC?.divergence ?? null,
    transCurl: transDC?.curl ?? null,
    transScalar,
  }
}

const MS_SEGMENTS: Record<number, readonly [number, number][]> = {
  0: [],
  1: [[3, 0]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[3, 2]],
  9: [[0, 2]],
  11: [[1, 2]],
  12: [[3, 1]],
  13: [[0, 1]],
  14: [[3, 0]],
  15: [],
}

function interpolateEdgePoint(
  edgeIdx: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  v00: number,
  v10: number,
  v11: number,
  v01: number,
  level: number,
): Vec2 {
  const interp = (a: number, b: number): number => {
    const denom = b - a
    if (Math.abs(denom) < 1e-12) return 0.5
    return Math.max(0, Math.min(1, (level - a) / denom))
  }

  switch (edgeIdx) {
    case 0: {
      const t = interp(v00, v10)
      return [x0 + t * (x1 - x0), y0]
    }
    case 1: {
      const t = interp(v10, v11)
      return [x1, y0 + t * (y1 - y0)]
    }
    case 2: {
      const t = interp(v01, v11)
      return [x0 + t * (x1 - x0), y1]
    }
    default: {
      const t = interp(v00, v01)
      return [x0, y0 + t * (y1 - y0)]
    }
  }
}

function extractScalarContours(
  evalScalar: ScalarSamplerFn,
  domain: VectorFieldDomain,
  explicitLevels?: readonly number[],
): { levels: number[]; segments: Vec2[][] } {
  const n = CONTOUR_GRID_N
  const grid: (number | null)[][] = []
  const dx = (domain.xMax - domain.xMin) / (n - 1)
  const dy = (domain.yMax - domain.yMin) / (n - 1)
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx <= 0 || dy <= 0) {
    return { levels: [], segments: [] }
  }

  let minVal = Number.POSITIVE_INFINITY
  let maxVal = Number.NEGATIVE_INFINITY

  for (let ix = 0; ix < n; ix++) {
    const row: (number | null)[] = []
    const x = domain.xMin + ix * dx
    for (let iy = 0; iy < n; iy++) {
      const y = domain.yMin + iy * dy
      const v = evalScalar([x, y])
      row.push(v)
      if (v !== null) {
        if (v < minVal) minVal = v
        if (v > maxVal) maxVal = v
      }
    }
    grid.push(row)
  }

  let levels: number[] = []
  if (explicitLevels && explicitLevels.length > 0) {
    levels = [...explicitLevels]
  } else if (Number.isFinite(minVal) && Number.isFinite(maxVal) && maxVal - minVal > 1e-6) {
    for (let k = 1; k <= CONTOUR_LEVEL_COUNT; k++) {
      levels.push(minVal + ((maxVal - minVal) * k) / (CONTOUR_LEVEL_COUNT + 1))
    }
  }

  if (levels.length === 0) {
    return { levels: [], segments: [] }
  }

  const segments: Vec2[][] = []

  for (const level of levels) {
    for (let ix = 0; ix < n - 1; ix++) {
      const x0 = domain.xMin + ix * dx
      const x1 = x0 + dx
      const colA = grid[ix]!
      const colB = grid[ix + 1]!

      for (let iy = 0; iy < n - 1; iy++) {
        const v00 = colA[iy]
        const v10 = colB[iy]
        const v11 = colB[iy + 1]
        const v01 = colA[iy + 1]
        if (
          v00 === null ||
          v10 === null ||
          v11 === null ||
          v01 === null ||
          v00 === undefined ||
          v10 === undefined ||
          v11 === undefined ||
          v01 === undefined
        ) {
          continue
        }

        const y0 = domain.yMin + iy * dy
        const y1 = y0 + dy

        let caseIdx = 0
        if (v00 >= level) caseIdx |= 1
        if (v10 >= level) caseIdx |= 2
        if (v11 >= level) caseIdx |= 4
        if (v01 >= level) caseIdx |= 8

        let pairs: readonly [number, number][] | undefined = MS_SEGMENTS[caseIdx]
        if (!pairs) {
          const avg = 0.25 * (v00 + v10 + v11 + v01)
          if (caseIdx === 5) {
            pairs = avg >= level ? [[3, 2], [0, 1]] : [[3, 0], [1, 2]]
          } else {
            pairs = avg >= level ? [[3, 0], [1, 2]] : [[3, 2], [0, 1]]
          }
        }

        for (const [eA, eB] of pairs) {
          const pA = interpolateEdgePoint(eA, x0, x1, y0, y1, v00, v10, v11, v01, level)
          const pB = interpolateEdgePoint(eB, x0, x1, y0, y1, v00, v10, v11, v01, level)
          if (isFiniteVec2(pA) && isFiniteVec2(pB)) {
            segments.push([pA, pB])
          }
        }
      }
    }
  }

  return { levels, segments }
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
  divergence = 0,
  curl = 0,
  scalarValue: number | null = null,
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
    divergence,
    curl,
    scalarValue,
  }
}
