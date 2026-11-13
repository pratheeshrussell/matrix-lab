import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSceneStore } from '../stores/sceneStore'
import { useTransformationStore } from '../stores/transformationStore'

describe('Matrix-Lab Stores Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes default scene with geometric objects and a vector field', () => {
    const sceneStore = useSceneStore()
    const transformStore = useTransformationStore()

    expect(sceneStore.geometricObjects.length).toBeGreaterThan(0)
    expect(sceneStore.vectorFields.length).toBeGreaterThan(0)
    expect(transformStore.steps.length).toBeGreaterThan(0)
    expect(transformStore.evaluatedScene.transformedFields.length).toBe(1)
  })

  it('supports adding, reordering, and inverting transformation steps', () => {
    const transformStore = useTransformationStore()
    transformStore.clearSteps()

    const s1 = transformStore.addStep('rotation')
    const s2 = transformStore.addStep('scaling')
    expect(transformStore.steps.map((s) => s.id)).toEqual([s1.id, s2.id])

    transformStore.moveStep(s2.id, -1)
    expect(transformStore.steps.map((s) => s.id)).toEqual([s2.id, s1.id])

    const appended = transformStore.appendCompositeInverseStep()
    expect(appended).toBe(true)
    // After appending M^-1 to an invertible pipeline M, the new composite is Identity [1, 0, 0, 1]
    const [a, b, c, d] = transformStore.evaluatedScene.fullCompositeMatrix
    expect(a).toBeCloseTo(1)
    expect(b).toBeCloseTo(0)
    expect(c).toBeCloseTo(0)
    expect(d).toBeCloseTo(1)
  })

  it('updates composite matrix columns via direct basis vector dragging and edits scene points/vectors', () => {
    const sceneStore = useSceneStore()
    const transformStore = useTransformationStore()

    // Multi-step default pipeline: dragging transformed e1 to (2, -1) updates composite col 1 exactly
    transformStore.setTransformedBasisColumn('e1', [2, -1])
    const [a, , c] = transformStore.evaluatedScene.fullCompositeMatrix
    expect(a).toBeCloseTo(2)
    expect(c).toBeCloseTo(-1)

    // Empty pipeline: dragging e2 auto-creates a custom matrix step
    transformStore.clearSteps()
    transformStore.setTransformedBasisColumn('e2', [0.5, 1.5])
    expect(transformStore.steps).toHaveLength(1)
    expect(transformStore.evaluatedScene.fullCompositeMatrix).toEqual([1, 0.5, 0, 1.5])

    // Scene point & vector drag updates
    const pt = sceneStore.addObject('point')
    sceneStore.updatePointCoordinates(pt.id, [3.25, -1.5])
    expect(pt.type === 'point' && pt.x).toBe(3.25)
    expect(pt.type === 'point' && pt.y).toBe(-1.5)

    const vec = sceneStore.addObject('vector')
    sceneStore.updateVectorTip(vec.id, [2.5, 4])
    expect(vec.type === 'vector' && vec.dx).toBe(2.5)
    expect(vec.type === 'vector' && vec.dy).toBe(4)
  })
})
