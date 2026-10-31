<script setup lang="ts">
import ThisWeekPanel from '@/features/chores/ThisWeekPanel.vue'
import ChoresPreview from '@/features/chores/ChoresPreview.vue'
import GroceryPreview from '@/features/groceries/GroceryPreview.vue'
import MessagesPreview from '@/features/messages/MessagesPreview.vue'
import { useFamilyStore } from '@/stores/family'
import AgendaPanel from './AgendaPanel.vue'
import ClockWeatherPanel from './ClockWeatherPanel.vue'
import FamilyAtHomePanel from './FamilyAtHomePanel.vue'
import MemberDashboard from './MemberDashboard.vue'

const family = useFamilyStore()
</script>

<template>
  <MemberDashboard v-if="family.selected" />
  <div v-else class="home" data-testid="home">
    <ClockWeatherPanel />
    <AgendaPanel />
    <div class="home__side">
      <FamilyAtHomePanel />
      <ThisWeekPanel />
    </div>
    <GroceryPreview />
    <ChoresPreview />
    <MessagesPreview />
  </div>
</template>

<style scoped lang="scss">
.home {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: minmax(0, 1.08fr) minmax(0, 1fr);
  gap: 0.8rem;
  height: 100%;
  min-height: 0;
}
.home__side {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.8rem;
  min-height: 0;
  min-width: 0;
}
</style>
