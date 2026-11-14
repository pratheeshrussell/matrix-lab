import type { Mat2 } from '../domain/math/Matrix2'
import type {
  PushforwardSamplingStyle,
  TransformationPresetType,
  TransformationStep,
  VectorFieldTransformMode,
  VisualizationMode,
} from '../domain/math/Transform'
import type { Vec2 } from '../domain/math/Vector2'
import type { SceneObject } from '../domain/scene/SceneObject'

export interface SharedStateSnapshot {
  v: 1
  objects: SceneObject[]
  steps: TransformationStep[]
  visualizationMode: VisualizationMode
  activeStepIndex: number
  morphT: number
  vectorFieldMode: VectorFieldTransformMode
  pushforwardStyle: PushforwardSamplingStyle
  showBasisVectors: boolean
  showUnitSquare: boolean
  showEigenvectors: boolean
  showSvd: boolean
  showSubspaces: boolean
  showTransformedGrid: boolean
  showStreamlines: boolean
  customFlowSeeds: Vec2[]
  activeEducationalPresetId: string
}

const VALID_VIS_MODES = new Set<VisualizationMode>([
  'original',
  'overlay',
  'transformed',
  'step-through',
])
const VALID_FIELD_MODES = new Set<VectorFieldTransformMode>(['fixed-samples', 'pushforward'])
const VALID_PUSH_STYLES = new Set<PushforwardSamplingStyle>([
  'uniform-target-grid',
  'mapped-sample-points',
])
const VALID_STEP_TYPES = new Set<TransformationPresetType>([
  'rotation',
  'scaling',
  'reflection',
  'shear',
  'projection',
  'custom',
])

function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToUtf8(token: string): string | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/')
    const padLen = (4 - (padded.length % 4)) % 4
    const base64 = padded + '='.repeat(padLen)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function isFinitePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  )
}

function isValidStep(step: unknown): step is TransformationStep {
  if (!step || typeof step !== 'object') return false
  const s = step as Record<string, unknown>
  if (typeof s.id !== 'string' || typeof s.name !== 'string') return false
  if (typeof s.type !== 'string' || !VALID_STEP_TYPES.has(s.type as TransformationPresetType)) {
    return false
  }
  if (typeof s.enabled !== 'boolean') return false
  if (!Array.isArray(s.matrix) || s.matrix.length !== 4) return false
  if (!s.matrix.every((n) => typeof n === 'number' && Number.isFinite(n))) return false
  if (!s.params || typeof s.params !== 'object') return false
  return true
}

function isValidSceneObject(obj: unknown): obj is SceneObject {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return false
  if (o.category !== 'geometric' && o.category !== 'field') return false
  if (typeof o.visible !== 'boolean') return false
  if (!o.style || typeof o.style !== 'object') return false
  return typeof o.type === 'string'
}

export function encodeShareState(snapshot: SharedStateSnapshot): string {
  return utf8ToBase64Url(JSON.stringify(snapshot))
}

export function decodeShareState(token: string): SharedStateSnapshot | null {
  if (!token || typeof token !== 'string') return null
  const json = base64UrlToUtf8(token.trim())
  if (!json) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const data = parsed as Record<string, unknown>
  if (data.v !== 1) return null
  if (!Array.isArray(data.objects) || !data.objects.every(isValidSceneObject)) return null
  if (!Array.isArray(data.steps) || !data.steps.every(isValidStep)) return null

  const visualizationMode = VALID_VIS_MODES.has(data.visualizationMode as VisualizationMode)
    ? (data.visualizationMode as VisualizationMode)
    : 'overlay'
  const vectorFieldMode = VALID_FIELD_MODES.has(data.vectorFieldMode as VectorFieldTransformMode)
    ? (data.vectorFieldMode as VectorFieldTransformMode)
    : 'pushforward'
  const pushforwardStyle = VALID_PUSH_STYLES.has(data.pushforwardStyle as PushforwardSamplingStyle)
    ? (data.pushforwardStyle as PushforwardSamplingStyle)
    : 'uniform-target-grid'

  const enabledCount = data.steps.filter((s) => s.enabled).length
  const rawStepIdx = typeof data.activeStepIndex === 'number' ? data.activeStepIndex : enabledCount
  const activeStepIndex = Math.max(0, Math.min(enabledCount, Math.round(rawStepIdx)))

  const rawMorphT = typeof data.morphT === 'number' && Number.isFinite(data.morphT) ? data.morphT : 1
  const morphT = Math.max(0, Math.min(1, rawMorphT))

  const customFlowSeeds: Vec2[] = Array.isArray(data.customFlowSeeds)
    ? data.customFlowSeeds.filter(isFinitePair).map((p) => [p[0], p[1]])
    : []

  const sanitizedSteps: TransformationStep[] = data.steps.map((s) => ({
    ...s,
    dimension: '2d-linear',
    params: { ...s.params },
    matrix: [s.matrix[0], s.matrix[1], s.matrix[2], s.matrix[3]] as Mat2,
  }))

  return {
    v: 1,
    objects: data.objects,
    steps: sanitizedSteps,
    visualizationMode,
    activeStepIndex,
    morphT,
    vectorFieldMode,
    pushforwardStyle,
    showBasisVectors: typeof data.showBasisVectors === 'boolean' ? data.showBasisVectors : true,
    showUnitSquare: typeof data.showUnitSquare === 'boolean' ? data.showUnitSquare : true,
    showEigenvectors: typeof data.showEigenvectors === 'boolean' ? data.showEigenvectors : false,
    showSvd: typeof data.showSvd === 'boolean' ? data.showSvd : false,
    showSubspaces: typeof data.showSubspaces === 'boolean' ? data.showSubspaces : true,
    showTransformedGrid:
      typeof data.showTransformedGrid === 'boolean' ? data.showTransformedGrid : true,
    showStreamlines: typeof data.showStreamlines === 'boolean' ? data.showStreamlines : true,
    customFlowSeeds,
    activeEducationalPresetId:
      typeof data.activeEducationalPresetId === 'string'
        ? data.activeEducationalPresetId
        : 'default-workbench',
  }
}

export function extractShareTokenFromLocation(search: string, hash: string): string | null {
  const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash
  if (cleanHash) {
    const hashParams = new URLSearchParams(cleanHash)
    const fromHash = hashParams.get('s')
    if (fromHash) return fromHash
  }

  if (search) {
    const searchParams = new URLSearchParams(search)
    const fromSearch = searchParams.get('s')
    if (fromSearch) return fromSearch
  }

  return null
}

export function buildShareUrl(currentHref: string, snapshot: SharedStateSnapshot): string {
  const url = new URL(currentHref)
  url.searchParams.delete('s')
  url.hash = `s=${encodeShareState(snapshot)}`
  return url.toString()
}
