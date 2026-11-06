import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  IDENTITY_MAT2,
  inverseMat2,
  mat2,
  type Mat2,
} from '../domain/math/Matrix2'
import {
  computeMatrixFromPreset,
  defaultStepParams,
  type PushforwardSamplingStyle,
  type TransformationPresetType,
  type TransformationStep,
  type VectorFieldTransformMode,
  type VisualizationMode,
} from '../domain/math/Transform'
import { EDUCATIONAL_PRESETS } from '../engine/educationalPresets'
import { evaluateScene, type EvaluatedScene } from '../engine/SceneEvaluator'
import { useSceneStore } from './sceneStore'

let stepIdCounter = 100

function nextStepId(): string {
  stepIdCounter += 1
  return `step-${stepIdCounter}`
}

function cloneStep(step: TransformationStep): TransformationStep {
  return {
    ...step,
    params: { ...step.params },
    matrix: [step.matrix[0], step.matrix[1], step.matrix[2], step.matrix[3]],
  }
}

const PRESET_DEFAULT_NAMES: Record<TransformationPresetType, string> = {
  rotation: 'Rotate CCW',
  scaling: 'Scale (sx, sy)',
  reflection: 'Reflection',
  shear: 'Shear',
  projection: 'Projection (Singular)',
  custom: 'Custom 2×2 Matrix',
}

export const useTransformationStore = defineStore('transformation', () => {
  const defaultPreset = EDUCATIONAL_PRESETS[0]!

  const steps = ref<TransformationStep[]>(defaultPreset.steps.map(cloneStep))
  const visualizationMode = ref<VisualizationMode>(defaultPreset.visualizationMode)
  const activeStepIndex = ref<number>(defaultPreset.steps.length)
  const vectorFieldMode = ref<VectorFieldTransformMode>(defaultPreset.vectorFieldMode)
  const pushforwardStyle = ref<PushforwardSamplingStyle>(defaultPreset.pushforwardStyle)
  const showBasisVectors = ref<boolean>(defaultPreset.showBasisVectors)
  const showUnitSquare = ref<boolean>(defaultPreset.showUnitSquare)
  const showEigenvectors = ref<boolean>(defaultPreset.showEigenvectors)
  const activeEducationalPresetId = ref<string>(defaultPreset.id)

  const sceneStore = useSceneStore()

  const enabledSteps = computed(() => steps.value.filter((s) => s.enabled))

  const evaluatedScene = computed<EvaluatedScene>(() =>
    evaluateScene(sceneStore.objects, steps.value, {
      visualizationMode: visualizationMode.value,
      activeStepIndex: activeStepIndex.value,
      vectorFieldMode: vectorFieldMode.value,
      pushforwardStyle: pushforwardStyle.value,
      showBasisVectors: showBasisVectors.value,
      showUnitSquare: showUnitSquare.value,
      showEigenvectors: showEigenvectors.value,
    }),
  )

  function addStep(type: TransformationPresetType = 'rotation'): TransformationStep {
    const params = defaultStepParams()
    const matrix = computeMatrixFromPreset(type, params, IDENTITY_MAT2)
    const step: TransformationStep = {
      id: nextStepId(),
      dimension: '2d-linear',
      name: PRESET_DEFAULT_NAMES[type],
      type,
      enabled: true,
      params,
      matrix,
    }
    steps.value.push(step)
    activeStepIndex.value = enabledSteps.value.length
    return step
  }

  function updateStepPresetType(stepId: string, newType: TransformationPresetType): void {
    const step = steps.value.find((s) => s.id === stepId)
    if (!step) return
    step.type = newType
    step.name = PRESET_DEFAULT_NAMES[newType]
    if (newType !== 'custom') {
      step.matrix = computeMatrixFromPreset(newType, step.params, step.matrix)
    }
  }

  function syncStepMatrixFromParams(stepId: string): void {
    const step = steps.value.find((s) => s.id === stepId)
    if (!step || step.type === 'custom') return
    step.matrix = computeMatrixFromPreset(step.type, step.params, step.matrix)
  }

  function updateStepMatrixEntry(stepId: string, index: 0 | 1 | 2 | 3, value: number): void {
    const step = steps.value.find((s) => s.id === stepId)
    if (!step || !Number.isFinite(value)) return
    const current = [...step.matrix] as [number, number, number, number]
    current[index] = value
    step.matrix = mat2(current[0], current[1], current[2], current[3])
    step.type = 'custom'
  }

  function setStepMatrix(stepId: string, matrix: Mat2, markCustom = true): void {
    const step = steps.value.find((s) => s.id === stepId)
    if (!step) return
    step.matrix = mat2(matrix[0], matrix[1], matrix[2], matrix[3])
    if (markCustom) {
      step.type = 'custom'
    }
  }

  function toggleStepEnabled(stepId: string): void {
    const step = steps.value.find((s) => s.id === stepId)
    if (!step) return
    step.enabled = !step.enabled
    activeStepIndex.value = Math.min(activeStepIndex.value, enabledSteps.value.length)
  }

  function moveStep(stepId: string, direction: -1 | 1): void {
    const idx = steps.value.findIndex((s) => s.id === stepId)
    if (idx === -1) return
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= steps.value.length) return
    const current = steps.value[idx]
    const target = steps.value[targetIdx]
    if (!current || !target) return
    steps.value[idx] = target
    steps.value[targetIdx] = current
  }

  function duplicateStep(stepId: string): void {
    const idx = steps.value.findIndex((s) => s.id === stepId)
    if (idx === -1) return
    const original = steps.value[idx]
    if (!original) return
    const copy = cloneStep(original)
    copy.id = nextStepId()
    copy.name = `${original.name} (Copy)`
    steps.value.splice(idx + 1, 0, copy)
    activeStepIndex.value = enabledSteps.value.length
  }

  function removeStep(stepId: string): void {
    const idx = steps.value.findIndex((s) => s.id === stepId)
    if (idx !== -1) {
      steps.value.splice(idx, 1)
      activeStepIndex.value = Math.min(activeStepIndex.value, enabledSteps.value.length)
    }
  }

  /**
   * Appends the inverse of the current composite matrix as a new step
   * so users can test "What happens when a transformation is followed by its inverse?"
   */
  function appendCompositeInverseStep(): boolean {
    const composite = evaluatedScene.value.fullCompositeMatrix
    const inv = inverseMat2(composite)
    if (!inv) return false

    const step: TransformationStep = {
      id: nextStepId(),
      dimension: '2d-linear',
      name: 'Inverse M⁻¹',
      type: 'custom',
      enabled: true,
      params: defaultStepParams(),
      matrix: inv,
    }
    steps.value.push(step)
    activeStepIndex.value = enabledSteps.value.length
    return true
  }

  function clearSteps(): void {
    steps.value = []
    activeStepIndex.value = 0
  }

  function loadEducationalPreset(presetId: string): void {
    const preset = EDUCATIONAL_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    activeEducationalPresetId.value = preset.id
    sceneStore.setSceneObjects(preset.objects)
    steps.value = preset.steps.map(cloneStep)
    visualizationMode.value = preset.visualizationMode
    vectorFieldMode.value = preset.vectorFieldMode
    pushforwardStyle.value = preset.pushforwardStyle
    showBasisVectors.value = preset.showBasisVectors
    showUnitSquare.value = preset.showUnitSquare
    showEigenvectors.value = preset.showEigenvectors
    activeStepIndex.value = preset.steps.filter((s) => s.enabled).length
  }

  return {
    steps,
    enabledSteps,
    visualizationMode,
    activeStepIndex,
    vectorFieldMode,
    pushforwardStyle,
    showBasisVectors,
    showUnitSquare,
    showEigenvectors,
    activeEducationalPresetId,
    evaluatedScene,
    addStep,
    updateStepPresetType,
    syncStepMatrixFromParams,
    updateStepMatrixEntry,
    setStepMatrix,
    toggleStepEnabled,
    moveStep,
    duplicateStep,
    removeStep,
    appendCompositeInverseStep,
    clearSteps,
    loadEducationalPreset,
  }
})
