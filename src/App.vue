<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import CanvasViewport from './app/components/CanvasViewport.vue'
import SceneObjectsPanel from './app/components/SceneObjectsPanel.vue'
import TopToolbar from './app/components/TopToolbar.vue'
import TransformationPipelinePanel from './app/components/TransformationPipelinePanel.vue'
import { decodeShareState, extractShareTokenFromLocation } from './engine/ShareState'
import { useTransformationStore } from './stores/transformationStore'

const transformStore = useTransformationStore()
const mobileTab = ref<'scene' | 'pipeline' | 'canvas'>('scene')

function hydrateFromUrl(): void {
  if (typeof window === 'undefined') return
  const token = extractShareTokenFromLocation(window.location.search, window.location.hash)
  if (!token) return
  const snapshot = decodeShareState(token)
  if (snapshot) {
    transformStore.applyShareSnapshot(snapshot)
  }
}

hydrateFromUrl()

onMounted(() => {
  window.addEventListener('hashchange', hydrateFromUrl)
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', hydrateFromUrl)
})
</script>

<template>
  <div class="workbench-shell">
    <TopToolbar />
    <div class="workbench-body" :class="[`mobile-tab-${mobileTab}`]">
      <SceneObjectsPanel class="left-pane" />
      <CanvasViewport class="center-pane" />
      <div class="mobile-switcher-bar" role="tablist" aria-label="Mobile workspace view">
        <button
          type="button"
          role="tab"
          :aria-selected="mobileTab === 'scene'"
          class="mobile-tab-btn"
          :class="{ active: mobileTab === 'scene' }"
          @click="mobileTab = 'scene'"
        >
          🔷 Scene &amp; Fields
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mobileTab === 'pipeline'"
          class="mobile-tab-btn"
          :class="{ active: mobileTab === 'pipeline' }"
          @click="mobileTab = 'pipeline'"
        >
          🧮 Pipeline &amp; SVD
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mobileTab === 'canvas'"
          class="mobile-tab-btn"
          :class="{ active: mobileTab === 'canvas' }"
          @click="mobileTab = 'canvas'"
        >
          ⤢ Full Canvas
        </button>
      </div>
      <TransformationPipelinePanel class="right-pane" />
    </div>
  </div>
</template>

<style scoped>
.workbench-shell {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg-canvas);
}

.workbench-body {
  flex: 1;
  display: grid;
  grid-template-columns: 330px 1fr 370px;
  min-height: 0;
  overflow: hidden;
}

.mobile-switcher-bar {
  display: none;
}

@media (max-width: 1180px) {
  .workbench-body {
    grid-template-columns: 290px 1fr 320px;
  }
}

@media (max-width: 920px) {
  .workbench-body {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .workbench-body .center-pane {
    order: 1;
    flex: 0 0 46%;
    height: auto;
    min-height: 200px;
  }

  .workbench-body.mobile-tab-canvas .center-pane {
    flex: 1 1 0;
  }

  .mobile-switcher-bar {
    order: 2;
    display: flex;
    flex-shrink: 0;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    background: var(--bg-panel);
    border-top: 1px solid var(--border-subtle);
    border-bottom: 1px solid var(--border-subtle);
  }

  .mobile-tab-btn {
    flex: 1 1 0;
    min-width: 0;
    padding: 0.38rem 0.45rem;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: 0.74rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: all 0.12s ease;
  }

  .mobile-tab-btn.active {
    background: rgba(56, 189, 248, 0.16);
    border-color: var(--accent-cyan);
    color: var(--accent-cyan);
  }

  .workbench-body .left-pane,
  .workbench-body .right-pane {
    order: 3;
    flex: 1 1 0;
    height: auto;
    min-height: 0;
    width: 100%;
    border: none;
  }

  .workbench-body.mobile-tab-scene .left-pane {
    display: flex;
  }

  .workbench-body.mobile-tab-scene .right-pane {
    display: none;
  }

  .workbench-body.mobile-tab-pipeline .right-pane {
    display: flex;
  }

  .workbench-body.mobile-tab-pipeline .left-pane {
    display: none;
  }

  .workbench-body.mobile-tab-canvas .left-pane,
  .workbench-body.mobile-tab-canvas .right-pane {
    display: none;
  }
}
</style>
