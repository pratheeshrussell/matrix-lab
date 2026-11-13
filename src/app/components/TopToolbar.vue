<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber, type Mat2 } from '../../domain/math/Matrix2'
import type { VisualizationMode } from '../../domain/math/Transform'
import { EDUCATIONAL_PRESETS } from '../../engine/educationalPresets'
import { useTransformationStore } from '../../stores/transformationStore'
import KatexMath from './KatexMath.vue'

const transformStore = useTransformationStore()

const modes: { id: VisualizationMode; label: string; hint: string }[] = [
  { id: 'original', label: 'Original', hint: 'Show only untransformed scene (Identity)' },
  { id: 'overlay', label: 'Overlay', hint: 'Compare original (dashed) and transformed (solid)' },
  { id: 'transformed', label: 'Transformed', hint: 'Show only final transformed scene' },
  {
    id: 'step-through',
    label: 'Step-Through',
    hint: 'Scrub step-by-step through the transformation pipeline',
  },
]

const snapshots = computed(() => transformStore.evaluatedScene.stepSnapshots)
const activeSnapshot = computed(
  () => snapshots.value[transformStore.evaluatedScene.activeStepIndex] ?? snapshots.value[0],
)

function matrixToLatex(m: Mat2): string {
  return `\\begin{bmatrix} ${formatNumber(m[0], 2)} & ${formatNumber(m[1], 2)} \\\\ ${formatNumber(m[2], 2)} & ${formatNumber(m[3], 2)} \\end{bmatrix}`
}

function handlePresetChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  if (target.value) {
    transformStore.loadEducationalPreset(target.value)
  }
}
</script>

<template>
  <header class="top-toolbar">
    <div class="brand-cluster">
      <div class="brand-logo" aria-hidden="true">
        <span class="bracket">[</span>
        <span class="matrix-dots">M</span>
        <span class="bracket">]</span>
      </div>
      <div>
        <h1 class="brand-title">Matrix-Lab</h1>
        <p class="brand-subtitle">2D Linear Transformations &amp; Vector Fields</p>
      </div>
    </div>

    <!-- Visualization Mode Switcher -->
    <div class="mode-switcher" role="tablist" aria-label="Visualization modes">
      <button
        v-for="mode in modes"
        :key="mode.id"
        type="button"
        role="tab"
        :aria-selected="transformStore.visualizationMode === mode.id"
        :title="mode.hint"
        class="mode-btn"
        :class="{ active: transformStore.visualizationMode === mode.id }"
        @click="transformStore.visualizationMode = mode.id"
      >
        {{ mode.label }}
      </button>
    </div>

    <!-- Reference Overlays & Presets -->
    <div class="toolbar-actions">
      <div class="toggle-group">
        <label class="chip-toggle" title="Display transformed integer coordinate grid lines">
          <input v-model="transformStore.showTransformedGrid" type="checkbox" />
          <span>Warped Grid</span>
        </label>

        <label class="chip-toggle" title="Display standard basis vectors e1=[1,0] and e2=[0,1]">
          <input v-model="transformStore.showBasisVectors" type="checkbox" />
          <span>Basis <KatexMath tex="\mathbf{e}_1, \mathbf{e}_2" /></span>
        </label>

        <label class="chip-toggle" title="Display unit square and transformed area parallelogram">
          <input v-model="transformStore.showUnitSquare" type="checkbox" />
          <span>Unit Area</span>
        </label>

        <label class="chip-toggle" title="Display real eigenvector invariant lines through origin">
          <input v-model="transformStore.showEigenvectors" type="checkbox" />
          <span>Eigenvectors</span>
        </label>
      </div>

      <div class="preset-selector">
        <label for="edu-preset-select" class="sr-only">Educational Experiments</label>
        <select
          id="edu-preset-select"
          :value="transformStore.activeEducationalPresetId"
          class="select-input"
          @change="handlePresetChange"
        >
          <option v-for="preset in EDUCATIONAL_PRESETS" :key="preset.id" :value="preset.id">
            {{ preset.title }}
          </option>
        </select>
      </div>
    </div>

    <!-- Step-Through Scrubber Bar -->
    <div v-if="transformStore.visualizationMode === 'step-through'" class="step-through-bar">
      <div class="step-controls">
        <span class="step-badge">Step-Through Mode</span>
        <button
          type="button"
          class="btn-sm"
          :disabled="transformStore.evaluatedScene.activeStepIndex <= 0"
          @click="transformStore.setActiveStepIndex(transformStore.evaluatedScene.activeStepIndex - 1)"
        >
          ◀ Prev
        </button>

        <div class="step-pills">
          <button
            v-for="snap in snapshots"
            :key="snap.stepIndex"
            type="button"
            class="step-pill"
            :class="{ active: transformStore.evaluatedScene.activeStepIndex === snap.stepIndex }"
            @click="transformStore.setActiveStepIndex(snap.stepIndex)"
          >
            <span class="pill-num">{{ snap.stepIndex === 0 ? '0: Orig' : `Step ${snap.stepIndex}` }}</span>
            <span class="pill-name">{{ snap.stepName }}</span>
          </button>
        </div>

        <button
          type="button"
          class="btn-sm"
          :disabled="transformStore.evaluatedScene.activeStepIndex >= snapshots.length - 1"
          @click="transformStore.setActiveStepIndex(transformStore.evaluatedScene.activeStepIndex + 1)"
        >
          Next ▶
        </button>
      </div>

      <div v-if="activeSnapshot" class="step-math-summary">
        <span>Active Step Matrix:</span>
        <KatexMath :tex="matrixToLatex(activeSnapshot.stepMatrix)" />
        <span class="divider">|</span>
        <span>Cumulative Matrix after Step {{ activeSnapshot.stepIndex }}:</span>
        <KatexMath :tex="matrixToLatex(activeSnapshot.cumulativeMatrix)" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.top-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  padding: 0.6rem 1rem;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 10;
}

.brand-cluster {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(168, 85, 247, 0.2));
  border: 1px solid rgba(56, 189, 248, 0.4);
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-cyan);
}

.brand-logo .bracket {
  color: var(--text-muted);
}

.brand-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.brand-subtitle {
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.mode-switcher {
  display: inline-flex;
  background: var(--bg-elevated);
  padding: 0.2rem;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
}

.mode-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.38rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-btn:hover {
  color: var(--text-primary);
}

.mode-btn.active {
  background: var(--accent-cyan);
  color: #090d16;
  box-shadow: 0 1px 4px rgba(56, 189, 248, 0.35);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.toggle-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.chip-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  font-size: 0.76rem;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.chip-toggle:hover {
  border-color: var(--border-focus);
  color: var(--text-primary);
}

.chip-toggle input {
  accent-color: var(--accent-cyan);
  margin: 0;
}

.select-input {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  font-size: 0.78rem;
  max-width: 280px;
}

.step-through-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-subtle);
}

.step-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.step-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--accent-amber);
  background: rgba(245, 158, 11, 0.14);
  padding: 0.22rem 0.5rem;
  border-radius: 4px;
}

.step-pills {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.step-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
}

.step-pill.active {
  border-color: var(--accent-amber);
  background: rgba(245, 158, 11, 0.18);
  color: var(--text-primary);
}

.pill-num {
  font-weight: 700;
  color: var(--accent-amber);
}

.step-math-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.76rem;
  color: var(--text-secondary);
}

.divider {
  color: var(--border-subtle);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
</style>
