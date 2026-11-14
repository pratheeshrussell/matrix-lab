<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import CanvasViewport from './app/components/CanvasViewport.vue'
import SceneObjectsPanel from './app/components/SceneObjectsPanel.vue'
import TopToolbar from './app/components/TopToolbar.vue'
import TransformationPipelinePanel from './app/components/TransformationPipelinePanel.vue'
import { decodeShareState, extractShareTokenFromLocation } from './engine/ShareState'
import { useTransformationStore } from './stores/transformationStore'

const transformStore = useTransformationStore()

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
    <div class="workbench-body">
      <SceneObjectsPanel class="left-pane" />
      <CanvasViewport class="center-pane" />
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

@media (max-width: 1180px) {
  .workbench-body {
    grid-template-columns: 290px 1fr 320px;
  }
}
</style>
