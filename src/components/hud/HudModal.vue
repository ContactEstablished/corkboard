<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { type Component, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import HudIconButton from './HudIconButton.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    icon?: Component
    /** `md` is a centered dialog, `lg` a large one, `full` is near-full-screen. */
    size?: 'md' | 'lg' | 'full'
    closeOnBackdrop?: boolean
    /** Hide the header close button (e.g. while a commit is in flight). */
    closable?: boolean
    /** `top` stacks above feature modals (the voice modal). */
    layer?: 'base' | 'top'
  }>(),
  { size: 'md', closeOnBackdrop: true, closable: true, layer: 'base' },
)
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLElement>()
let returnFocus: HTMLElement | null = null

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      returnFocus = document.activeElement as HTMLElement | null
      await nextTick()
      dialog.value?.focus()
    } else {
      returnFocus?.focus?.()
      returnFocus = null
    }
  },
)
onBeforeUnmount(() => returnFocus?.focus?.())

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closable) {
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key !== 'Tab' || !dialog.value) return
  // Keep keyboard/switch-access focus inside the dialog.
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'))
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return
  if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus())
  else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus())
}
</script>

<template>
  <Teleport to="body">
    <Transition name="hud-modal">
      <div v-if="open" class="modal-root" :class="[`modal-root--${size}`, `modal-root--${layer}`]" @keydown="onKey">
        <div class="modal-backdrop" @click="closeOnBackdrop && closable && emit('close')" />
        <div ref="dialog" class="modal" :class="`modal--${size}`" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
          <div class="modal__frame">
            <div class="modal__inner">
              <header v-if="title || $slots.header" class="modal__header">
                <slot name="header">
                  <component :is="icon" v-if="icon" class="modal__icon" aria-hidden="true" />
                  <h2 class="modal__title">{{ title }}</h2>
                </slot>
                <HudIconButton v-if="closable" class="modal__close" label="Close" @click="emit('close')"><X /></HudIconButton>
              </header>
              <div class="modal__body"><slot /></div>
              <footer v-if="$slots.footer" class="modal__footer"><slot name="footer" /></footer>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.modal-root {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  &--top {
    z-index: 200;
  }
  // Near-full-screen modals leave the header (global mic, avatars) uncovered.
  &--full {
    top: var(--hud-header-h);
    padding: 0.7rem 0.8rem 0.8rem;
    place-items: stretch;
  }
}
.modal-backdrop {
  position: absolute;
  inset: 0;
  background: var(--hud-scrim);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}
.modal {
  --c: 1.1rem;
  position: relative;
  max-height: 94vh;
  display: flex;
  outline: none;
  filter: drop-shadow(0 0 1.6rem color-mix(in srgb, var(--hud-glow) 30%, transparent));
  &--md { width: min(36rem, 94vw); }
  &--lg { width: min(52rem, 94vw); }
  &--full { width: 100%; height: 100%; max-height: none; }
}
.modal__frame {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 1.5px;
  background: linear-gradient(135deg, var(--hud-primary), var(--hud-border) 45%, var(--hud-border-bright));
  clip-path: polygon(var(--c) 0, 100% 0, 100% calc(100% - var(--c)), calc(100% - var(--c)) 100%, 0 100%, 0 var(--c));
}
.modal__inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background:
    linear-gradient(var(--hud-grid-line) 1px, transparent 1px) 0 0 / 1.6rem 1.6rem,
    linear-gradient(90deg, var(--hud-grid-line) 1px, transparent 1px) 0 0 / 1.6rem 1.6rem,
    linear-gradient(170deg, var(--hud-surface), var(--hud-panel) 60%);
  clip-path: polygon(calc(var(--c) - 0.6px) 0, 100% 0, 100% calc(100% - var(--c) + 0.6px), calc(100% - var(--c) + 0.6px) 100%, 0 100%, 0 calc(var(--c) - 0.6px));
}
.modal__header {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.9rem 0.9rem 0.4rem 1.6rem;
}
.modal__icon {
  width: 1.8rem;
  height: 1.8rem;
  color: var(--hud-primary);
}
.modal__title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
}
.modal__close {
  margin-left: auto;
}
.modal__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.4rem 1.6rem 1.2rem;
}
// Full-size modals host their own scrolling regions.
.modal--full .modal__body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 1rem;
}
.modal__footer {
  padding: 0 1.6rem 1.4rem;
}

.hud-modal-enter-active,
.hud-modal-leave-active {
  transition: opacity 0.2s ease;
  .modal {
    transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.1);
  }
}
.hud-modal-enter-from,
.hud-modal-leave-to {
  opacity: 0;
  .modal {
    transform: scale(0.94) translateY(0.8rem);
  }
}
</style>
