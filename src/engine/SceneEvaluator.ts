import { compileMathExpression } from '../domain/math/ExpressionParser'
import {
  IDENTITY_MAT2,
  composePipeline,
  lerpMat2,
  multiplyMat2,
  multiplyMat2Vec2,
  rotationMatrix,
  type Mat2,
} from '../domain/math/Matrix2'
import type {
  PushforwardSamplingStyle,
  TransformationStep,
  VectorFieldTransformMode,
  VisualizationMode,
} from '../domain/math/Transform'
import {
  BASIS_E1,
  BASIS_E2,
  approxEqualVec2,
  isFiniteVec2,
  type Vec2,
} from '../domain/math/Vector2'
import type {
  CircleSceneObject,
  CurveSceneObject,
  GeometricSceneObject,
  LineSceneObject,
  PointSceneObject,
  PolygonSceneObject,
  SceneObject,
  VectorFieldSceneObject,
  VectorSceneObject,
} from '../domain/scene/SceneObject'
import { analyzeMatrix2, type MatrixAnalysis } from './MatrixProperties'
import { evaluateVectorField, type EvaluatedVectorField } from './VectorFieldEvaluator'

export interface EvaluatedPointGeometry {
  id: string
  name: string
  visible: boolean
  color: string
  strokeWidth: number
  kind: 'point'
  position: Vec2
}

export interface EvaluatedVectorGeometry {
  id: string
  name: string
  visible: boolean
  color: string
  strokeWidth: number
  kind: 'vector'
  tail: Vec2
  tip: Vec2
  components: Vec2
}

export interface EvaluatedLineGeometry {
  id: string
  name: string
  visible: boolean
  color: string
  strokeWidth: number
  kind: 'line'
  p1: Vec2
  p2: Vec2
  infinite: boolean
  /** True if a singular transformation collapsed both points to the same point */
  degeneratePoint: boolean
}

export interface EvaluatedPolygonGeometry {
  id: string
  name: string
  visible: boolean
  color: string
  fillOpacity: number
  strokeWidth: number
  kind: 'polygon'
  vertices: Vec2[]
}

export interface EvaluatedCurveGeometry {
  id: string
  name: string
  visible: boolean
  color: string
  fillOpacity: number
  strokeWidth: number
  kind: 'curve'
  closed: boolean
  points: Vec2[]
  expressionError: string | null
}

export type EvaluatedGeometryItem =
  | EvaluatedPointGeometry
  | EvaluatedVectorGeometry
  | EvaluatedLineGeometry
  | EvaluatedPolygonGeometry
  | EvaluatedCurveGeometry

export interface EvaluatedBasisVectors {
  originalE1: Vec2
  originalE2: Vec2
  transformedE1: Vec2
  transformedE2: Vec2
  originalUnitSquare: readonly [Vec2, Vec2, Vec2, Vec2]
  transformedUnitParallelogram: readonly [Vec2, Vec2, Vec2, Vec2]
}

export interface StepSnapshotInfo {
  stepIndex: number
  stepName: string
  stepMatrix: Mat2
  cumulativeMatrix: Mat2
}

export interface EvaluatedGridLine {
  coord: number
  isAxis: boolean
  p1: Vec2
  p2: Vec2
}

export interface SceneEvaluationOptions {
  visualizationMode: VisualizationMode
  /** For 'step-through' mode: 0 = original scene, k = after k-th enabled step */
  activeStepIndex: number
  /** Smooth morph progress in [0, 1] across enabled pipeline steps (defaults to 1) */
  morphT?: number
  vectorFieldMode: VectorFieldTransformMode
  pushforwardStyle: PushforwardSamplingStyle
  showBasisVectors: boolean
  showUnitSquare: boolean
  showEigenvectors: boolean
  showTransformedGrid?: boolean
}

export interface EvaluatedScene {
  visualizationMode: VisualizationMode
  activeStepIndex: number
  morphT: number
  totalEnabledSteps: number
  stepSnapshots: StepSnapshotInfo[]
  /** The effective composite matrix used for the current view (full pipeline or active step) */
  activeCompositeMatrix: Mat2
  /** The full composite matrix of all enabled steps */
  fullCompositeMatrix: Mat2
  matrixAnalysis: MatrixAnalysis
  activeStepAnalysis: MatrixAnalysis
  originalGeometry: EvaluatedGeometryItem[]
  transformedGeometry: EvaluatedGeometryItem[]
  originalFields: EvaluatedVectorField[]
  transformedFields: EvaluatedVectorField[]
  basisVectors: EvaluatedBasisVectors
  transformedGridLines: EvaluatedGridLine[]
  options: SceneEvaluationOptions
}

const CIRCLE_SAMPLE_COUNT = 96
const GRID_LINE_RANGE = 8

/**
 * Smoothly interpolates a single transformation step for local progress u in [0, 1].
 * Pure rotation steps interpolate by angle so shapes rotate smoothly without shrinking;
 * other steps interpolate linearly from Identity to the step's matrix.
 */
export function interpolateStepMatrix(step: TransformationStep, u: number): Mat2 {
  const clampedU = Math.max(0, Math.min(1, u))
  if (clampedU <= 0) return IDENTITY_MAT2
  if (clampedU >= 1) return step.matrix

  if (step.type === 'rotation') {
    return rotationMatrix(step.params.angleDeg * clampedU)
  }
  return lerpMat2(IDENTITY_MAT2, step.matrix, clampedU)
}

/**
 * Piecewise-smoothly interpolates an ordered pipeline of enabled steps for morphT in [0, 1].
 * At t = 0 -> Identity I.
 * At t = k / N -> exact cumulative matrix after k steps.
 * Between (k-1)/N and k/N -> interpolates the k-th step on top of step k-1's cumulative matrix.
 */
export function interpolatePipeline(
  enabledSteps: readonly TransformationStep[],
  morphT: number,
): { matrix: Mat2; currentStepIndex: number } {
  const count = enabledSteps.length
  const t = Math.max(0, Math.min(1, morphT))

  if (count === 0 || t <= 0) {
    return { matrix: IDENTITY_MAT2, currentStepIndex: 0 }
  }
  if (t >= 1) {
    return {
      matrix: composePipeline(enabledSteps.map((s) => s.matrix)),
      currentStepIndex: count,
    }
  }

  let scaled = t * count
  // Snap near-exact step boundaries to avoid floating-point drift (e.g. 3 * (1/3))
  if (Math.abs(scaled - Math.round(scaled)) < 1e-9) {
    scaled = Math.round(scaled)
  }

  const completedCount = Math.min(count, Math.floor(scaled))
  const localU = scaled - completedCount

  const prefixMatrix = composePipeline(
    enabledSteps.slice(0, completedCount).map((s) => s.matrix),
  )

  if (localU <= 1e-9 || completedCount >= count) {
    return {
      matrix: prefixMatrix,
      currentStepIndex: completedCount,
    }
  }

  const activeStep = enabledSteps[completedCount]!
  const partialStepMatrix = interpolateStepMatrix(activeStep, localU)
  return {
    matrix: multiplyMat2(partialStepMatrix, prefixMatrix),
    currentStepIndex: completedCount + 1,
  }
}

function buildTransformedGridLines(matrix: Mat2, range = GRID_LINE_RANGE): EvaluatedGridLine[] {
  const lines: EvaluatedGridLine[] = []
  for (let k = -range; k <= range; k++) {
    // Vertical line x = k
    lines.push({
      coord: k,
      isAxis: k === 0,
      p1: multiplyMat2Vec2(matrix, [k, -range]),
      p2: multiplyMat2Vec2(matrix, [k, range]),
    })
    // Horizontal line y = k
    lines.push({
      coord: k,
      isAxis: k === 0,
      p1: multiplyMat2Vec2(matrix, [-range, k]),
      p2: multiplyMat2Vec2(matrix, [range, k]),
    })
  }
  return lines
}

/**
 * Pure function that evaluates the mathematical scene and transformation pipeline
 * into a renderer-ready EvaluatedScene without mutating any original objects.
 */
export function evaluateScene(
  objects: readonly SceneObject[],
  steps: readonly TransformationStep[],
  options: SceneEvaluationOptions,
): EvaluatedScene {
  const enabledSteps = steps.filter((s) => s.enabled)
  const stepSnapshots: StepSnapshotInfo[] = [
    {
      stepIndex: 0,
      stepName: 'Initial Scene (Identity I)',
      stepMatrix: IDENTITY_MAT2,
      cumulativeMatrix: IDENTITY_MAT2,
    },
  ]

  const matricesInOrder: Mat2[] = []
  for (let i = 0; i < enabledSteps.length; i++) {
    const step = enabledSteps[i]
    if (!step) continue
    matricesInOrder.push(step.matrix)
    stepSnapshots.push({
      stepIndex: i + 1,
      stepName: step.name,
      stepMatrix: step.matrix,
      cumulativeMatrix: composePipeline(matricesInOrder),
    })
  }

  const fullCompositeMatrix = composePipeline(matricesInOrder)
  const morphT = Math.max(0, Math.min(1, options.morphT ?? 1))

  let clampedStepIndex = Math.max(
    0,
    Math.min(enabledSteps.length, Math.round(options.activeStepIndex)),
  )

  let activeCompositeMatrix: Mat2
  if (options.visualizationMode === 'original') {
    activeCompositeMatrix = IDENTITY_MAT2
  } else if (morphT < 1) {
    const interpolated = interpolatePipeline(enabledSteps, morphT)
    activeCompositeMatrix = interpolated.matrix
    clampedStepIndex = interpolated.currentStepIndex
  } else if (options.visualizationMode === 'step-through') {
    activeCompositeMatrix =
      stepSnapshots[clampedStepIndex]?.cumulativeMatrix ?? fullCompositeMatrix
  } else {
    activeCompositeMatrix = fullCompositeMatrix
  }

  const matrixAnalysis = analyzeMatrix2(fullCompositeMatrix)
  const activeStepAnalysis = analyzeMatrix2(activeCompositeMatrix)

  const geometricObjects = objects.filter(
    (obj): obj is GeometricSceneObject => obj.category === 'geometric',
  )
  const fieldObjects = objects.filter(
    (obj): obj is VectorFieldSceneObject => obj.category === 'field',
  )

  const originalGeometry = geometricObjects.map((obj) =>
    evaluateGeometricObject(obj, IDENTITY_MAT2),
  )
  const transformedGeometry = geometricObjects.map((obj) =>
    evaluateGeometricObject(obj, activeCompositeMatrix),
  )

  const evaluatedFields = fieldObjects.map((field) =>
    evaluateVectorField(
      field,
      activeCompositeMatrix,
      options.vectorFieldMode,
      options.pushforwardStyle,
    ),
  )

  const transformedE1 = multiplyMat2Vec2(activeCompositeMatrix, BASIS_E1)
  const transformedE2 = multiplyMat2Vec2(activeCompositeMatrix, BASIS_E2)
  const transformedCorner: Vec2 = [
    transformedE1[0] + transformedE2[0],
    transformedE1[1] + transformedE2[1],
  ]

  const basisVectors: EvaluatedBasisVectors = {
    originalE1: BASIS_E1,
    originalE2: BASIS_E2,
    transformedE1,
    transformedE2,
    originalUnitSquare: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    transformedUnitParallelogram: [
      [0, 0],
      transformedE1,
      transformedCorner,
      transformedE2,
    ],
  }

  const showTransformedGrid = options.showTransformedGrid ?? true
  const transformedGridLines = showTransformedGrid
    ? buildTransformedGridLines(activeCompositeMatrix)
    : []

  return {
    visualizationMode: options.visualizationMode,
    activeStepIndex: clampedStepIndex,
    morphT,
    totalEnabledSteps: enabledSteps.length,
    stepSnapshots,
    activeCompositeMatrix,
    fullCompositeMatrix,
    matrixAnalysis,
    activeStepAnalysis,
    originalGeometry,
    transformedGeometry,
    originalFields: evaluatedFields,
    transformedFields: evaluatedFields,
    basisVectors,
    transformedGridLines,
    options: {
      ...options,
      morphT,
      showTransformedGrid,
    },
  }
}

export function evaluateGeometricObject(
  obj: GeometricSceneObject,
  matrix: Mat2,
): EvaluatedGeometryItem {
  switch (obj.type) {
    case 'point':
      return evaluatePoint(obj, matrix)
    case 'vector':
      return evaluateVector(obj, matrix)
    case 'line':
      return evaluateLine(obj, matrix)
    case 'polygon':
      return evaluatePolygon(obj, matrix)
    case 'circle':
      return evaluateCircle(obj, matrix)
    case 'curve':
      return evaluateCurve(obj, matrix)
  }
}

function evaluatePoint(obj: PointSceneObject, matrix: Mat2): EvaluatedPointGeometry {
  return {
    id: obj.id,
    name: obj.name,
    visible: obj.visible,
    color: obj.style.color,
    strokeWidth: obj.style.strokeWidth,
    kind: 'point',
    position: multiplyMat2Vec2(matrix, [obj.x, obj.y]),
  }
}

function evaluateVector(obj: VectorSceneObject, matrix: Mat2): EvaluatedVectorGeometry {
  const tail = multiplyMat2Vec2(matrix, [obj.ox, obj.oy])
  const components = multiplyMat2Vec2(matrix, [obj.dx, obj.dy])
  const tip: Vec2 = [tail[0] + components[0], tail[1] + components[1]]
  return {
    id: obj.id,
    name: obj.name,
    visible: obj.visible,
    color: obj.style.color,
    strokeWidth: obj.style.strokeWidth,
    kind: 'vector',
    tail,
    tip,
    components,
  }
}

function evaluateLine(obj: LineSceneObject, matrix: Mat2): EvaluatedLineGeometry {
  const p1 = multiplyMat2Vec2(matrix, [obj.x1, obj.y1])
  const p2 = multiplyMat2Vec2(matrix, [obj.x2, obj.y2])
  return {
    id: obj.id,
    name: obj.name,
    visible: obj.visible,
    color: obj.style.color,
    strokeWidth: obj.style.strokeWidth,
    kind: 'line',
    p1,
    p2,
    infinite: obj.infinite,
    degeneratePoint: approxEqualVec2(p1, p2, 1e-7),
  }
}

function evaluatePolygon(obj: PolygonSceneObject, matrix: Mat2): EvaluatedPolygonGeometry {
  const vertices = obj.vertices.map((v) => multiplyMat2Vec2(matrix, v))
  return {
    id: obj.id,
    name: obj.name,
    visible: obj.visible,
    color: obj.style.color,
    fillOpacity: obj.style.fillOpacity,
    strokeWidth: obj.style.strokeWidth,
    kind: 'polygon',
    vertices,
  }
}

function evaluateCircle(obj: CircleSceneObject, matrix: Mat2): EvaluatedCurveGeometry {
  const points: Vec2[] = []
  for (let i = 0; i <= CIRCLE_SAMPLE_COUNT; i++) {
    const theta = (2 * Math.PI * i) / CIRCLE_SAMPLE_COUNT
    const wx = obj.cx + obj.radius * Math.cos(theta)
    const wy = obj.cy + obj.radius * Math.sin(theta)
    points.push(multiplyMat2Vec2(matrix, [wx, wy]))
  }
  return {
    id: obj.id,
    name: obj.name,
    visible: obj.visible,
    color: obj.style.color,
    fillOpacity: obj.style.fillOpacity,
    strokeWidth: obj.style.strokeWidth,
    kind: 'curve',
    closed: true,
    points,
    expressionError: null,
  }
}

function evaluateCurve(obj: CurveSceneObject, matrix: Mat2): EvaluatedCurveGeometry {
  const sampleCount = Math.max(16, Math.min(400, Math.round(obj.samples)))
  const tMin = obj.tMin
  const tMax = obj.tMax

  if (obj.curveKind === 'function') {
    const compiledY = compileMathExpression(obj.exprY, ['x'])
    if (!compiledY.ok) {
      return {
        id: obj.id,
        name: obj.name,
        visible: obj.visible,
        color: obj.style.color,
        fillOpacity: 0,
        strokeWidth: obj.style.strokeWidth,
        kind: 'curve',
        closed: false,
        points: [],
        expressionError: compiledY.error,
      }
    }

    const points: Vec2[] = []
    for (let i = 0; i <= sampleCount; i++) {
      const x = tMin + ((tMax - tMin) * i) / sampleCount
      const y = compiledY.evaluate({ x })
      const pt: Vec2 = [x, y]
      if (isFiniteVec2(pt) && Math.abs(y) < 1e4) {
        points.push(multiplyMat2Vec2(matrix, pt))
      } else {
        points.push([Number.NaN, Number.NaN])
      }
    }

    return {
      id: obj.id,
      name: obj.name,
      visible: obj.visible,
      color: obj.style.color,
      fillOpacity: 0,
      strokeWidth: obj.style.strokeWidth,
      kind: 'curve',
      closed: false,
      points,
      expressionError: null,
    }
  }

  // Parametric curve (x(t), y(t))
  const compiledX = compileMathExpression(obj.exprX, ['t'])
  const compiledY = compileMathExpression(obj.exprY, ['t'])
  if (!compiledX.ok || !compiledY.ok) {
    return {
      id: obj.id,
      name: obj.name,
      visible: obj.visible,
      color: obj.style.color,
      fillOpacity: 0,
      strokeWidth: obj.style.strokeWidth,
      kind: 'curve',
      closed: false,
      points: [],
      expressionError: !compiledX.ok ? compiledX.error : !compiledY.ok ? compiledY.error : null,
    }
  }

  const points: Vec2[] = []
  for (let i = 0; i <= sampleCount; i++) {
    const t = tMin + ((tMax - tMin) * i) / sampleCount
    const x = compiledX.evaluate({ t })
    const y = compiledY.evaluate({ t })
    const pt: Vec2 = [x, y]
    if (isFiniteVec2(pt) && Math.abs(x) < 1e4 && Math.abs(y) < 1e4) {
      points.push(multiplyMat2Vec2(matrix, pt))
    } else {
      points.push([Number.NaN, Number.NaN])
    }
  }

  return {
    id: obj.id,
    name: obj.name,
    visible: obj.visible,
    color: obj.style.color,
    fillOpacity: 0,
    strokeWidth: obj.style.strokeWidth,
    kind: 'curve',
    closed: false,
    points,
    expressionError: null,
  }
}
