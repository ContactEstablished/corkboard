<script setup lang="ts">
import { BookOpen, Gamepad2, Goal, Mountain, Sparkles, Star, Users } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { Achievement } from '@/models'

defineProps<{ badge: Achievement }>()

const ICONS: Record<Achievement['icon'], Component> = {
  soccer: Goal,
  book: BookOpen,
  mountain: Mountain,
  users: Users,
  gamepad: Gamepad2,
  broom: Sparkles,
  star: Star,
}
</script>

<template>
  <figure class="badge" :title="badge.description">
    <span class="badge__hex"><component :is="ICONS[badge.icon]" aria-hidden="true" /></span>
    <figcaption>
      <b>{{ badge.title }}</b>
      <small>Level {{ badge.level }}</small>
    </figcaption>
  </figure>
</template>

<style scoped lang="scss">
.badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  width: 5.6rem;
  margin: 0;
  text-align: center;
}
.badge__hex {
  display: grid;
  place-items: center;
  width: 3.6rem;
  height: 4rem;
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  background: linear-gradient(160deg, var(--hud-warning), color-mix(in srgb, var(--hud-warning) 40%, var(--hud-blue-deep)));
  svg {
    width: 1.7rem;
    height: 1.7rem;
    color: var(--hud-text);
    filter: drop-shadow(0 0 0.3rem var(--hud-bg-deep));
  }
}
figcaption {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  b {
    font-size: 0.78rem;
  }
  small {
    font-size: 0.68rem;
    color: var(--hud-text-dim);
  }
}
</style>
