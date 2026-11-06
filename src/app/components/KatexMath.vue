<script setup lang="ts">
import katex from 'katex'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    tex: string
    displayMode?: boolean
  }>(),
  {
    displayMode: false,
  },
)

const renderedHtml = computed(() => {
  try {
    return katex.renderToString(props.tex, {
      displayMode: props.displayMode,
      throwOnError: false,
      strict: false,
    })
  } catch {
    return props.tex
  }
})
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span class="katex-wrapper" v-html="renderedHtml" />
</template>

<style scoped>
.katex-wrapper :deep(.katex) {
  font-size: 1em;
}
</style>
