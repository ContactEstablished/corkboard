<script setup lang="ts">
import type { Component } from 'vue'
import HudIconButton from './HudIconButton.vue'
import { ChevronRight } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    title?: string
    icon?: Component
    /** `primary` draws attention (glow); `quiet` recedes for secondary info. */
    variant?: 'default' | 'primary' | 'quiet'
    /** Shows the Open/Expand chevron that replaces "View All". */
    expandable?: boolean
    expandLabel?: string
    /** Remove body padding (for lists that bleed to the edges). */
    flush?: boolean
  }>(),
  { variant: 'default', expandLabel: 'Open' },
)

const emit = defineEmits<{ expand: [] }>()
</script>

<template>
  <section class="hud-panel" :class="`hud-panel--${variant}`">
    <div class="hud-panel__frame">
      <div class="hud-panel__inner">
        <header v-if="title || $slots.actions || expandable" class="hud-panel__header">
          <component :is="icon" v-if="icon" class="hud-panel__icon" aria-hidden="true" />
          <h2 v-if="title" class="hud-panel__title hud-display">{{ title }}</h2>
          <div class="hud-panel__actions">
            <slot name="actions" />
            <HudIconButton v-if="expandable" :label="`${expandLabel} ${title ?? ''}`.trim()" @click="emit('expand')">
              <ChevronRight />
            </HudIconButton>
          </div>
        </header>
        <div class="hud-panel__body" :class="{ 'hud-panel__body--flush': flush }">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.hud-panel {
  --c: var(--hud-chamfer);
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  &--primary {
    filter: drop-shadow(0 0 0.7rem color-mix(in srgb, var(--hud-glow) 28%, transparent));
  }
}

// Outer layer = the 1px border, drawn as a gradient and clipped to the chamfer.
.hud-panel__frame {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  padding: 1px;
  background: linear-gradient(135deg, var(--hud-border-bright), var(--hud-border) 38%, var(--hud-border) 70%, var(--hud-border-bright));
  clip-path: polygon(var(--c) 0, 100% 0, 100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, 0 100%, 0 var(--c));
  .hud-panel--quiet & {
    background: var(--hud-border);
    opacity: 0.95;
  }
}

.hud-panel__inner {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(var(--hud-grid-line) 1px, transparent 1px) 0 0 / 1.6rem 1.6rem,
    linear-gradient(90deg, var(--hud-grid-line) 1px, transparent 1px) 0 0 / 1.6rem 1.6rem,
    linear-gradient(160deg, color-mix(in srgb, var(--hud-surface) 55%, var(--hud-panel)), var(--hud-panel) 55%);
  box-shadow: inset 0 0 1.4rem color-mix(in srgb, var(--hud-primary) 9%, transparent);
  clip-path: polygon(calc(var(--c) - 0.4px) 0, 100% 0, 100% calc(100% - var(--c) + 0.4px), calc(100% - var(--c) + 0.4px) 100%, 0 100%, 0 calc(var(--c) - 0.4px));
  .hud-panel--quiet & {
    background: color-mix(in srgb, var(--hud-panel) 88%, var(--hud-bg));
    box-shadow: none;
  }

  // HUD corner ticks (top-right and bottom-left, opposite the chamfers)
  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 0.7rem;
    height: 0.7rem;
    border: 0 solid var(--hud-primary);
    opacity: 0.75;
    pointer-events: none;
  }
  &::before {
    top: 0.3rem;
    right: 0.3rem;
    border-width: 2px 2px 0 0;
  }
  &::after {
    bottom: 0.3rem;
    left: 0.3rem;
    border-width: 0 0 2px 2px;
  }
  .hud-panel--quiet &::before,
  .hud-panel--quiet &::after {
    display: none;
  }
}

.hud-panel__header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.9rem 0.45rem 1.2rem;
  min-height: 3.1rem;
}

.hud-panel__icon {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--hud-primary);
  filter: drop-shadow(0 0 0.35rem color-mix(in srgb, var(--hud-glow) 60%, transparent));
  flex: none;
}

.hud-panel__title {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--hud-text);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hud-panel__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.hud-panel__body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 0.3rem 1rem 0.9rem 1.2rem;
  &--flush {
    padding: 0;
  }
}
</style>
