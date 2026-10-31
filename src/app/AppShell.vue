<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import VoiceModal from '@/components/voice/VoiceModal.vue'
import MemberBanner from '@/features/family/MemberBanner.vue'
import AppHeader from './AppHeader.vue'
import AppNav from './AppNav.vue'

// The Home route (and the modals over it) carries its own member header, so the banner is only for other screens.
const route = useRoute()
const showBanner = computed(() => route.name !== 'home' && !route.meta.modal)
</script>

<template>
  <div class="shell">
    <div class="shell__ambient" aria-hidden="true" />
    <AppHeader />
    <AppNav />
    <main class="shell__main">
      <MemberBanner v-if="showBanner" />
      <RouterView v-slot="{ Component }">
        <Transition name="screen" mode="out-in">
          <component :is="Component" class="shell__screen" />
        </Transition>
      </RouterView>
    </main>
    <VoiceModal />
  </div>
</template>

<style scoped lang="scss">
.shell {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--hud-surface) 60%, var(--hud-bg)), var(--hud-bg) 62%),
    var(--hud-bg);

  > :deep(.hdr) {
    grid-column: 1 / -1;
  }
}

// Restrained moving light: a slow drifting glow. Off for reduced-motion users.
.shell__ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(var(--hud-grid-line) 1px, transparent 1px) 0 0 / 2.4rem 2.4rem,
    linear-gradient(90deg, var(--hud-grid-line) 1px, transparent 1px) 0 0 / 2.4rem 2.4rem;
  &::after {
    content: '';
    position: absolute;
    inset: -20%;
    background: radial-gradient(40% 35% at 30% 40%, color-mix(in srgb, var(--hud-glow) 9%, transparent), transparent 70%);
    animation: drift 28s ease-in-out infinite alternate;
  }
}
@keyframes drift {
  to {
    transform: translate(35%, 12%);
  }
}

.shell__main {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0.8rem 1rem 1rem 0.9rem;
}
.shell__screen {
  flex: 1;
  min-height: 0;
}

.screen-enter-active,
.screen-leave-active {
  transition: opacity 0.16s ease;
}
.screen-enter-from,
.screen-leave-to {
  opacity: 0;
}
</style>
