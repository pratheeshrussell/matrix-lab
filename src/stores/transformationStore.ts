import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  IDENTITY_MAT2,
  composePipeline,
  formatNumber,
  inverseMat2,
  mat2,
  multiplyMat2,
  type Mat2,
} from '../domain/math/Matrix2'
import type { Vec2 } from '../domain/math/Vector2'
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
import { analyzeMatrix2 } from '../engine/MatrixProperties'
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
  const morphT = ref<number>(1)
  const vectorFieldMode = ref<VectorFieldTransformMode>(defaultPreset.vectorFieldMode)
  const pushforwardStyle = ref<PushforwardSamplingStyle>(defaultPreset.pushforwardStyle)
  const showBasisVectors = ref<boolean>(defaultPreset.showBasisVectors)
  const showUnitSquare = ref<boolean>(defaultPreset.showUnitSquare)
  const showEigenvectors = ref<boolean>(defaultPreset.showEigenvectors)
  const showSvd = ref<boolean>(false)
  const showTransformedGrid = ref<boolean>(true)
  const showStreamlines = ref<boolean>(true)
  const customFlowSeeds = ref<Vec2[]>([])
  const activeEducationalPresetId = ref<string>(defaultPreset.id)

  const sceneStore = useSceneStore()

  const enabledSteps = computed(() => steps.value.filter((s) => s.enabled))

  const evaluatedScene = computed<EvaluatedScene>(() =>
    evaluateScene(sceneStore.objects, steps.value, {
      visualizationMode: visualizationMode.value,
      activeStepIndex: activeStepIndex.value,
      morphT: morphT.value,
      vectorFieldMode: vectorFieldMode.value,
      pushforwardStyle: pushforwardStyle.value,
      showBasisVectors: showBasisVectors.value,
      showUnitSquare: showUnitSquare.value,
      showEigenvectors: showEigenvectors.value,
      showSvd: showSvd.value,
      showTransformedGrid: showTransformedGrid.value,
      showStreamlines: showStreamlines.value,
      customFlowSeeds: customFlowSeeds.value,
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
    morphT.value = 1
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

  /**
   * Expands the current composite matrix M into 3 SVD pipeline steps
   * executed in order V^T -> Sigma -> U so that U * Sigma * V^T = M.
   */
  function decomposePipelineToSvd(): void {
    const composite = evaluatedScene.value.fullCompositeMatrix
    const { svd } = analyzeMatrix2(composite)

    const vtParams = defaultStepParams()
    vtParams.angleDeg = Number((-svd.thetaVDeg).toFixed(2))
    const stepVT: TransformationStep = {
      id: nextStepId(),
      dimension: '2d-linear',
      name: `SVD Vᵀ (Rotate ${formatNumber(-svd.thetaVDeg, 1)}°)`,
      type: 'rotation',
      enabled: true,
      params: vtParams,
      matrix: svd.vT,
    }

    const sigmaParams = defaultStepParams()
    sigmaParams.sx = Number(svd.sigma1.toFixed(3))
    sigmaParams.sy = Number(svd.sigma2.toFixed(3))
    const stepSigma: TransformationStep = {
      id: nextStepId(),
      dimension: '2d-linear',
      name: `SVD Σ (Scale ${formatNumber(svd.sigma1, 2)}, ${formatNumber(svd.sigma2, 2)})`,
      type: 'scaling',
      enabled: true,
      params: sigmaParams,
      matrix: svd.sigma,
    }

    const uParams = defaultStepParams()
    uParams.angleDeg = Number(svd.uAngleDeg.toFixed(2))
    if (svd.uIsReflection) {
      uParams.reflectionKind = 'custom-angle'
    }
    const stepU: TransformationStep = {
      id: nextStepId(),
      dimension: '2d-linear',
      name: svd.uIsReflection
        ? `SVD U (Reflect ${formatNumber(svd.uAngleDeg, 1)}°)`
        : `SVD U (Rotate ${formatNumber(svd.uAngleDeg, 1)}°)`,
      type: svd.uIsReflection ? 'reflection' : 'rotation',
      enabled: true,
      params: uParams,
      matrix: svd.u,
    }

    steps.value = [stepVT, stepSigma, stepU]
    activeStepIndex.value = 3
    morphT.value = 1
    showSvd.value = true
    if (visualizationMode.value === 'original') {
      visualizationMode.value = 'overlay'
    }
  }

  function clearSteps(): void {
    steps.value = []
    activeStepIndex.value = 0
    morphT.value = 1
  }

  function setMorphT(t: number): void {
    const clamped = Math.max(0, Math.min(1, t))
    morphT.value = clamped
    const count = enabledSteps.value.length
    if (count > 0) {
      activeStepIndex.value =
        clamped <= 0 ? 0 : Math.min(count, Math.ceil(clamped * count - 1e-9))
    }
  }

  function setActiveStepIndex(idx: number): void {
    const count = enabledSteps.value.length
    const clampedIdx = Math.max(0, Math.min(count, Math.round(idx)))
    activeStepIndex.value = clampedIdx
    morphT.value = count > 0 ? clampedIdx / count : 1
  }

  /**
   * Direct canvas dragging of transformed basis vector tip A*e1 or A*e2.
   * Updates the active transformation step so the composite matrix columns
   * match the user's dragged basis vector position.
   */
  function setTransformedBasisColumn(which: 'e1' | 'e2', targetVec: Vec2): void {
    morphT.value = 1
    const activeList =
      visualizationMode.value === 'step-through'
        ? enabledSteps.value.slice(0, Math.max(1, activeStepIndex.value))
        : enabledSteps.value

    if (activeList.length === 0) {
      const m: Mat2 =
        which === 'e1'
          ? mat2(targetVec[0], 0, targetVec[1], 1)
          : mat2(1, targetVec[0], 0, targetVec[1])
      const step: TransformationStep = {
        id: nextStepId(),
        dimension: '2d-linear',
        name: 'Dragged 2×2 Matrix',
        type: 'custom',
        enabled: true,
        params: defaultStepParams(),
        matrix: m,
      }
      steps.value.push(step)
      activeStepIndex.value = enabledSteps.value.length
      return
    }

    const lastStep = activeList[activeList.length - 1]!
    const currentComposite = composePipeline(activeList.map((s) => s.matrix))
    const desiredComposite: Mat2 =
      which === 'e1'
        ? mat2(targetVec[0], currentComposite[1], targetVec[1], currentComposite[3])
        : mat2(currentComposite[0], targetVec[0], currentComposite[2], targetVec[1])

    if (activeList.length === 1) {
      lastStep.matrix = desiredComposite
      lastStep.type = 'custom'
      return
    }

    const prevMatrix = composePipeline(activeList.slice(0, -1).map((s) => s.matrix))
    const invPrev = inverseMat2(prevMatrix)
    if (invPrev) {
      lastStep.matrix = multiplyMat2(desiredComposite, invPrev)
      lastStep.type = 'custom'
    } else {
      // Earlier step is singular; update lastStep's column directly as fallback
      lastStep.matrix =
        which === 'e1'
          ? mat2(targetVec[0], lastStep.matrix[1], targetVec[1], lastStep.matrix[3])
          : mat2(lastStep.matrix[0], targetVec[0], lastStep.matrix[2], targetVec[1])
      lastStep.type = 'custom'
    }
  }

  function addFlowSeed(pt: Vec2): void {
    customFlowSeeds.value.push([Number(pt[0].toFixed(3)), Number(pt[1].toFixed(3))])
  }

  function clearFlowSeeds(): void {
    customFlowSeeds.value = []
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
    morphT.value = 1
    customFlowSeeds.value = []
  }

  return {
    steps,
    enabledSteps,
    visualizationMode,
    activeStepIndex,
    morphT,
    vectorFieldMode,
    pushforwardStyle,
    showBasisVectors,
    showUnitSquare,
    showEigenvectors,
    showSvd,
    showTransformedGrid,
    showStreamlines,
    customFlowSeeds,
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
    decomposePipelineToSvd,
    clearSteps,
    setMorphT,
    setActiveStepIndex,
    setTransformedBasisColumn,
    addFlowSeed,
    clearFlowSeeds,
    loadEducationalPreset,
  }
})
