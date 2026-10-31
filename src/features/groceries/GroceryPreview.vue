<script setup lang="ts">
import { Check, Lightbulb, ShoppingCart } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import HudPanel from '@/components/hud/HudPanel.vue'
import LocalMic from '@/components/voice/LocalMic.vue'
import { useGroceryStore } from '@/stores/groceries'
import { CATEGORY_ICONS } from './categoryIcon'

const groceries = useGroceryStore()
const router = useRouter()
</script>

<template>
  <HudPanel title="Grocery list" :icon="ShoppingCart" expandable expand-label="Open grocery list" @expand="router.push('/groceries')">
    <div class="gp">
      <ul v-if="groceries.items.length" class="gp__list" data-testid="grocery-list">
        <li v-for="i in [...groceries.open, ...groceries.purchased]" :key="i.id">
          <button
            type="button"
            class="gp__row"
            :class="{ 'gp__row--done': i.purchased }"
            :aria-pressed="i.purchased"
            :aria-label="`${i.name}${i.purchased ? ', purchased' : ''}`"
            @click="groceries.togglePurchased(i.id)"
          >
            <span class="gp__box"><Check v-if="i.purchased" aria-hidden="true" /></span>
            <component :is="CATEGORY_ICONS[i.category]" class="gp__cat" aria-hidden="true" />
            <span class="gp__name">{{ i.name }}</span>
            <span v-if="i.quantity" class="gp__qty">{{ i.quantity }}{{ i.unit ? ` ${i.unit}` : '' }}</span>
          </button>
        </li>
      </ul>
      <div v-else class="gp__empty" data-testid="grocery-empty">
        <ShoppingCart aria-hidden="true" />
        <strong>Your grocery list is empty</strong>
        <span class="gp__tip"><Lightbulb aria-hidden="true" /> Try “Add milk, eggs, and bananas”</span>
      </div>

      <LocalMic label="Add items by voice" :context="{ feature: 'groceries', activeModal: 'groceries-preview', operation: 'add' }" data-testid="grocery-mic" />
    </div>
  </HudPanel>
</template>

<style scoped lang="scss">
.gp {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
}
.gp__list {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  @include fade-bottom;
}
.gp__row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 2.9rem;
  padding: 0 0.3rem;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--hud-border) 55%, transparent);
  background: none;
  text-align: left;
  font-size: 1.02rem;
  cursor: pointer;
  &:active {
    background: color-mix(in srgb, var(--hud-primary) 10%, transparent);
  }
  &--done {
    color: var(--hud-text-faint);
    .gp__name {
      text-decoration: line-through;
    }
  }
}
.gp__box {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  border: 2px solid var(--hud-border-bright);
  border-radius: 0.35rem;
  .gp__row--done & {
    background: var(--hud-success);
    border-color: var(--hud-success);
    color: var(--hud-primary-contrast);
  }
  svg {
    width: 1rem;
    height: 1rem;
    stroke-width: 3;
  }
}
.gp__cat {
  width: 1.3rem;
  height: 1.3rem;
  flex: none;
  color: var(--hud-primary);
  .gp__row--done & {
    opacity: 0.4;
  }
}
.gp__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gp__qty {
  font-size: 0.78rem;
  color: var(--hud-text-dim);
  white-space: nowrap;
}
.gp__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  text-align: center;
  color: var(--hud-text-dim);
  > svg {
    width: 2.6rem;
    height: 2.6rem;
    color: var(--hud-primary);
  }
  strong {
    color: var(--hud-text);
  }
}
.gp__tip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  svg {
    width: 0.95rem;
    height: 0.95rem;
    color: var(--hud-warning);
  }
}
</style>
