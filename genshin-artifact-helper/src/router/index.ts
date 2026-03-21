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
    {
      path: '/dev/screen-detection',
      name: 'screen-detection-debug',
      component: () => import('@/views/ScreenDetectionDebugView.vue'),
    },
    {
      path: '/dev/star-detection',
      name: 'star-detection-debug',
      component: () => import('@/views/StarDetectionDebugView.vue'),
    },
    {
      path: '/dev/ocr-regions',
      name: 'ocr-regions-debug',
      component: () => import('@/views/OcrRegionsDebugView.vue'),
    },
  ],
})

export default router
