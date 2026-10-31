<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { onBeforeUnmount, ref } from 'vue'
import HudButton from './HudButton.vue'

/**
 * Two-step destructive action. The first tap arms it ("Delete? Cancel / Yes"),
 * the second confirms. It disarms itself after a few seconds so a stray tap
 * never leaves a delete waiting.
 */
const props = withDefaults(defineProps<{ label?: string; confirmLabel?: string; prompt?: string; iconOnly?: boolean }>(), {
  label: 'Delete',
  confirmLabel: 'Yes, delete',
  prompt: 'Are you sure?',
})
const emit = defineEmits<{ confirm: [] }>()

const armed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function arm() {
  armed.value = true
  timer = setTimeout(() => (armed.value = false), 6000)
}
function disarm() {
  armed.value = false
  if (timer) clearTimeout(timer)
}
function confirm() {
  disarm()
  emit('confirm')
}
onBeforeUnmount(() => timer && clearTimeout(timer))
</script>

<template>
  <span class="cb">
    <HudButton v-if="!armed" variant="ghost" class="cb__arm" :aria-label="props.label" @click="arm">
      <template #icon><Trash2 /></template>
      <template v-if="!props.iconOnly">{{ props.label }}</template>
    </HudButton>
    <span v-else class="cb__confirm" role="alert">
      <span class="cb__prompt">{{ props.prompt }}</span>
      <HudButton @click="disarm">Cancel</HudButton>
      <HudButton variant="danger" data-testid="confirm-delete" @click="confirm">{{ props.confirmLabel }}</HudButton>
    </span>
  </span>
</template>

<style scoped lang="scss">
.cb {
  display: inline-flex;
}
.cb__arm :deep(.hud-btn__icon),
.cb__arm {
  color: color-mix(in srgb, var(--hud-danger) 70%, white);
}
.cb__confirm {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.cb__prompt {
  font-size: 0.9rem;
  color: var(--hud-text-dim);
}
</style>
