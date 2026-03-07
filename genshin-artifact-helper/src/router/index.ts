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
  ],
})

export default router
