<script setup lang="ts">
import { CalendarDays, House, Image, ListChecks, MessageSquare, ShoppingCart } from 'lucide-vue-next'
import type { Component } from 'vue'

const items: { to: string; label: string; icon: Component; id: string }[] = [
  { to: '/', label: 'Home', icon: House, id: 'home' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, id: 'calendar' },
  { to: '/tasks', label: 'Tasks', icon: ListChecks, id: 'tasks' },
  { to: '/groceries', label: 'Grocery', icon: ShoppingCart, id: 'groceries' },
  { to: '/messages', label: 'Messages', icon: MessageSquare, id: 'messages' },
  { to: '/photos', label: 'Photos', icon: Image, id: 'photos' },
]
</script>

<template>
  <nav class="nav" aria-label="Primary">
    <RouterLink v-for="item in items" :key="item.to" v-slot="{ href, navigate, isExactActive, isActive }" :to="item.to" custom>
      <a
        :href="href"
        class="nav__item"
        :class="{ 'nav__item--on': item.to === '/' ? isExactActive : isActive }"
        :aria-current="(item.to === '/' ? isExactActive : isActive) ? 'page' : undefined"
        :data-testid="`nav-${item.id}`"
        @click="navigate"
      >
        <component :is="item.icon" class="nav__icon" aria-hidden="true" />
        <span class="nav__label">{{ item.label }}</span>
      </a>
    </RouterLink>
  </nav>
</template>

<style scoped lang="scss">
.nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 6.4rem;
  padding: 0.8rem 0.6rem;
  border-right: 1px solid var(--hud-border);
  background: linear-gradient(90deg, color-mix(in srgb, var(--hud-bg-deep) 70%, transparent), transparent);
}
.nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-height: 4.4rem;
  border: 1px solid transparent;
  border-radius: 0.9rem;
  color: var(--hud-text-dim);
  text-decoration: none;
  transition: background 0.15s, color 0.15s, border-color 0.15s;

  &:active {
    background: color-mix(in srgb, var(--hud-primary) 14%, transparent);
  }
  &--on {
    color: var(--hud-text);
    border-color: var(--hud-primary);
    background: linear-gradient(180deg, color-mix(in srgb, var(--hud-blue) 40%, transparent), color-mix(in srgb, var(--hud-blue-deep) 35%, transparent));
    box-shadow: 0 0 1rem color-mix(in srgb, var(--hud-glow) 30%, transparent), inset 0 0 0.8rem color-mix(in srgb, var(--hud-primary) 15%, transparent);
    .nav__icon {
      color: var(--hud-primary);
    }
  }
}
.nav__icon {
  width: 1.65rem;
  height: 1.65rem;
}
.nav__label {
  font-size: 0.78rem;
  font-weight: 600;
}
</style>
