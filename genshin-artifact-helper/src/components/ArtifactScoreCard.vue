<script setup lang="ts">
import { computed } from 'vue'
import { useArtifactStore } from '@/stores/artifact'
import { getScoreColor } from '@/utils/scoring'
import type { SubstatType } from '@/types/artifact'

const artifactStore = useArtifactStore()

const artifact = computed(() => artifactStore.currentArtifact)
const score = computed(() => artifactStore.artifactScore)
const grade = computed(() => artifactStore.scoreGrade)
const percentage = computed(() => artifactStore.scorePercentage)

const gradeColor = computed(() => getScoreColor(score.value?.totalScore ?? 0))

function getStatColor(type: SubstatType | string): string {
  if (type.includes('CRIT')) return '#f472b6'
  if (type.includes('ATK')) return '#fb923c'
  if (type.includes('HP')) return '#4ade80'
  if (type.includes('DEF')) return '#fbbf24'
  if (type.includes('Energy')) return '#60a5fa'
  if (type.includes('Elemental Mastery')) return '#a78bfa'
  return '#9ca3af'
}

function formatStatValue(type: string, value: number): string {
  if (['HP', 'ATK', 'DEF', 'Elemental Mastery'].includes(type)) {
    return value.toFixed(0)
  }
  return `${value.toFixed(1)}%`
}
</script>

<template>
  <div v-if="artifactStore.hasArtifact && score" class="bg-slate-800 rounded-lg p-6 text-slate-200">
    <!-- Grade + Score header -->
    <div class="flex items-center gap-6 pb-5 border-b border-slate-700">
      <div
        class="text-6xl font-black w-20 h-20 flex items-center justify-center rounded-xl shrink-0"
        :style="{ color: gradeColor, backgroundColor: gradeColor + '22', border: `2px solid ${gradeColor}` }"
      >
        {{ grade }}
      </div>
      <div class="flex flex-col gap-1">
        <div class="text-3xl font-bold" :style="{ color: gradeColor }">{{ percentage }}%</div>
        <div class="text-sm text-slate-400">
          {{ score.isPotential ? `${score.remainingRolls} roll${score.remainingRolls !== 1 ? 's' : ''} remaining` : 'Max level' }}
        </div>
        <div class="text-xs text-slate-500">{{ score.profile.name }}</div>
      </div>
      <div v-if="artifact" class="ml-auto text-right">
        <div class="text-slate-300 font-semibold">{{ artifact.set }}</div>
        <div class="text-sm text-slate-400">{{ artifact.slot }} · {{ '★'.repeat(artifact.rarity) }}</div>
        <div class="text-sm text-slate-400">+{{ artifact.level }}</div>
      </div>
    </div>

    <!-- Substat breakdown -->
    <div class="mt-4 grid gap-2">
      <div
        v-for="sub in score.substatScores"
        :key="sub.type"
        class="flex items-center gap-3 py-2 px-3 bg-slate-900 rounded-md"
        :class="{ 'opacity-40': sub.weight === 0 }"
      >
        <span class="flex items-center gap-1.5 w-32 font-semibold text-sm shrink-0" :style="{ color: getStatColor(sub.type) }">
          <span
            class="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full text-[10px] font-bold leading-none shrink-0"
            :style="sub.weight > 0
              ? { backgroundColor: '#b45309', color: '#fef3c7', border: '1px solid #f59e0b' }
              : { backgroundColor: '#334155', color: '#94a3b8', border: '1px solid #475569' }"
          >{{ sub.rollCount }}</span>
          {{ sub.type }}
        </span>
        <span class="w-16 text-right font-bold text-sm">
          +{{ formatStatValue(sub.type, sub.value) }}
        </span>
        <!-- Score bar -->
        <div class="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-300"
            :style="{ width: `${Math.min(100, sub.score)}%`, backgroundColor: getStatColor(sub.type) }"
          />
        </div>
        <span class="w-10 text-right text-xs text-slate-400">{{ sub.score.toFixed(0) }}%</span>
        <span
          class="w-8 text-right text-xs font-semibold"
          :style="{ color: sub.weight > 0 ? '#94a3b8' : '#475569' }"
        >
          ×{{ sub.weight.toFixed(1) }}
        </span>
      </div>
    </div>
  </div>
</template>
