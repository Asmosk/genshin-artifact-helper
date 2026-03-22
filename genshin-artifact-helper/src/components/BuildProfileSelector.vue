<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()

const selectedIndex = computed({
  get: () => settingsStore.currentProfileIndex,
  set: (index: number) => settingsStore.selectProfile(index),
})
</script>

<template>
  <div class="flex items-center gap-2">
    <label class="text-sm text-slate-400 shrink-0">Build Profile</label>
    <select
      v-model="selectedIndex"
      class="bg-slate-700 text-slate-200 text-sm rounded-md px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-blue-500"
    >
      <option
        v-for="(profile, index) in settingsStore.buildProfiles"
        :key="index"
        :value="index"
      >
        {{ profile.name }}{{ profile.character ? ` (${profile.character})` : '' }}
      </option>
    </select>
  </div>
</template>
