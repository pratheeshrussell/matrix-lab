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
})
