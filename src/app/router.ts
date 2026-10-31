import { createRouter, createWebHashHistory } from 'vue-router'
import type { AppFeature } from '@/models'

declare module 'vue-router' {
  interface RouteMeta {
    feature: AppFeature
    title: string
    /** Feature modal to open over the Home screen (see `HomeHost`). */
    modal?: 'groceries' | 'chores' | 'messages' | 'photos'
  }
}

const HomeHost = () => import('@/features/family/HomeHost.vue')

/**
 * Hash history on purpose: the kiosk may serve the build from a static file
 * server or Android WebView where deep-link rewrites aren't available.
 *
 * Grocery, Tasks, Messages and Photos are real routes that open as
 * near-full-screen modals over the Home screen; Calendar is a full screen.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeHost, meta: { feature: 'home', title: 'Home' } },
    { path: '/groceries', name: 'groceries', component: HomeHost, meta: { feature: 'groceries', title: 'Grocery', modal: 'groceries' } },
    { path: '/tasks', name: 'tasks', component: HomeHost, meta: { feature: 'chores', title: 'Tasks', modal: 'chores' } },
    { path: '/messages', name: 'messages', component: HomeHost, meta: { feature: 'messages', title: 'Messages', modal: 'messages' } },
    { path: '/photos', name: 'photos', component: HomeHost, meta: { feature: 'photos', title: 'Photos', modal: 'photos' } },
    { path: '/calendar', name: 'calendar', component: () => import('@/features/calendar/CalendarScreen.vue'), meta: { feature: 'calendar', title: 'Calendar' } },
    { path: '/settings', name: 'settings', component: () => import('@/features/family/FeaturePlaceholder.vue'), meta: { feature: 'settings', title: 'Settings' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
