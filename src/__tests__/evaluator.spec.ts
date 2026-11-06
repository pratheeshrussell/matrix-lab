import { describe, expect, it } from 'vitest'
import { compileMathExpression } from '../domain/math/ExpressionParser'
import { projectionMatrix, reflectionMatrix, scalingMatrix } from '../domain/math/Matrix2'
import { defaultStepParams } from '../domain/math/Transform'
import { approxEqualVec2 } from '../domain/math/Vector2'
import type { PolygonSceneObject, VectorFieldSceneObject } from '../domain/scene/SceneObject'
import { evaluateScene } from '../engine/SceneEvaluator'
import { evaluateVectorField } from '../engine/VectorFieldEvaluator'

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
})
