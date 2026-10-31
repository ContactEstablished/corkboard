<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChoresModal from '@/features/chores/ChoresModal.vue'
import GroceryModal from '@/features/groceries/GroceryModal.vue'
import MessagesModal from '@/features/messages/MessagesModal.vue'
import PhotosModal from '@/features/photos/PhotosModal.vue'
import HomeScreen from './HomeScreen.vue'

/**
 * The Home screen stays mounted behind the near-full-screen feature modals
 * (Grocery, Chores, Messages, Photos). Those are real routes, so the back
 * button and deep links work, but closing one just returns to `/`.
 */
const route = useRoute()
const router = useRouter()
const modal = computed(() => route.meta.modal)
const close = () => router.push('/')
</script>

<template>
  <div class="host">
  <HomeScreen />
  <GroceryModal :open="modal === 'groceries'" @close="close" />
  <ChoresModal :open="modal === 'chores'" @close="close" />
  <MessagesModal :open="modal === 'messages'" @close="close" />
  <PhotosModal :open="modal === 'photos'" @close="close" />
  </div>
</template>

<style scoped>
.host {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.host > :first-child {
  flex: 1;
  min-height: 0;
}
</style>
