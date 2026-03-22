<script setup lang="ts">
import { computed } from 'vue'
import { useArtifactStore } from '@/stores/artifact'
import { getScoreColor } from '@/utils/scoring'
import type { SubstatType } from '@/types/artifact'

const artifactStore = useArtifactStore()

const artifact = computed(() => artifactStore.currentArtifact)
const score = computed(() => artifactStore.artifactScore)
const grade = computed(() => artifactStore.scoreGrade)

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
        class="relative w-20 h-20 flex items-center justify-center rounded-xl shrink-0 overflow-hidden"
        :style="{ backgroundColor: gradeColor + '22', border: `2px solid ${gradeColor}` }"
      >
        <!-- '?' pattern background, only for potential artifacts -->
        <div
          v-if="score.isPotential"
          class="absolute select-none pointer-events-none flex flex-col"
          :style="{ color: gradeColor, opacity: 0.18, fontSize: '28px', fontWeight: 900, lineHeight: '36px', letterSpacing: '2px', transform: 'rotate(-30deg)', width: '260%', left: '-80%', top: '-20%' }"
        >
          <span v-for="row in 6" :key="row" class="whitespace-nowrap">? ? ? ? ? ? ?</span>
        </div>
        <!-- Grade letter -->
        <span
          class="relative text-6xl font-black leading-none pb-1"
          :style="{ color: gradeColor }"
        >{{ grade }}</span>
      </div>
      <div class="flex flex-col gap-1">
        <!-- Score row -->
        <div class="flex items-end gap-4 tabular-nums">
          <div v-if="score.isPotential" class="flex flex-col">
            <span class="text-xs text-slate-500 mb-0.5">min</span>
            <span class="text-xl font-semibold text-slate-400">{{ Math.round(score.minScore) }}%</span>
          </div>
          <div class="flex flex-col">
            <span class="text-xs text-slate-500 mb-0.5">{{ score.isPotential ? 'max' : 'Max level' }}</span>
            <div class="flex items-center gap-1.5">
              <span class="text-3xl font-bold" :style="{ color: gradeColor }">{{ Math.round(score.totalScore) }}%</span>
              <span v-if="score.isPotential" class="group relative inline-flex items-center">
                <span class="cursor-help text-[10px] font-bold text-slate-900 bg-slate-500 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center leading-none hover:bg-slate-400 transition-colors">?</span>
                <span class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-300 font-normal opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg z-10">
                  At the maximum level this artifact will have a score between {{ Math.round(score.minScore) }}% and {{ Math.round(score.totalScore) }}%, depending on your luck.
                </span>
              </span>
            </div>
          </div>
        </div>
        <div class="text-sm text-slate-400">
          {{ score.isPotential ? `${score.remainingRolls} roll${score.remainingRolls !== 1 ? 's' : ''} remaining` : '' }}
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
