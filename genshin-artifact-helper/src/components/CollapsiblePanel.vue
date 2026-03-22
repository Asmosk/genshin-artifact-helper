<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  title: string
  storageKey?: string
}>()

const detailsRef = ref<HTMLDetailsElement | null>(null)

onMounted(() => {
  if (!props.storageKey || !detailsRef.value) return
  const stored = localStorage.getItem(props.storageKey)
  if (stored === 'open') detailsRef.value.open = true
})

function onToggle() {
  if (!props.storageKey || !detailsRef.value) return
  localStorage.setItem(props.storageKey, detailsRef.value.open ? 'open' : 'closed')
}
</script>

<template>
  <details ref="detailsRef" class="group" @toggle="onToggle">
    <summary
      class="flex items-center justify-between px-4 py-2.5 bg-dark-800 rounded-lg cursor-pointer select-none list-none group-open:rounded-b-none"
    >
      <span class="text-sm font-semibold text-slate-200">{{ title }}</span>
      <svg
        class="w-4 h-4 text-gray-mid transition-transform group-open:rotate-180"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </summary>
    <div class="bg-dark-800 rounded-b-lg px-4 pb-4 pt-3">
      <slot />
    </div>
  </details>
</template>
