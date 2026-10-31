<script setup lang="ts">
/** Live transcript (or a hint while nothing has been heard yet). */
defineProps<{ text: string; hint?: string; live?: boolean }>()
</script>

<template>
  <p class="transcript" :class="{ 'transcript--hint': !text }" aria-live="polite" data-testid="transcript">
    <template v-if="text">
      <span class="transcript__quote">“{{ text }}<span v-if="live" class="transcript__caret" aria-hidden="true" />”</span>
    </template>
    <template v-else>{{ hint }}</template>
  </p>
</template>

<style scoped lang="scss">
.transcript {
  min-height: 3.4rem;
  margin: 0;
  text-align: center;
  font-size: 1.35rem;
  font-style: italic;
  line-height: 1.3;
  color: var(--hud-text);
  text-wrap: balance;
  overflow-wrap: anywhere; // long item names must wrap, not overflow
  &--hint {
    font-size: 1rem;
    font-style: normal;
    color: var(--hud-text-dim);
  }
}
.transcript__caret {
  display: inline-block;
  width: 0.12rem;
  height: 1.1em;
  margin-left: 0.15rem;
  vertical-align: text-bottom;
  background: var(--hud-primary);
  animation: blink 1s steps(2) infinite;
}
@keyframes blink {
  50% { opacity: 0; }
}
</style>
