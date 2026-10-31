<script setup lang="ts">
import { Users } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import type { FamilyMember } from '@/models'

const props = withDefaults(
  defineProps<{
    /** `null` renders the generic "Family" avatar. */
    member: FamilyMember | null
    /** CSS size of the avatar circle. */
    size?: string
    showName?: boolean
    sublabel?: string
    selected?: boolean
    /** Render as a button (tap to select). */
    interactive?: boolean
    /** Mute a non-selected avatar while another member is active. */
    dimmed?: boolean
  }>(),
  { size: '2.6rem' },
)
defineEmits<{ select: [] }>()

// Missing/broken photos fall back to initials, never a broken image.
const broken = ref(false)
watch(() => props.member?.photoUrl, () => (broken.value = false))

const initials = computed(() => (props.member?.name ?? 'Family').slice(0, 1).toUpperCase())
const name = computed(() => props.member?.name ?? 'Family')
const style = computed(() => ({
  '--accent': props.member ? `var(--hud-accent-${props.member.accent})` : 'var(--hud-primary)',
  '--size': props.size,
}))
</script>

<template>
  <component
    :is="interactive ? 'button' : 'span'"
    class="avatar"
    :class="{ 'avatar--selected': selected, 'avatar--dim': dimmed, 'avatar--btn': interactive }"
    :style="style"
    :type="interactive ? 'button' : undefined"
    :aria-label="interactive ? `${name}${selected ? ', selected' : ''}` : undefined"
    :aria-pressed="interactive ? !!selected : undefined"
    @click="interactive && $emit('select')"
  >
    <span class="avatar__ring">
      <img v-if="member?.photoUrl && !broken" :src="member.photoUrl" :alt="name" class="avatar__img" @error="broken = true" />
      <Users v-else-if="!member" class="avatar__glyph" aria-hidden="true" />
      <span v-else class="avatar__initial" aria-hidden="true">{{ initials }}</span>
    </span>
    <span v-if="showName" class="avatar__name">{{ name }}</span>
    <span v-if="sublabel" class="avatar__sub">{{ sublabel }}</span>
  </component>
</template>

<style scoped lang="scss">
.avatar {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--hud-text);
  font: inherit;
  transition: opacity 0.2s, transform 0.1s;

  &--btn {
    cursor: pointer;
    min-width: var(--hud-touch-min);
    min-height: var(--hud-touch-min);
    justify-content: center;
    &:active {
      transform: scale(0.93);
    }
  }
  &--dim {
    opacity: 0.55;
  }
}

.avatar__ring {
  display: grid;
  place-items: center;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  border: 0.14rem solid var(--accent);
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 38%, var(--hud-surface)), var(--hud-bg-deep));
  box-shadow: 0 0 0.6rem color-mix(in srgb, var(--accent) 45%, transparent);
  overflow: hidden;
  flex: none;
  .avatar--selected & {
    box-shadow: 0 0 0 0.16rem var(--hud-bg), 0 0 0 0.3rem var(--accent), 0 0 1.1rem var(--accent);
  }
}

.avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar__initial {
  font-weight: 700;
  font-size: calc(var(--size) * 0.42);
  color: var(--hud-text);
}
.avatar__glyph {
  width: 52%;
  height: 52%;
  color: var(--accent);
}
.avatar__name {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.1;
  .avatar--selected & {
    color: var(--accent);
  }
}
.avatar__sub {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.68rem;
  color: var(--hud-text-dim);
}
</style>
