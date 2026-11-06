<script setup lang="ts">
import { computed } from 'vue'
import type { TransformationPresetType } from '../../domain/math/Transform'
import { useTransformationStore } from '../../stores/transformationStore'
import KatexMath from './KatexMath.vue'
import MatrixAnalysisCard from './MatrixAnalysisCard.vue'

const transformStore = useTransformationStore()

const addStepButtons: { type: TransformationPresetType; label: string }[] = [
  { type: 'rotation', label: '+ Rotate' },
  { type: 'scaling', label: '+ Scale' },
  { type: 'reflection', label: '+ Reflect' },
  { type: 'shear', label: '+ Shear' },
  { type: 'projection', label: '+ Project' },
  { type: 'custom', label: '+ 2×2 Matrix' },
]

/**
 * Builds the symbolic left-multiplication equation:
 * If enabled steps are T1, T2, ..., Tn, then v' = A_n * ... * A_2 * A_1 * v
 */
const multiplicationOrderLatex = computed(() => {
  const enabled = transformStore.enabledSteps
  if (enabled.length === 0) {
    return "\\mathbf{v}' = I\\,\\mathbf{v}"
  }
  const factorsReversed: string[] = []
  for (let i = enabled.length; i >= 1; i--) {
    factorsReversed.push(`A_{${i}}`)
  }
  return `\\mathbf{v}' = (${factorsReversed.join(' \\cdot ')})\\,\\mathbf{v}`
})

function handleMatrixEntryInput(
  stepId: string,
  index: 0 | 1 | 2 | 3,
  event: Event,
): void {
  const input = event.target as HTMLInputElement
  const val = Number(input.value)
  if (Number.isFinite(val)) {
    transformStore.updateStepMatrixEntry(stepId, index, val)
  }
}
</script>

<template>
  <aside class="panel pipeline-panel">
    <div class="panel-header">
      <h2>Transformation Pipeline</h2>
      <span class="count-pill">
        {{ transformStore.enabledSteps.length }}/{{ transformStore.steps.length }} active
      </span>
    </div>

    <!-- Add Step Toolbar -->
    <div class="add-step-bar">
      <div class="section-label">Add Transformation Step</div>
      <div class="step-btn-grid">
        <button
          v-for="btn in addStepButtons"
          :key="btn.type"
          type="button"
          class="add-step-chip"
          @click="transformStore.addStep(btn.type)"
        >
          {{ btn.label }}
        </button>
      </div>
    </div>

    <div class="panel-scroll">
      <!-- Explicit Order Convention Banner -->
      <div class="convention-banner">
        <div class="convention-row">
          <span class="convention-label">Column-vector order:</span>
          <KatexMath :tex="multiplicationOrderLatex" />
        </div>
        <p class="convention-note">
          Step 1 (<KatexMath tex="A_1" />) acts on the scene first, followed by Step 2
          (<KatexMath tex="A_2" />), so the rightmost matrix multiplies <KatexMath tex="\mathbf{v}" /> first.
        </p>
      </div>

      <!-- Ordered Step List -->
      <div v-if="transformStore.steps.length === 0" class="empty-pipeline">
        No transformations in pipeline. The scene is multiplied by Identity <KatexMath tex="I" />.
      </div>

      <div class="steps-list">
        <div
          v-for="(step, idx) in transformStore.steps"
          :key="step.id"
          class="step-card"
          :class="{ disabled: !step.enabled }"
        >
          <div class="step-top">
            <label class="enable-check" :title="step.enabled ? 'Disable step' : 'Enable step'">
              <input
                :checked="step.enabled"
                type="checkbox"
                @change="transformStore.toggleStepEnabled(step.id)"
              />
              <span class="step-num">Step {{ idx + 1 }}</span>
            </label>

            <input
              v-model="step.name"
              type="text"
              class="step-name-input"
              aria-label="Step name"
            />

            <div class="step-actions">
              <button
                type="button"
                class="icon-btn"
                :disabled="idx === 0"
                title="Move earlier in pipeline"
                @click="transformStore.moveStep(step.id, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="icon-btn"
                :disabled="idx === transformStore.steps.length - 1"
                title="Move later in pipeline"
                @click="transformStore.moveStep(step.id, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                class="icon-btn"
                title="Duplicate step"
                @click="transformStore.duplicateStep(step.id)"
              >
                ⧉
              </button>
              <button
                type="button"
                class="icon-btn danger"
                title="Delete step"
                @click="transformStore.removeStep(step.id)"
              >
                ✕
              </button>
            </div>
          </div>

          <div class="step-body">
            <div class="preset-row">
              <label>Type</label>
              <select
                :value="step.type"
                class="mini-select"
                @change="
                  transformStore.updateStepPresetType(
                    step.id,
                    ($event.target as HTMLSelectElement).value as TransformationPresetType,
                  )
                "
              >
                <option value="rotation">Rotation (CCW)</option>
                <option value="scaling">Scaling</option>
                <option value="reflection">Reflection</option>
                <option value="shear">Shear</option>
                <option value="projection">Projection (Singular)</option>
                <option value="custom">Custom 2×2 Entries</option>
              </select>
            </div>

            <!-- Interactive Parameters for Presets -->
            <div v-if="step.type === 'rotation'" class="param-control">
              <div class="slider-header">
                <span>Angle θ (CCW)</span>
                <span class="mono-val">{{ step.params.angleDeg }}°</span>
              </div>
              <div class="slider-with-num">
                <input
                  v-model.number="step.params.angleDeg"
                  type="range"
                  min="-180"
                  max="180"
                  step="5"
                  @input="transformStore.syncStepMatrixFromParams(step.id)"
                />
                <input
                  v-model.number="step.params.angleDeg"
                  type="number"
                  step="5"
                  class="num-input sm-num"
                  @input="transformStore.syncStepMatrixFromParams(step.id)"
                />
              </div>
            </div>

            <div v-else-if="step.type === 'scaling'" class="param-grid-2">
              <label>
                <span>Scale X (<KatexMath tex="s_x" />)</span>
                <input
                  v-model.number="step.params.sx"
                  type="number"
                  step="0.25"
                  class="num-input"
                  @input="transformStore.syncStepMatrixFromParams(step.id)"
                />
              </label>
              <label>
                <span>Scale Y (<KatexMath tex="s_y" />)</span>
                <input
                  v-model.number="step.params.sy"
                  type="number"
                  step="0.25"
                  class="num-input"
                  @input="transformStore.syncStepMatrixFromParams(step.id)"
                />
              </label>
            </div>

            <div v-else-if="step.type === 'reflection'" class="param-control">
              <label class="field-row">
                <span>Axis / Line</span>
                <select
                  v-model="step.params.reflectionKind"
                  class="mini-select"
                  @change="transformStore.syncStepMatrixFromParams(step.id)"
                >
                  <option value="x-axis">Across x-axis (y = 0)</option>
                  <option value="y-axis">Across y-axis (x = 0)</option>
                  <option value="line-y-eq-x">Across line y = x</option>
                  <option value="line-y-eq-neg-x">Across line y = -x</option>
                  <option value="origin">Through Origin (180°)</option>
                  <option value="custom-angle">Line at angle θ</option>
                </select>
              </label>
              <div v-if="step.params.reflectionKind === 'custom-angle'" class="slider-with-num mt-xs">
                <input
                  v-model.number="step.params.angleDeg"
                  type="range"
                  min="-90"
                  max="90"
                  step="5"
                  @input="transformStore.syncStepMatrixFromParams(step.id)"
                />
                <span class="mono-val">{{ step.params.angleDeg }}°</span>
              </div>
            </div>

            <div v-else-if="step.type === 'shear'" class="param-grid-2">
              <label>
                <span>Horizontal (<KatexMath tex="sh_x" />)</span>
                <input
                  v-model.number="step.params.shx"
                  type="number"
                  step="0.25"
                  class="num-input"
                  @input="transformStore.syncStepMatrixFromParams(step.id)"
                />
              </label>
              <label>
                <span>Vertical (<KatexMath tex="sh_y" />)</span>
                <input
                  v-model.number="step.params.shy"
                  type="number"
                  step="0.25"
                  class="num-input"
                  @input="transformStore.syncStepMatrixFromParams(step.id)"
                />
              </label>
            </div>

            <div v-else-if="step.type === 'projection'" class="param-control">
              <label class="field-row">
                <span>Onto Line</span>
                <select
                  v-model="step.params.projectionKind"
                  class="mini-select"
                  @change="transformStore.syncStepMatrixFromParams(step.id)"
                >
                  <option value="x-axis">x-axis (y = 0)</option>
                  <option value="y-axis">y-axis (x = 0)</option>
                  <option value="line-y-eq-x">Line y = x</option>
                  <option value="custom-angle">Line at angle θ</option>
                </select>
              </label>
              <div v-if="step.params.projectionKind === 'custom-angle'" class="slider-with-num mt-xs">
                <input
                  v-model.number="step.params.angleDeg"
                  type="range"
                  min="-90"
                  max="90"
                  step="5"
                  @input="transformStore.syncStepMatrixFromParams(step.id)"
                />
                <span class="mono-val">{{ step.params.angleDeg }}°</span>
              </div>
            </div>

            <!-- Editable 2x2 Matrix Entries -->
            <div class="matrix-editor-wrap">
              <div class="matrix-bracket left-bracket" />
              <div class="matrix-grid-2x2">
                <input
                  :value="Number(step.matrix[0].toFixed(4))"
                  type="number"
                  step="0.1"
                  class="matrix-cell col-1-cell"
                  title="a (row 1, col 1: x-component of transformed e1)"
                  @input="handleMatrixEntryInput(step.id, 0, $event)"
                />
                <input
                  :value="Number(step.matrix[1].toFixed(4))"
                  type="number"
                  step="0.1"
                  class="matrix-cell col-2-cell"
                  title="b (row 1, col 2: x-component of transformed e2)"
                  @input="handleMatrixEntryInput(step.id, 1, $event)"
                />
                <input
                  :value="Number(step.matrix[2].toFixed(4))"
                  type="number"
                  step="0.1"
                  class="matrix-cell col-1-cell"
                  title="c (row 2, col 1: y-component of transformed e1)"
                  @input="handleMatrixEntryInput(step.id, 2, $event)"
                />
                <input
                  :value="Number(step.matrix[3].toFixed(4))"
                  type="number"
                  step="0.1"
                  class="matrix-cell col-2-cell"
                  title="d (row 2, col 2: y-component of transformed e2)"
                  @input="handleMatrixEntryInput(step.id, 3, $event)"
                />
              </div>
              <div class="matrix-bracket right-bracket" />
            </div>
          </div>
        </div>
      </div>

      <!-- Composite Matrix & Mathematical Properties Card -->
      <MatrixAnalysisCard />
    </div>
  </aside>
</template>

<style scoped>
.pipeline-panel {
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border-left: 1px solid var(--border-subtle);
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

.add-step-bar {
  padding: 0.75rem 0.9rem;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.section-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.step-btn-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.35rem;
}

.add-step-chip {
  padding: 0.35rem 0.4rem;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}

.add-step-chip:hover {
  border-color: var(--accent-cyan);
  color: var(--text-primary);
  background: rgba(56, 189, 248, 0.1);
}

.panel-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.convention-banner {
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.28);
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.convention-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--accent-cyan);
}

.convention-label {
  font-weight: 600;
  color: var(--text-primary);
}

.convention-note {
  margin: 0;
  font-size: 0.69rem;
  line-height: 1.35;
  color: var(--text-secondary);
}

.empty-pipeline {
  padding: 0.65rem;
  border-radius: 6px;
  background: var(--bg-elevated);
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.step-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.step-card.disabled {
  opacity: 0.52;
}

.step-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.enable-check {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
}

.enable-check input {
  accent-color: var(--accent-cyan);
  margin: 0;
}

.step-num {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.12rem 0.38rem;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-cyan);
}

.step-name-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.79rem;
  font-weight: 600;
  padding: 0.14rem 0.3rem;
}

.step-name-input:focus {
  outline: none;
  border-color: var(--border-focus);
  background: var(--bg-canvas);
}

.step-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.76rem;
  padding: 0.18rem 0.32rem;
  border-radius: 4px;
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-primary);
}

.icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.icon-btn.danger:hover {
  background: rgba(244, 63, 94, 0.2);
  color: #fb7185;
}

.step-body {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.74rem;
}

.preset-row,
.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  color: var(--text-secondary);
}

.mini-select {
  background: var(--bg-canvas);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  padding: 0.25rem 0.45rem;
  font-size: 0.74rem;
}

.param-control {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.71rem;
  color: var(--text-secondary);
}

.mono-val {
  font-family: var(--font-mono);
  color: var(--accent-cyan);
}

.slider-with-num {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.slider-with-num input[type='range'] {
  flex: 1;
}

.sm-num {
  width: 64px !important;
}

.param-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}

.param-grid-2 label {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.num-input {
  width: 100%;
  background: var(--bg-canvas);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
  padding: 0.26rem 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.matrix-editor-wrap {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.3rem 0;
}

.matrix-bracket {
  width: 6px;
  border-top: 2px solid var(--text-secondary);
  border-bottom: 2px solid var(--text-secondary);
}

.left-bracket {
  border-left: 2px solid var(--text-secondary);
}

.right-bracket {
  border-right: 2px solid var(--text-secondary);
}

.matrix-grid-2x2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.3rem;
  width: 168px;
}

.matrix-cell {
  width: 100%;
  text-align: center;
  background: var(--bg-canvas);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 0.28rem 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
}

.col-1-cell {
  border-bottom: 2px solid rgba(239, 68, 68, 0.5);
}

.col-2-cell {
  border-bottom: 2px solid rgba(34, 197, 94, 0.5);
}

.mt-xs {
  margin-top: 0.3rem;
}
</style>
