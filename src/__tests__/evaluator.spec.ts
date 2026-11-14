import { describe, expect, it } from 'vitest'
import { compileMathExpression } from '../domain/math/ExpressionParser'
import {
  IDENTITY_MAT2,
  approxEqualMat2,
  projectionMatrix,
  reflectionMatrix,
  rotationMatrix,
  scalingMatrix,
} from '../domain/math/Matrix2'
import { defaultStepParams, type TransformationStep } from '../domain/math/Transform'
import { approxEqualVec2 } from '../domain/math/Vector2'
import type { PolygonSceneObject, VectorFieldSceneObject } from '../domain/scene/SceneObject'
import { evaluateScene, interpolatePipeline } from '../engine/SceneEvaluator'
import {
  ParticleFlowEngine,
  computeFieldStreamlines,
  rk4Step,
} from '../engine/FlowSimulation'
import {
  evaluateVectorField,
  probeVectorFieldAt,
} from '../engine/VectorFieldEvaluator'

describe('ExpressionParser & Scene/VectorField Evaluators', () => {
  it('compiles and evaluates valid mathjs expressions and reports errors on invalid ones', () => {
    const valid = compileMathExpression('-y + 2*x', ['x', 'y'])
    expect(valid.ok).toBe(true)
    if (valid.ok) {
      expect(valid.evaluate({ x: 3, y: 4 })).toBeCloseTo(2)
    }

    const invalid = compileMathExpression('sin(x + * )', ['x', 'y'])
    expect(invalid.ok).toBe(false)
  })

  it('distinguishes Mode A (fixed sample values A*F(x)) from Mode B (pushforward A*F(A^-1*x))', () => {
    // Consider field F(x, y) = (y, 0) and non-uniform scaling A = diag(2, 3)
    // At target point x' = (2, 3):
    // - Mode A ('fixed-samples'): G(x') = A * F(2, 3) = diag(2, 3) * (3, 0) = (6, 0)
    // - Mode B ('pushforward' on uniform grid): F'(x') = A * F(A^-1 * (2, 3)) = A * F(1, 1) = diag(2, 3) * (1, 0) = (2, 0)
    const field: VectorFieldSceneObject = {
      id: 'vf-test',
      name: 'Shear Flow (y, 0)',
      category: 'field',
      type: 'vector-field',
      preset: 'custom',
      exprP: 'y',
      exprQ: '0',
      visible: true,
      style: { color: '#2dd4bf', fillOpacity: 0, strokeWidth: 2 },
      domain: { xMin: 2, xMax: 2, yMin: 3, yMax: 3 },
      stepsX: 2,
      stepsY: 2,
      arrowScale: 1,
      normalizeArrows: false,
    }

    const A = scalingMatrix(2, 3)
    const modeA = evaluateVectorField(field, A, 'fixed-samples', 'uniform-target-grid')
    const modeB = evaluateVectorField(field, A, 'pushforward', 'uniform-target-grid')

    expect(modeA.singularPushforwardUnavailable).toBe(false)
    expect(modeB.singularPushforwardUnavailable).toBe(false)

    const sampleA = modeA.transformedSamples[0]!
    const sampleB = modeB.transformedSamples[0]!

    expect(approxEqualVec2(sampleA.position, [2, 3])).toBe(true)
    expect(approxEqualVec2(sampleA.vector, [6, 0])).toBe(true)

    expect(approxEqualVec2(sampleB.position, [2, 3])).toBe(true)
    expect(approxEqualVec2(sampleB.vector, [2, 0])).toBe(true)
  })

  it('explicitly flags singular matrices in pushforward mode without silently substituting Mode A', () => {
    const field: VectorFieldSceneObject = {
      id: 'vf-sing',
      name: 'Radial',
      category: 'field',
      type: 'vector-field',
      preset: 'radial',
      exprP: 'x',
      exprQ: 'y',
      visible: true,
      style: { color: '#2dd4bf', fillOpacity: 0, strokeWidth: 2 },
      domain: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
      stepsX: 3,
      stepsY: 3,
      arrowScale: 0.2,
      normalizeArrows: false,
    }

    const projX = projectionMatrix('x-axis')
    const evaluated = evaluateVectorField(field, projX, 'pushforward', 'uniform-target-grid')

    expect(evaluated.singularPushforwardUnavailable).toBe(true)
    expect(evaluated.singularExplanation).toContain('det(A) = 0')
    expect(evaluated.transformedSamples).toHaveLength(0)
  })

  it('preserves original scene coordinates when evaluating a transformation pipeline', () => {
    const poly: PolygonSceneObject = {
      id: 'poly-1',
      name: 'Triangle',
      category: 'geometric',
      type: 'polygon',
      shapeKind: 'polygon',
      visible: true,
      style: { color: '#38bdf8', fillOpacity: 0.2, strokeWidth: 2 },
      vertices: [
        [1, 0],
        [2, 0],
        [1, 3],
      ],
    }

    const scene = evaluateScene(
      [poly],
      [
        {
          id: 's1',
          dimension: '2d-linear',
          name: 'Reflect X',
          type: 'reflection',
          enabled: true,
          params: defaultStepParams(),
          matrix: reflectionMatrix('x-axis'),
        },
      ],
      {
        visualizationMode: 'overlay',
        activeStepIndex: 1,
        vectorFieldMode: 'pushforward',
        pushforwardStyle: 'uniform-target-grid',
        showBasisVectors: true,
        showUnitSquare: true,
        showEigenvectors: false,
      },
    )

    // Original object vertices are untouched
    expect(poly.vertices[2]).toEqual([1, 3])
    const origPoly = scene.originalGeometry[0]
    const transPoly = scene.transformedGeometry[0]
    expect(origPoly?.kind).toBe('polygon')
    expect(transPoly?.kind).toBe('polygon')
    if (origPoly?.kind === 'polygon' && transPoly?.kind === 'polygon') {
      expect(origPoly.vertices[2]).toEqual([1, 3])
      expect(transPoly.vertices[2]).toEqual([1, -3])
    }
  })

  it('piecewise-interpolates pipeline steps smoothly without collapsing rotations', () => {
    const stepRot: TransformationStep = {
      id: 'rot-180',
      dimension: '2d-linear',
      name: 'Rotate 180°',
      type: 'rotation',
      enabled: true,
      params: { ...defaultStepParams(), angleDeg: 180 },
      matrix: rotationMatrix(180),
    }
    const stepScale: TransformationStep = {
      id: 'scale-2',
      dimension: '2d-linear',
      name: 'Scale 2x',
      type: 'scaling',
      enabled: true,
      params: { ...defaultStepParams(), sx: 2, sy: 2 },
      matrix: scalingMatrix(2, 2),
    }

    const atZero = interpolatePipeline([stepRot, stepScale], 0)
    expect(approxEqualMat2(atZero.matrix, IDENTITY_MAT2)).toBe(true)

    // At t = 0.25 (halfway through 180 deg rotation), should be Rotate(90 deg), NOT 0 matrix
    const atQuarter = interpolatePipeline([stepRot, stepScale], 0.25)
    expect(approxEqualMat2(atQuarter.matrix, rotationMatrix(90))).toBe(true)

    // At t = 0.5 (exact step 1 boundary), should be Rotate(180 deg)
    const atHalf = interpolatePipeline([stepRot, stepScale], 0.5)
    expect(approxEqualMat2(atHalf.matrix, rotationMatrix(180))).toBe(true)

    // At t = 1.0, should be Scale(2, 2) * Rotate(180) = [-2, 0, 0, -2]
    const atOne = interpolatePipeline([stepRot, stepScale], 1)
    expect(approxEqualMat2(atOne.matrix, [-2, 0, 0, -2])).toBe(true)
  })

  it('generates warped grid lines when showTransformedGrid is enabled', () => {
    const sceneWithGrid = evaluateScene([], [], {
      visualizationMode: 'overlay',
      activeStepIndex: 0,
      vectorFieldMode: 'pushforward',
      pushforwardStyle: 'uniform-target-grid',
      showBasisVectors: true,
      showUnitSquare: true,
      showEigenvectors: false,
      showTransformedGrid: true,
    })
    expect(sceneWithGrid.transformedGridLines.length).toBe(34)

    const sceneWithoutGrid = evaluateScene([], [], {
      visualizationMode: 'overlay',
      activeStepIndex: 0,
      vectorFieldMode: 'pushforward',
      pushforwardStyle: 'uniform-target-grid',
      showBasisVectors: true,
      showUnitSquare: true,
      showEigenvectors: false,
      showTransformedGrid: false,
    })
    expect(sceneWithoutGrid.transformedGridLines.length).toBe(0)
  })

  it('integrates RK4 streamlines and particle flow faithfully under Mode A and Mode B', () => {
    // 1. RK4 on rotational field (-y, x) preserves radius accurately
    let pos: [number, number] = [2, 0]
    for (let i = 0; i < 40; i++) {
      const next = rk4Step(pos, ([x, y]) => [-y, x], 0.05)
      expect(next).not.toBeNull()
      pos = [next![0], next![1]]
    }
    expect(Math.hypot(pos[0], pos[1])).toBeCloseTo(2, 3)

    // 2. Pushforward streamlines map custom seed s -> A*s and omit transformed paths if singular
    const rotField: VectorFieldSceneObject = {
      id: 'vf-flow',
      name: 'Rotational',
      category: 'field',
      type: 'vector-field',
      preset: 'rotational',
      exprP: '-y',
      exprQ: 'x',
      visible: true,
      style: { color: '#2dd4bf', fillOpacity: 0, strokeWidth: 2 },
      domain: { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
      stepsX: 7,
      stepsY: 7,
      arrowScale: 0.2,
      normalizeArrows: false,
    }

    const scaleA = scalingMatrix(2, 1)
    const streams = computeFieldStreamlines(rotField, scaleA, 'pushforward', [[1, 0]])
    expect(streams.originalPaths.length).toBeGreaterThan(0)
    expect(streams.transformedPaths.length).toBeGreaterThan(0)
    expect(streams.transformedSeeds[0]).toEqual([2, 0])

    const singularStreams = computeFieldStreamlines(
      rotField,
      projectionMatrix('x-axis'),
      'pushforward',
      [[1, 1]],
    )
    expect(singularStreams.originalPaths.length).toBeGreaterThan(0)
    expect(singularStreams.transformedPaths).toHaveLength(0)

    // 3. ParticleFlowEngine advances particles and builds trails
    const pool = new ParticleFlowEngine()
    pool.sync([rotField], scaleA, 'pushforward', [[1, 1]])
    pool.advance(0.03)
    pool.advance(0.03)
    const batch = pool.buildRenderBatch(true, true)
    expect(batch.originalHeadXs.length).toBeGreaterThan(50)
    expect(batch.transformedTrailXs.length).toBeGreaterThan(50)
  })

  it('computes accurate divergence and 2D curl for radial, rotational, and saddle fields', () => {
    const baseField: VectorFieldSceneObject = {
      id: 'vf-calc',
      name: 'Calc Test',
      category: 'field',
      type: 'vector-field',
      preset: 'radial',
      exprP: 'x',
      exprQ: 'y',
      visible: true,
      style: { color: '#2dd4bf', fillOpacity: 0, strokeWidth: 2 },
      domain: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
      stepsX: 3,
      stepsY: 3,
      arrowScale: 0.2,
      normalizeArrows: false,
    }

    // Radial (x, y) -> Div = 2, Curl = 0
    const radialEval = evaluateVectorField(baseField, rotationMatrix(90), 'pushforward')
    expect(radialEval.originCalculus.origDiv).toBeCloseTo(2, 4)
    expect(radialEval.originCalculus.origCurl).toBeCloseTo(0, 4)

    // Rotational (-y, x) -> Div = 0, Curl = 2; under reflection det < 0 curl flips sign to -2!
    const rotField: VectorFieldSceneObject = {
      ...baseField,
      preset: 'rotational',
      exprP: '-y',
      exprQ: 'x',
    }
    const rotReflected = evaluateVectorField(rotField, reflectionMatrix('x-axis'), 'pushforward')
    expect(rotReflected.originCalculus.origDiv).toBeCloseTo(0, 4)
    expect(rotReflected.originCalculus.origCurl).toBeCloseTo(2, 4)
    expect(rotReflected.originCalculus.transDiv).toBeCloseTo(0, 4)
    expect(rotReflected.originCalculus.transCurl).toBeCloseTo(-2, 4)

    // Saddle (x, -y) -> Div = 0, Curl = 0
    const saddleField: VectorFieldSceneObject = {
      ...baseField,
      preset: 'saddle',
      exprP: 'x',
      exprQ: '-y',
    }
    const saddleEval = evaluateVectorField(saddleField, IDENTITY_MAT2, 'pushforward')
    expect(saddleEval.originCalculus.origDiv).toBeCloseTo(0, 4)
    expect(saddleEval.originCalculus.origCurl).toBeCloseTo(0, 4)
  })

  it('evaluates scalar potential gradients ∇f, level contours, and live point probes', () => {
    const scalarField: VectorFieldSceneObject = {
      id: 'vf-scalar',
      name: 'Bowl Potential',
      category: 'field',
      type: 'vector-field',
      preset: 'custom',
      exprP: 'x / 2',
      exprQ: 'y / 2',
      inputMode: 'scalar-gradient',
      scalarPreset: 'bowl',
      exprScalar: '(x^2 + y^2) / 4',
      colorOverlay: 'scalar',
      showContours: true,
      visible: true,
      style: { color: '#2dd4bf', fillOpacity: 0, strokeWidth: 2 },
      domain: { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
      stepsX: 5,
      stepsY: 5,
      arrowScale: 0.25,
      normalizeArrows: false,
    }

    const scaleM = scalingMatrix(2, 1)
    const evaluated = evaluateVectorField(scalarField, scaleM, 'pushforward')

    expect(evaluated.expressionError).toBeNull()
    expect(evaluated.inputMode).toBe('scalar-gradient')
    expect(evaluated.originCalculus.origDiv).toBeCloseTo(1, 3)
    expect(evaluated.originCalculus.origCurl).toBeCloseTo(0, 3)
    expect(evaluated.originalContourPaths.length).toBeGreaterThan(20)
    expect(evaluated.transformedContourPaths.length).toBeGreaterThan(20)

    // Probe at (2, 1): f(2,1) = (4+1)/4 = 1.25, ∇f(2,1) = (1, 0.5)
    // Under pushforward by diag(2, 1): A^-1 * (2, 1) = (1, 1), f(1,1) = 0.5, A * ∇f(1,1) = (2*0.5, 1*0.5) = (1, 0.5)
    const probe = probeVectorFieldAt(scalarField, [2, 1], scaleM, 'pushforward')
    expect(probe).not.toBeNull()
    expect(probe!.origScalar).toBeCloseTo(1.25, 5)
    expect(probe!.origVector![0]).toBeCloseTo(1, 4)
    expect(probe!.origVector![1]).toBeCloseTo(0.5, 4)
    expect(probe!.origCurl).toBeCloseTo(0, 3)
    expect(probe!.transScalar).toBeCloseTo(0.5, 5)
    expect(probe!.transVector![0]).toBeCloseTo(1, 4)
    expect(probe!.transVector![1]).toBeCloseTo(0.5, 4)
  })
})
