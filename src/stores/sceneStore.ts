import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Vec2 } from '../domain/math/Vector2'
import {
  SCALAR_FIELD_PRESETS,
  VECTOR_FIELD_PRESETS,
  type GeometricSceneObject,
  type ScalarFieldPresetId,
  type SceneObject,
  type VectorFieldInputMode,
  type VectorFieldPresetId,
  type VectorFieldSceneObject,
} from '../domain/scene/SceneObject'
import { EDUCATIONAL_PRESETS } from '../engine/educationalPresets'

const OBJECT_PALETTE = [
  '#38bdf8',
  '#f59e0b',
  '#a855f7',
  '#34d399',
  '#f43f5e',
  '#fb7185',
  '#60a5fa',
  '#eab308',
]

let nextIdCounter = 100

function generateId(prefix: string): string {
  nextIdCounter += 1
  return `${prefix}-${nextIdCounter}`
}

function cloneSceneObject(obj: SceneObject): SceneObject {
  if (obj.type === 'polygon') {
    return {
      ...obj,
      style: { ...obj.style },
      vertices: obj.vertices.map((v) => [v[0], v[1]] as const),
    }
  }
  if (obj.type === 'vector-field') {
    return {
      ...obj,
      style: { ...obj.style },
      domain: { ...obj.domain },
    }
  }
  return {
    ...obj,
    style: { ...obj.style },
  }
}

export const useSceneStore = defineStore('scene', () => {
  const defaultPreset = EDUCATIONAL_PRESETS[0]!
  const objects = ref<SceneObject[]>(defaultPreset.objects.map(cloneSceneObject))
  const selectedObjectId = ref<string | null>(objects.value[0]?.id ?? null)

  const geometricObjects = computed<GeometricSceneObject[]>(() =>
    objects.value.filter((o): o is GeometricSceneObject => o.category === 'geometric'),
  )

  const vectorFields = computed<VectorFieldSceneObject[]>(() =>
    objects.value.filter((o): o is VectorFieldSceneObject => o.category === 'field'),
  )

  const selectedObject = computed<SceneObject | null>(
    () => objects.value.find((o) => o.id === selectedObjectId.value) ?? null,
  )

  function pickColor(): string {
    return OBJECT_PALETTE[objects.value.length % OBJECT_PALETTE.length] ?? '#38bdf8'
  }

  function addObject(type: SceneObject['type']): SceneObject {
    const color = pickColor()
    let newObj: SceneObject

    switch (type) {
      case 'point':
        newObj = {
          id: generateId('pt'),
          name: `Point P${geometricObjects.value.length + 1}`,
          category: 'geometric',
          type: 'point',
          visible: true,
          style: { color, fillOpacity: 1, strokeWidth: 2 },
          x: 2,
          y: 1,
        }
        break

      case 'vector':
        newObj = {
          id: generateId('vec'),
          name: `v${geometricObjects.value.length + 1}`,
          category: 'geometric',
          type: 'vector',
          visible: true,
          style: { color, fillOpacity: 0, strokeWidth: 3 },
          ox: 0,
          oy: 0,
          dx: 1.5,
          dy: 2,
        }
        break

      case 'line':
        newObj = {
          id: generateId('line'),
          name: `Segment L${geometricObjects.value.length + 1}`,
          category: 'geometric',
          type: 'line',
          visible: true,
          style: { color, fillOpacity: 0, strokeWidth: 2.2 },
          x1: -2,
          y1: -1,
          x2: 2,
          y2: 2,
          infinite: false,
        }
        break

      case 'polygon':
        newObj = {
          id: generateId('poly'),
          name: `Polygon ${geometricObjects.value.length + 1}`,
          category: 'geometric',
          type: 'polygon',
          shapeKind: 'rectangle',
          visible: true,
          style: { color, fillOpacity: 0.18, strokeWidth: 2.4 },
          vertices: [
            [0, 0],
            [2, 0],
            [2, 1.5],
            [0, 1.5],
          ],
        }
        break

      case 'circle':
        newObj = {
          id: generateId('circle'),
          name: `Circle C${geometricObjects.value.length + 1}`,
          category: 'geometric',
          type: 'circle',
          visible: true,
          style: { color, fillOpacity: 0.12, strokeWidth: 2.2 },
          cx: 1,
          cy: 1,
          radius: 1.5,
        }
        break

      case 'curve':
        newObj = {
          id: generateId('curve'),
          name: `Curve f${geometricObjects.value.length + 1}`,
          category: 'geometric',
          type: 'curve',
          curveKind: 'function',
          exprX: 't',
          exprY: '0.5 * x^2 - 1',
          tMin: -3,
          tMax: 3,
          samples: 100,
          visible: true,
          style: { color, fillOpacity: 0, strokeWidth: 2.4 },
        }
        break

      case 'vector-field':
        newObj = {
          id: generateId('field'),
          name: `Vector Field ${vectorFields.value.length + 1}`,
          category: 'field',
          type: 'vector-field',
          preset: 'rotational',
          exprP: '-y',
          exprQ: 'x',
          inputMode: 'vector',
          scalarPreset: 'bowl',
          exprScalar: '(x^2 + y^2) / 4',
          colorOverlay: 'none',
          showContours: true,
          visible: true,
          style: { color: '#2dd4bf', fillOpacity: 0, strokeWidth: 1.8 },
          domain: { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
          stepsX: 9,
          stepsY: 9,
          arrowScale: 0.22,
          normalizeArrows: false,
        }
        break
    }

    objects.value.push(newObj)
    selectedObjectId.value = newObj.id
    return newObj
  }

  function addScalarGradientField(): VectorFieldSceneObject {
    const preset = SCALAR_FIELD_PRESETS.bowl
    const newField: VectorFieldSceneObject = {
      id: generateId('field'),
      name: 'Scalar Potential ∇f (Bowl)',
      category: 'field',
      type: 'vector-field',
      preset: 'custom',
      exprP: preset.exprP,
      exprQ: preset.exprQ,
      inputMode: 'scalar-gradient',
      scalarPreset: 'bowl',
      exprScalar: preset.exprScalar,
      colorOverlay: 'scalar',
      showContours: true,
      visible: true,
      style: { color: '#2dd4bf', fillOpacity: 0, strokeWidth: 1.8 },
      domain: { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
      stepsX: 9,
      stepsY: 9,
      arrowScale: 0.22,
      normalizeArrows: false,
    }
    objects.value.push(newField)
    selectedObjectId.value = newField.id
    return newField
  }

  function removeObject(id: string): void {
    const idx = objects.value.findIndex((o) => o.id === id)
    if (idx !== -1) {
      objects.value.splice(idx, 1)
      if (selectedObjectId.value === id) {
        selectedObjectId.value = objects.value[0]?.id ?? null
      }
    }
  }

  function duplicateObject(id: string): void {
    const existing = objects.value.find((o) => o.id === id)
    if (!existing) return
    const copy = cloneSceneObject(existing)
    copy.id = generateId(existing.type)
    copy.name = `${existing.name} (Copy)`
    objects.value.push(copy)
    selectedObjectId.value = copy.id
  }

  function toggleVisibility(id: string): void {
    const obj = objects.value.find((o) => o.id === id)
    if (obj) {
      obj.visible = !obj.visible
    }
  }

  function applyVectorFieldPreset(fieldId: string, preset: VectorFieldPresetId): void {
    const obj = objects.value.find(
      (o): o is VectorFieldSceneObject => o.id === fieldId && o.type === 'vector-field',
    )
    if (!obj) return
    obj.preset = preset
    if (preset !== 'custom') {
      const def = VECTOR_FIELD_PRESETS[preset]
      obj.exprP = def.exprP
      obj.exprQ = def.exprQ
      obj.name = def.label
    }
  }

  function setFieldInputMode(fieldId: string, mode: VectorFieldInputMode): void {
    const obj = objects.value.find(
      (o): o is VectorFieldSceneObject => o.id === fieldId && o.type === 'vector-field',
    )
    if (!obj) return
    obj.inputMode = mode
    if (mode === 'scalar-gradient') {
      const presetKey =
        obj.scalarPreset && obj.scalarPreset !== 'custom' ? obj.scalarPreset : 'bowl'
      obj.scalarPreset = obj.scalarPreset ?? 'bowl'
      if (!obj.exprScalar) {
        obj.exprScalar = SCALAR_FIELD_PRESETS[presetKey].exprScalar
      }
      if (!obj.colorOverlay || obj.colorOverlay === 'none') {
        obj.colorOverlay = 'scalar'
      }
      obj.showContours = obj.showContours ?? true
    } else if (obj.colorOverlay === 'scalar') {
      obj.colorOverlay = 'none'
    }
  }

  function applyScalarFieldPreset(fieldId: string, preset: ScalarFieldPresetId): void {
    const obj = objects.value.find(
      (o): o is VectorFieldSceneObject => o.id === fieldId && o.type === 'vector-field',
    )
    if (!obj) return
    obj.scalarPreset = preset
    obj.inputMode = 'scalar-gradient'
    if (preset !== 'custom') {
      const def = SCALAR_FIELD_PRESETS[preset]
      obj.exprScalar = def.exprScalar
      obj.exprP = def.exprP
      obj.exprQ = def.exprQ
      obj.name = `∇f: ${def.label}`
    }
  }

  function setSceneObjects(newObjects: SceneObject[]): void {
    objects.value = newObjects.map(cloneSceneObject)
    selectedObjectId.value = objects.value[0]?.id ?? null
  }

  function clearScene(): void {
    objects.value = []
    selectedObjectId.value = null
  }

  function clearVectorFields(): void {
    objects.value = objects.value.filter((o) => o.category !== 'field')
    if (selectedObjectId.value && !objects.value.some((o) => o.id === selectedObjectId.value)) {
      selectedObjectId.value = objects.value[0]?.id ?? null
    }
  }

  function clearGeometricObjects(): void {
    objects.value = objects.value.filter((o) => o.category !== 'geometric')
    if (selectedObjectId.value && !objects.value.some((o) => o.id === selectedObjectId.value)) {
      selectedObjectId.value = objects.value[0]?.id ?? null
    }
  }

  function updatePointCoordinates(id: string, pos: Vec2): void {
    const obj = objects.value.find((o) => o.id === id)
    if (!obj || obj.type !== 'point') return
    obj.x = pos[0]
    obj.y = pos[1]
  }

  function updateVectorTip(id: string, tipPos: Vec2): void {
    const obj = objects.value.find((o) => o.id === id)
    if (!obj || obj.type !== 'vector') return
    obj.dx = Number((tipPos[0] - obj.ox).toFixed(4))
    obj.dy = Number((tipPos[1] - obj.oy).toFixed(4))
  }

  return {
    objects,
    selectedObjectId,
    selectedObject,
    geometricObjects,
    vectorFields,
    addObject,
    addScalarGradientField,
    removeObject,
    duplicateObject,
    toggleVisibility,
    applyVectorFieldPreset,
    setFieldInputMode,
    applyScalarFieldPreset,
    setSceneObjects,
    clearScene,
    clearVectorFields,
    clearGeometricObjects,
    updatePointCoordinates,
    updateVectorTip,
  }
})
