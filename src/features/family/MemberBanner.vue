<script setup lang="ts">
import { Users } from 'lucide-vue-next'
import HudButton from '@/components/hud/HudButton.vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import { useChoreStore } from '@/stores/chores'
import { useFamilyStore } from '@/stores/family'

const family = useFamilyStore()
const chores = useChoreStore()
</script>

<template>
  <div v-if="family.selected" class="banner" role="status" data-testid="member-banner" :style="{ '--accent': `var(--hud-accent-${family.selected.accent})` }">
    <MemberAvatar :member="family.selected" size="2.6rem" />
    <p class="banner__text">
      Viewing <strong>{{ family.selected.name }}’s</strong> hub
      <span class="banner__stat">Level {{ chores.level.level }} · {{ chores.total }} pts</span>
    </p>
    <HudButton variant="secondary" data-testid="back-to-family" @click="family.clear()">
      <template #icon><Users /></template>
      Family / Everyone
    </HudButton>
  </div>
</template>

<style scoped lang="scss">
.banner {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin-bottom: 0.7rem;
  padding: 0.35rem 0.5rem 0.35rem 0.8rem;
  border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
  border-left-width: 0.3rem;
  border-radius: 0.8rem;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%);
}
.banner__text {
  margin: 0;
  font-size: 1.05rem;
  strong {
    color: var(--accent);
  }
}
.banner__stat {
  margin-left: 0.8rem;
  font-size: 0.85rem;
  color: var(--hud-text-dim);
}
.banner :deep(.hud-btn) {
  margin-left: auto;
}
</style>
