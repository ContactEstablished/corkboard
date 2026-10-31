<script setup lang="ts">
import AppShell from './AppShell.vue'
</script>

<template>
  <v-app class="app-root">
    <AppShell />
  </v-app>
</template>

<style lang="scss">
// Vuetify provides the app/theme wrapper only; the HUD look is entirely ours.
.app-root.v-application {
  background: var(--hud-bg);
  color: var(--hud-text);
  font-family: var(--hud-font-body);
  height: 100%;
  .v-application__wrap {
    min-height: 0;
    height: 100%;
  }
}
</style>
