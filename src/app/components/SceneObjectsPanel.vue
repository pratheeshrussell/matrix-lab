<script setup lang="ts">
import { computed } from 'vue'
import type { Vec2 } from '../../domain/math/Vector2'
import {
  VECTOR_FIELD_PRESETS,
  type PolygonSceneObject,
  type SceneObject,
  type VectorFieldPresetId,
} from '../../domain/scene/SceneObject'
import { useSceneStore } from '../../stores/sceneStore'
import { useTransformationStore } from '../../stores/transformationStore'
import KatexMath from './KatexMath.vue'

const sceneStore = useSceneStore()
const transformStore = useTransformationStore()

const addButtons: { type: SceneObject['type']; label: string; icon: string }[] = [
  { type: 'point', label: 'Point', icon: '•' },
  { type: 'vector', label: 'Vector', icon: '↗' },
  { type: 'line', label: 'Line', icon: '╱' },
  { type: 'polygon', label: 'Polygon', icon: '▱' },
  { type: 'circle', label: 'Circle', icon: '◯' },
  { type: 'curve', label: 'Curve', icon: '∿' },
]

const evaluatedFieldsById = computed(() => {
  const map = new Map<string, (typeof transformStore.evaluatedScene.transformedFields)[number]>()
  for (const f of transformStore.evaluatedScene.transformedFields) {
    map.set(f.id, f)
  }
  return map
})

const evaluatedCurvesById = computed(() => {
  const map = new Map<string, string | null>()
  for (const item of transformStore.evaluatedScene.originalGeometry) {
    if (item.kind === 'curve') {
      map.set(item.id, item.expressionError)
    }
  }
  return map
})

function updatePolygonVertex(
  poly: PolygonSceneObject,
  vertexIndex: number,
  coordIndex: 0 | 1,
  rawValue: string,
): void {
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) return
  const existing = poly.vertices[vertexIndex]
  if (!existing) return
  const updated: Vec2 = coordIndex === 0 ? [parsed, existing[1]] : [existing[0], parsed]
  poly.vertices.splice(vertexIndex, 1, updated)
}

function addPolygonVertex(poly: PolygonSceneObject): void {
  const last = poly.vertices[poly.vertices.length - 1] ?? [1, 1]
  poly.vertices.push([last[0] + 0.5, last[1] + 0.5])
}

function removePolygonVertex(poly: PolygonSceneObject, index: number): void {
  if (poly.vertices.length <= 3) return
  poly.vertices.splice(index, 1)
}

function handleFieldPresetChange(fieldId: string, event: Event): void {
  const select = event.target as HTMLSelectElement
  sceneStore.applyVectorFieldPreset(fieldId, select.value as VectorFieldPresetId)
}
</script>

<template>
  <aside class="panel scene-panel">
    <div class="panel-header">
      <h2>Scene &amp; Fields</h2>
      <span class="count-pill">{{ sceneStore.objects.length }} items</span>
    </div>

    <!-- Quick Add Geometric Objects + Vector Field -->
    <div class="quick-add-section">
      <div class="section-label">Add Geometric Object</div>
      <div class="add-grid">
        <button
          v-for="btn in addButtons"
          :key="btn.type"
          type="button"
          class="add-chip"
          @click="sceneStore.addObject(btn.type)"
        >
          <span class="chip-icon">{{ btn.icon }}</span>
          <span>{{ btn.label }}</span>
        </button>
      </div>

      <button
        type="button"
        class="add-field-btn"
        @click="sceneStore.addObject('vector-field')"
      >
        <span>+ Add Vector Field</span>
        <KatexMath tex="\mathbf{F}(x,y)" />
      </button>
    </div>

    <div class="panel-scroll">
      <!-- Vector Fields Section (First-Class MVP Feature) -->
      <section class="object-group">
        <div class="group-header">
          <h3>Vector Fields</h3>
          <span class="group-count">{{ sceneStore.vectorFields.length }}</span>
        </div>

        <!-- Global Vector Field Transformation Semantics Selector -->
        <div class="semantics-box">
          <div class="semantics-title">
            <span>Field Transformation Rule</span>
          </div>

          <label
            class="semantics-option"
            :class="{ selected: transformStore.vectorFieldMode === 'pushforward' }"
          >
            <input
              v-model="transformStore.vectorFieldMode"
              type="radio"
              value="pushforward"
            />
            <div class="semantics-body">
              <div class="semantics-name">B. Geometric Pushforward (Natural)</div>
              <div class="semantics-formula">
                <KatexMath tex="\mathbf{F}'(\mathbf{x}') = A\,\mathbf{F}(A^{-1}\mathbf{x}')" />
              </div>
              <p class="semantics-desc">
                Transforms both sample positions and vector values under coordinate map
                <KatexMath tex="\mathbf{x}' = A\mathbf{x}" />.
              </p>
            </div>
          </label>

          <div
            v-if="transformStore.vectorFieldMode === 'pushforward'"
            class="sub-sampling-row"
          >
            <span class="sub-label">Sample display:</span>
            <select v-model="transformStore.pushforwardStyle" class="mini-select">
              <option value="uniform-target-grid">
                Uniform Grid via A⁻¹ pullback: A·F(A⁻¹x')
              </option>
              <option value="mapped-sample-points">
                Mapped Sample Points: x' = A·x, v' = A·F(x)
              </option>
            </select>
          </div>

          <label
            class="semantics-option"
            :class="{ selected: transformStore.vectorFieldMode === 'fixed-samples' }"
          >
            <input
              v-model="transformStore.vectorFieldMode"
              type="radio"
              value="fixed-samples"
            />
            <div class="semantics-body">
              <div class="semantics-name">A. Transform Values at Fixed Coordinates</div>
              <div class="semantics-formula">
                <KatexMath tex="\mathbf{G}(\mathbf{x}) = A\,\mathbf{F}(\mathbf{x})" />
              </div>
              <p class="semantics-desc">
                Arrow tails stay fixed at original grid coordinates <KatexMath tex="\mathbf{x}" />;
                only arrow vectors are multiplied by <KatexMath tex="A" />.
              </p>
            </div>
          </label>
        </div>

        <div v-if="sceneStore.vectorFields.length === 0" class="empty-hint">
          No vector fields in scene. Click "+ Add Vector Field" above.
        </div>

        <div
          v-for="field in sceneStore.vectorFields"
          :key="field.id"
          class="object-card field-card"
          :class="{ selected: sceneStore.selectedObjectId === field.id }"
          @click="sceneStore.selectedObjectId = field.id"
        >
          <div class="card-top">
            <input
              v-model="field.style.color"
              type="color"
              class="color-swatch"
              title="Field arrow color"
              @click.stop
            />
            <input
              v-model="field.name"
              type="text"
              class="name-input"
              aria-label="Vector field name"
            />
            <div class="card-actions" @click.stop>
              <button
                type="button"
                class="icon-btn"
                :title="field.visible ? 'Hide field' : 'Show field'"
                @click="sceneStore.toggleVisibility(field.id)"
              >
                {{ field.visible ? '👁' : '🚫' }}
              </button>
              <button
                type="button"
                class="icon-btn"
                title="Duplicate field"
                @click="sceneStore.duplicateObject(field.id)"
              >
                ⧉
              </button>
              <button
                type="button"
                class="icon-btn danger"
                title="Remove field"
                @click="sceneStore.removeObject(field.id)"
              >
                ✕
              </button>
            </div>
          </div>

          <div class="card-body">
            <div class="field-row">
              <label>Preset</label>
              <select
                :value="field.preset"
                class="mini-select"
                @change="handleFieldPresetChange(field.id, $event)"
              >
                <option value="radial">Radial: (x, y)</option>
                <option value="rotational">Rotational: (-y, x)</option>
                <option value="saddle">Saddle: (x, -y)</option>
                <option value="constant">Constant: (1, 0)</option>
                <option value="custom">Custom Expression</option>
              </select>
            </div>

            <div class="expr-grid">
              <div class="expr-field">
                <label><KatexMath tex="P(x, y) =" /></label>
                <input
                  v-model="field.exprP"
                  type="text"
                  class="mono-input"
                  @input="field.preset = 'custom'"
                />
              </div>
              <div class="expr-field">
                <label><KatexMath tex="Q(x, y) =" /></label>
                <input
                  v-model="field.exprQ"
                  type="text"
                  class="mono-input"
                  @input="field.preset = 'custom'"
                />
              </div>
            </div>

            <div
              v-if="evaluatedFieldsById.get(field.id)?.expressionError"
              class="error-banner"
            >
              {{ evaluatedFieldsById.get(field.id)?.expressionError }}
            </div>

            <div
              v-if="evaluatedFieldsById.get(field.id)?.singularPushforwardUnavailable"
              class="warning-banner"
            >
              {{ evaluatedFieldsById.get(field.id)?.singularExplanation }}
            </div>

            <div class="param-grid-2">
              <label class="num-field">
                <span>Grid X ({{ field.stepsX }})</span>
                <input
                  v-model.number="field.stepsX"
                  type="range"
                  min="3"
                  max="19"
                  step="1"
                />
              </label>
              <label class="num-field">
                <span>Grid Y ({{ field.stepsY }})</span>
                <input
                  v-model.number="field.stepsY"
                  type="range"
                  min="3"
                  max="19"
                  step="1"
                />
              </label>
            </div>

            <div class="param-grid-2">
              <label class="num-field">
                <span>Arrow Scale ({{ field.arrowScale.toFixed(2) }})</span>
                <input
                  v-model.number="field.arrowScale"
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.01"
                />
              </label>
              <label class="checkbox-inline">
                <input v-model="field.normalizeArrows" type="checkbox" />
                <span>Normalize lengths</span>
              </label>
            </div>

            <details class="domain-details">
              <summary>Sampling Region [{{ field.domain.xMin }}, {{ field.domain.xMax }}] × [{{ field.domain.yMin }}, {{ field.domain.yMax }}]</summary>
              <div class="param-grid-4">
                <label>
                  <span>xMin</span>
                  <input v-model.number="field.domain.xMin" type="number" step="0.5" class="num-input" />
                </label>
                <label>
                  <span>xMax</span>
                  <input v-model.number="field.domain.xMax" type="number" step="0.5" class="num-input" />
                </label>
                <label>
                  <span>yMin</span>
                  <input v-model.number="field.domain.yMin" type="number" step="0.5" class="num-input" />
                </label>
                <label>
                  <span>yMax</span>
                  <input v-model.number="field.domain.yMax" type="number" step="0.5" class="num-input" />
                </label>
              </div>
            </details>
          </div>
        </div>
      </section>

      <!-- Geometric Objects Section -->
      <section class="object-group">
        <div class="group-header">
          <h3>Geometric Objects</h3>
          <span class="group-count">{{ sceneStore.geometricObjects.length }}</span>
        </div>

        <div v-if="sceneStore.geometricObjects.length === 0" class="empty-hint">
          No geometric objects in scene. Use the buttons above to add shapes or vectors.
        </div>

        <div
          v-for="obj in sceneStore.geometricObjects"
          :key="obj.id"
          class="object-card"
          :class="{ selected: sceneStore.selectedObjectId === obj.id }"
          @click="sceneStore.selectedObjectId = obj.id"
        >
          <div class="card-top">
            <input
              v-model="obj.style.color"
              type="color"
              class="color-swatch"
              title="Object color"
              @click.stop
            />
            <span class="type-tag">{{ obj.type }}</span>
            <input
              v-model="obj.name"
              type="text"
              class="name-input"
              aria-label="Object name"
            />
            <div class="card-actions" @click.stop>
              <button
                type="button"
                class="icon-btn"
                :title="obj.visible ? 'Hide object' : 'Show object'"
                @click="sceneStore.toggleVisibility(obj.id)"
              >
                {{ obj.visible ? '👁' : '🚫' }}
              </button>
              <button
                type="button"
                class="icon-btn"
                title="Duplicate object"
                @click="sceneStore.duplicateObject(obj.id)"
              >
                ⧉
              </button>
              <button
                type="button"
                class="icon-btn danger"
                title="Remove object"
                @click="sceneStore.removeObject(obj.id)"
              >
                ✕
              </button>
            </div>
          </div>

          <div class="card-body">
            <!-- Point Parameters -->
            <div v-if="obj.type === 'point'" class="param-grid-2">
              <label>
                <span>x</span>
                <input v-model.number="obj.x" type="number" step="0.25" class="num-input" />
              </label>
              <label>
                <span>y</span>
                <input v-model.number="obj.y" type="number" step="0.25" class="num-input" />
              </label>
            </div>

            <!-- Vector Parameters -->
            <div v-else-if="obj.type === 'vector'" class="param-grid-4">
              <label>
                <span>Tail x₀</span>
                <input v-model.number="obj.ox" type="number" step="0.25" class="num-input" />
              </label>
              <label>
                <span>Tail y₀</span>
                <input v-model.number="obj.oy" type="number" step="0.25" class="num-input" />
              </label>
              <label>
                <span>Δx</span>
                <input v-model.number="obj.dx" type="number" step="0.25" class="num-input" />
              </label>
              <label>
                <span>Δy</span>
                <input v-model.number="obj.dy" type="number" step="0.25" class="num-input" />
              </label>
            </div>

            <!-- Line / Segment Parameters -->
            <div v-else-if="obj.type === 'line'">
              <div class="param-grid-4">
                <label>
                  <span>x₁</span>
                  <input v-model.number="obj.x1" type="number" step="0.25" class="num-input" />
                </label>
                <label>
                  <span>y₁</span>
                  <input v-model.number="obj.y1" type="number" step="0.25" class="num-input" />
                </label>
                <label>
                  <span>x₂</span>
                  <input v-model.number="obj.x2" type="number" step="0.25" class="num-input" />
                </label>
                <label>
                  <span>y₂</span>
                  <input v-model.number="obj.y2" type="number" step="0.25" class="num-input" />
                </label>
              </div>
              <label class="checkbox-inline mt-xs">
                <input v-model="obj.infinite" type="checkbox" />
                <span>Extend as infinite line</span>
              </label>
            </div>

            <!-- Circle Parameters -->
            <div v-else-if="obj.type === 'circle'" class="param-grid-3">
              <label>
                <span>Center x</span>
                <input v-model.number="obj.cx" type="number" step="0.25" class="num-input" />
              </label>
              <label>
                <span>Center y</span>
                <input v-model.number="obj.cy" type="number" step="0.25" class="num-input" />
              </label>
              <label>
                <span>Radius r</span>
                <input
                  v-model.number="obj.radius"
                  type="number"
                  min="0.1"
                  step="0.25"
                  class="num-input"
                />
              </label>
            </div>

            <!-- Polygon / Rectangle Vertices -->
            <div v-else-if="obj.type === 'polygon'" class="vertices-editor">
              <div
                v-for="(vertex, vIdx) in obj.vertices"
                :key="vIdx"
                class="vertex-row"
              >
                <span class="vertex-tag">V{{ vIdx + 1 }}</span>
                <input
                  :value="vertex[0]"
                  type="number"
                  step="0.25"
                  class="num-input"
                  @input="
                    updatePolygonVertex(
                      obj,
                      vIdx,
                      0,
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
                <input
                  :value="vertex[1]"
                  type="number"
                  step="0.25"
                  class="num-input"
                  @input="
                    updatePolygonVertex(
                      obj,
                      vIdx,
                      1,
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
                <button
                  type="button"
                  class="icon-btn"
                  :disabled="obj.vertices.length <= 3"
                  title="Remove vertex"
                  @click="removePolygonVertex(obj, vIdx)"
                >
                  −
                </button>
              </div>
              <button
                type="button"
                class="btn-xs"
                @click="addPolygonVertex(obj)"
              >
                + Add Vertex
              </button>
            </div>

            <!-- Curve Parameters -->
            <div v-else-if="obj.type === 'curve'">
              <div class="field-row">
                <label>Curve Type</label>
                <select v-model="obj.curveKind" class="mini-select">
                  <option value="function">Function y = f(x)</option>
                  <option value="parametric">Parametric (x(t), y(t))</option>
                </select>
              </div>

              <div v-if="obj.curveKind === 'function'" class="expr-field mt-xs">
                <label><KatexMath tex="f(x) =" /></label>
                <input v-model="obj.exprY" type="text" class="mono-input" />
              </div>

              <div v-else class="expr-grid mt-xs">
                <div class="expr-field">
                  <label><KatexMath tex="x(t) =" /></label>
                  <input v-model="obj.exprX" type="text" class="mono-input" />
                </div>
                <div class="expr-field">
                  <label><KatexMath tex="y(t) =" /></label>
                  <input v-model="obj.exprY" type="text" class="mono-input" />
                </div>
              </div>

              <div
                v-if="evaluatedCurvesById.get(obj.id)"
                class="error-banner"
              >
                {{ evaluatedCurvesById.get(obj.id) }}
              </div>

              <div class="param-grid-2 mt-xs">
                <label>
                  <span>{{ obj.curveKind === 'function' ? 'xMin' : 'tMin' }}</span>
                  <input v-model.number="obj.tMin" type="number" step="0.5" class="num-input" />
                </label>
                <label>
                  <span>{{ obj.curveKind === 'function' ? 'xMax' : 'tMax' }}</span>
                  <input v-model.number="obj.tMax" type="number" step="0.5" class="num-input" />
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.scene-panel {
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-subtle);
  height: 100%;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.9rem;
  border-bottom: 1px solid var(--border-subtle);
}

.panel-header h2 {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-primary);
}

.count-pill {
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.quick-add-section {
  padding: 0.75rem 0.9rem;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.add-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.35rem;
}

.add-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.35rem 0.4rem;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
}

.add-chip:hover {
  border-color: var(--accent-cyan);
  color: var(--text-primary);
  background: rgba(56, 189, 248, 0.08);
}

.chip-icon {
  color: var(--accent-cyan);
  font-weight: 700;
}

.add-field-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.45rem;
  border-radius: 6px;
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.4);
  color: #2dd4bf;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.add-field-btn:hover {
  background: rgba(45, 212, 191, 0.2);
}

.panel-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.object-group {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.group-header h3 {
  margin: 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.group-count {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.semantics-box {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.semantics-title {
  font-size: 0.73rem;
  font-weight: 700;
  color: var(--accent-teal);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.semantics-option {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.45rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: rgba(15, 23, 42, 0.45);
  cursor: pointer;
}

.semantics-option.selected {
  border-color: rgba(45, 212, 191, 0.5);
  background: rgba(45, 212, 191, 0.08);
}

.semantics-option input {
  margin-top: 0.2rem;
  accent-color: #2dd4bf;
}

.semantics-body {
  flex: 1;
}

.semantics-name {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-primary);
}

.semantics-formula {
  margin: 0.2rem 0;
  font-size: 0.8rem;
  color: var(--accent-cyan);
}

.semantics-desc {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.35;
  color: var(--text-muted);
}

.sub-sampling-row {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0 0.25rem 0.2rem 1.4rem;
}

.sub-label {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.object-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.object-card.selected {
  border-color: var(--border-focus);
}

.card-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.color-swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.type-tag {
  font-size: 0.66rem;
  text-transform: uppercase;
  padding: 0.12rem 0.35rem;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.14);
  color: var(--text-secondary);
}

.name-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.15rem 0.3rem;
}

.name-input:focus {
  outline: none;
  border-color: var(--border-focus);
  background: var(--bg-canvas);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.78rem;
  padding: 0.2rem 0.35rem;
  border-radius: 4px;
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-primary);
}

.icon-btn.danger:hover {
  background: rgba(244, 63, 94, 0.2);
  color: #fb7185;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.74rem;
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.mini-select {
  background: var(--bg-canvas);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  padding: 0.25rem 0.45rem;
  font-size: 0.74rem;
}

.expr-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}

.expr-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.mono-input,
.num-input {
  width: 100%;
  background: var(--bg-canvas);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  padding: 0.28rem 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.param-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}

.param-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.35rem;
}

.param-grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
}

.param-grid-2 label,
.param-grid-3 label,
.param-grid-4 label {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  color: var(--text-secondary);
  font-size: 0.7rem;
}

.checkbox-inline {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.vertices-editor {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.vertex-row {
  display: grid;
  grid-template-columns: 26px 1fr 1fr 24px;
  align-items: center;
  gap: 0.3rem;
}

.vertex-tag {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
}

.domain-details summary {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.7rem;
  margin-bottom: 0.3rem;
}

.error-banner {
  padding: 0.35rem 0.5rem;
  border-radius: 5px;
  background: rgba(244, 63, 94, 0.15);
  border: 1px solid rgba(244, 63, 94, 0.4);
  color: #fda4af;
  font-size: 0.7rem;
}

.warning-banner {
  padding: 0.4rem 0.55rem;
  border-radius: 5px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.45);
  color: #fde68a;
  font-size: 0.71rem;
  line-height: 1.35;
}

.empty-hint {
  font-size: 0.74rem;
  color: var(--text-muted);
  font-style: italic;
  padding: 0.3rem 0;
}

.mt-xs {
  margin-top: 0.35rem;
}
</style>
