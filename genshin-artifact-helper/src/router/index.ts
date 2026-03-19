import { createRouter, createWebHistory } from 'vue-router'
import CaptureView from '@/views/CaptureView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'capture',
      component: CaptureView,
    },
    {
      path: '/dev/fixtures',
      name: 'fixture-editor',
      component: () => import('@/views/FixtureEditorView.vue'),
    },
  ],
})

export default router
