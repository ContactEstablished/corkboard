<script setup lang="ts">
import { Users } from 'lucide-vue-next'
import HudPanel from '@/components/hud/HudPanel.vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import type { Presence } from '@/models'
import { useFamilyStore } from '@/stores/family'

const family = useFamilyStore()
const LABEL: Record<Presence, string> = { home: 'Home', school: 'At School', work: 'At Work', away: 'Away' }
</script>

<template>
  <HudPanel title="Family at home" :icon="Users" variant="quiet">
    <ul class="people" data-testid="family-at-home">
      <li v-for="m in family.members" :key="m.id">
        <MemberAvatar
          :member="m"
          size="3rem"
          show-name
          interactive
          :selected="family.selectedId === m.id"
          :dimmed="!!family.selectedId && family.selectedId !== m.id"
          @select="family.select(m.id)"
        />
        <span class="people__presence" :class="`people__presence--${m.presence}`">
          <i aria-hidden="true" />{{ LABEL[m.presence] }}
        </span>
      </li>
    </ul>
  </HudPanel>
</template>

<style scoped lang="scss">
.people {
  display: flex;
  justify-content: space-between;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
  }
}
.people__presence {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.68rem;
  color: var(--hud-text-dim);
  white-space: nowrap;
  i {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--hud-text-faint);
  }
  &--home i {
    background: var(--hud-success);
    box-shadow: 0 0 0.35rem var(--hud-success);
  }
}
</style>
