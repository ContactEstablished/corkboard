<script setup lang="ts">
import { Check, ChevronDown, Lightbulb, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import ConfirmButton from '@/components/hud/ConfirmButton.vue'
import FeatureModal from '@/components/hud/FeatureModal.vue'
import HudButton from '@/components/hud/HudButton.vue'
import LocalMic from '@/components/voice/LocalMic.vue'
import type { GroceryCategory, ShoppingItem } from '@/models'
import { useGroceryStore } from '@/stores/groceries'
import { CATEGORY_ICONS } from './categoryIcon'
import { GROCERY_CATEGORIES, GROCERY_UNITS } from './categories'

defineProps<{ open: boolean }>()
defineEmits<{ close: [] }>()

const groceries = useGroceryStore()
const filter = ref<GroceryCategory | 'all'>('all')
const expanded = ref<string | null>(null)

const inFilter = (i: ShoppingItem) => filter.value === 'all' || i.category === filter.value
const toBuy = computed(() => groceries.open.filter(inFilter))
const bought = computed(() => groceries.purchased.filter(inFilter))
const labelFor = (c: GroceryCategory) => GROCERY_CATEGORIES.find((x) => x.value === c)?.label ?? c

const toggle = (id: string) => (expanded.value = expanded.value === id ? null : id)
const qty = (i: ShoppingItem) => (i.quantity ? `${i.quantity}${i.unit ? ` ${i.unit}` : ''}` : '')

function bump(i: ShoppingItem, delta: number) {
  const next = Math.max(0, (i.quantity ?? 0) + delta)
  void groceries.update(i.id, { quantity: next === 0 ? undefined : next, unit: next === 0 ? undefined : i.unit })
}
function setUnit(i: ShoppingItem, unit: string) {
  void groceries.update(i.id, { unit: i.unit === unit ? undefined : unit })
}
async function removeItem(i: ShoppingItem) {
  expanded.value = null
  await groceries.remove(i.id)
}
</script>

<template>
  <FeatureModal :open="open" title="Grocery list" :icon="ShoppingCart" @close="$emit('close')">
    <div class="gm" data-testid="grocery-modal">
      <nav class="gm__cats" aria-label="Categories">
        <button type="button" class="gm__cat" :class="{ 'gm__cat--on': filter === 'all' }" :aria-pressed="filter === 'all'" @click="filter = 'all'">
          <ShoppingCart aria-hidden="true" /><span>All items</span><b>{{ groceries.open.length }}</b>
        </button>
        <button
          v-for="c in GROCERY_CATEGORIES"
          :key="c.value"
          type="button"
          class="gm__cat"
          :class="{ 'gm__cat--on': filter === c.value }"
          :aria-pressed="filter === c.value"
          @click="filter = c.value"
        >
          <component :is="CATEGORY_ICONS[c.value]" aria-hidden="true" /><span>{{ c.label }}</span><b>{{ groceries.counts[c.value] ?? '' }}</b>
        </button>
      </nav>

      <section class="gm__list" aria-label="Items">
        <div v-if="!toBuy.length && !bought.length" class="gm__empty" data-testid="grocery-modal-empty">
          <ShoppingCart aria-hidden="true" />
          <strong>{{ filter === 'all' ? 'Your grocery list is empty' : `Nothing in ${labelFor(filter)}` }}</strong>
          <span>Add items by voice, or tap a suggestion.</span>
          <span class="gm__tip"><Lightbulb aria-hidden="true" /> Try “Add milk, eggs, and bananas”</span>
        </div>

        <ul class="gm__rows" data-testid="grocery-modal-items">
          <li v-for="i in toBuy" :key="i.id" class="gm__item" :class="{ 'gm__item--open': expanded === i.id }">
            <div class="gm__row">
              <button type="button" class="gm__check" :aria-label="`Mark ${i.name} purchased`" @click="groceries.togglePurchased(i.id)" />
              <component :is="CATEGORY_ICONS[i.category]" class="gm__icon" aria-hidden="true" />
              <button type="button" class="gm__name" :aria-expanded="expanded === i.id" :aria-label="`${i.name}, edit details`" @click="toggle(i.id)">
                <span class="gm__title">{{ i.name }}</span>
                <span v-if="qty(i)" class="gm__qty">{{ qty(i) }}</span>
                <ChevronDown class="gm__chev" aria-hidden="true" />
              </button>
            </div>
            <div v-if="expanded === i.id" class="gm__edit">
              <div class="gm__field">
                <span class="gm__label">Quantity</span>
                <div class="gm__stepper">
                  <button type="button" aria-label="Decrease quantity" @click="bump(i, -1)"><Minus /></button>
                  <output>{{ i.quantity ?? '—' }}</output>
                  <button type="button" aria-label="Increase quantity" @click="bump(i, 1)"><Plus /></button>
                </div>
                <div class="gm__chips" role="group" aria-label="Unit">
                  <button
                    v-for="u in GROCERY_UNITS"
                    :key="u"
                    type="button"
                    class="gm__chip"
                    :class="{ 'gm__chip--on': i.unit === u }"
                    :aria-pressed="i.unit === u"
                    @click="setUnit(i, u)"
                  >
                    {{ u }}
                  </button>
                </div>
              </div>
              <div class="gm__field">
                <span class="gm__label">Category</span>
                <div class="gm__chips" role="group" aria-label="Category">
                  <button
                    v-for="c in GROCERY_CATEGORIES"
                    :key="c.value"
                    type="button"
                    class="gm__chip"
                    :class="{ 'gm__chip--on': i.category === c.value }"
                    :aria-pressed="i.category === c.value"
                    @click="groceries.update(i.id, { category: c.value })"
                  >
                    {{ c.label }}
                  </button>
                </div>
              </div>
              <div class="gm__edit-actions">
                <ConfirmButton :label="`Remove ${i.name}`" confirm-label="Yes, remove" prompt="Remove from the list?" @confirm="removeItem(i)" />
              </div>
            </div>
          </li>
        </ul>

        <template v-if="bought.length">
          <header class="gm__sect">
            <h3>Purchased <small>{{ bought.length }}</small></h3>
            <ConfirmButton label="Clear purchased" confirm-label="Yes, clear" prompt="Remove all purchased items?" @confirm="groceries.clearPurchased()" />
          </header>
          <ul class="gm__rows">
            <li v-for="i in bought" :key="i.id" class="gm__item">
              <div class="gm__row">
                <button type="button" class="gm__check gm__check--on" :aria-label="`Mark ${i.name} not purchased`" @click="groceries.togglePurchased(i.id)"><Check /></button>
                <component :is="CATEGORY_ICONS[i.category]" class="gm__icon" aria-hidden="true" />
                <span class="gm__name gm__name--static"><span class="gm__title">{{ i.name }}</span></span>
                <button type="button" class="gm__trash" :aria-label="`Remove ${i.name}`" @click="removeItem(i)"><Trash2 /></button>
              </div>
            </li>
          </ul>
        </template>
      </section>

      <aside class="gm__side">
        <LocalMic label="Add items by voice" :context="{ feature: 'groceries', activeModal: 'groceries', operation: 'add' }" />
        <section v-if="groceries.suggestions.length" class="gm__sugg" aria-label="Suggested items">
          <h3>Frequently bought</h3>
          <HudButton v-for="s in groceries.suggestions.slice(0, 6)" :key="s" class="gm__sugg-btn" @click="groceries.add([s])">
            <template #icon><Plus /></template>
            {{ s }}
          </HudButton>
        </section>
      </aside>
    </div>
  </FeatureModal>
</template>

<style scoped lang="scss">
.gm {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr) 11.5rem;
  grid-template-rows: minmax(0, 1fr);
  gap: 1.1rem;
}

.gm__cats {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  overflow-y: auto;
}
.gm__cat {
  display: grid;
  grid-template-columns: 1.5rem 1fr auto;
  align-items: center;
  gap: 0.6rem;
  min-height: var(--hud-touch-min);
  padding: 0 0.8rem;
  border: 1px solid transparent;
  border-radius: 0.8rem;
  background: none;
  text-align: left;
  color: var(--hud-text-dim);
  font-size: 0.98rem;
  cursor: pointer;
  svg {
    width: 1.3rem;
    height: 1.3rem;
  }
  b {
    font-size: 0.82rem;
    color: var(--hud-primary);
  }
  &--on {
    color: var(--hud-text);
    border-color: var(--hud-primary);
    background: linear-gradient(180deg, color-mix(in srgb, var(--hud-blue) 40%, transparent), color-mix(in srgb, var(--hud-blue-deep) 35%, transparent));
    box-shadow: 0 0 0.9rem color-mix(in srgb, var(--hud-glow) 25%, transparent);
  }
}

.gm__list {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.3rem;
}
.gm__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.gm__item {
  border-bottom: 1px solid color-mix(in srgb, var(--hud-border) 55%, transparent);
  &--open {
    background: color-mix(in srgb, var(--hud-primary) 5%, transparent);
  }
}
.gm__row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 3.6rem;
}
.gm__check {
  position: relative;
  display: grid;
  place-items: center;
  width: 2.1rem;
  height: 2.1rem;
  flex: none;
  padding: 0;
  border: 2px solid var(--hud-border-bright);
  border-radius: 0.5rem;
  background: none;
  color: var(--hud-primary-contrast);
  cursor: pointer;
  // 52px touch target without growing the visual box
  &::after {
    content: '';
    position: absolute;
    inset: -0.7rem;
  }
  &--on {
    background: var(--hud-success);
    border-color: var(--hud-success);
  }
  svg {
    width: 1.3rem;
    height: 1.3rem;
    stroke-width: 3;
  }
}
.gm__icon {
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  color: var(--hud-primary);
}
.gm__name {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex: 1;
  min-width: 0;
  min-height: 3.6rem;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  font-size: 1.15rem;
  cursor: pointer;
  &--static {
    cursor: default;
    color: var(--hud-text-faint);
    .gm__title {
      text-decoration: line-through;
    }
  }
}
.gm__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gm__qty {
  padding: 0.1rem 0.7rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--hud-surface) 80%, transparent);
  font-size: 0.85rem;
  color: var(--hud-text-dim);
}
.gm__chev {
  width: 1.3rem;
  height: 1.3rem;
  color: var(--hud-text-faint);
  transition: transform 0.15s;
  .gm__item--open & {
    transform: rotate(180deg);
  }
}
.gm__trash {
  display: grid;
  place-items: center;
  width: var(--hud-touch-min);
  height: var(--hud-touch-min);
  border: 0;
  background: none;
  color: color-mix(in srgb, var(--hud-danger) 70%, white);
  cursor: pointer;
  svg {
    width: 1.3rem;
    height: 1.3rem;
  }
}

.gm__edit {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.3rem 0.5rem 0.9rem 3rem;
}
.gm__field {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.8rem;
}
.gm__label {
  width: 5.5rem;
  font-size: 0.85rem;
  color: var(--hud-text-dim);
}
.gm__stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  button {
    display: grid;
    place-items: center;
    width: var(--hud-touch-min);
    height: var(--hud-touch-min);
    border: 1px solid var(--hud-border-bright);
    border-radius: 50%;
    background: color-mix(in srgb, var(--hud-surface) 70%, transparent);
    color: var(--hud-primary);
    cursor: pointer;
    svg {
      width: 1.2rem;
      height: 1.2rem;
    }
    &:active {
      background: color-mix(in srgb, var(--hud-primary) 20%, transparent);
    }
  }
  output {
    min-width: 2.4rem;
    text-align: center;
    font-size: 1.3rem;
    font-weight: 600;
  }
}
.gm__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.gm__chip {
  min-height: 2.8rem;
  padding: 0 1rem;
  border: 1px solid var(--hud-border);
  border-radius: 999px;
  background: none;
  color: var(--hud-text-dim);
  font-size: 0.9rem;
  cursor: pointer;
  &--on {
    color: var(--hud-text);
    border-color: var(--hud-primary);
    background: color-mix(in srgb, var(--hud-primary) 18%, transparent);
  }
}
.gm__edit-actions {
  display: flex;
  justify-content: flex-end;
}

.gm__sect {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1.2rem;
  h3 {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--hud-text-dim);
    small {
      margin-left: 0.4rem;
      color: var(--hud-primary);
    }
  }
}

.gm__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 3rem 1rem;
  text-align: center;
  color: var(--hud-text-dim);
  > svg {
    width: 3.5rem;
    height: 3.5rem;
    color: var(--hud-primary);
  }
  strong {
    font-size: 1.25rem;
    color: var(--hud-text);
  }
}
.gm__tip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.6rem;
  font-size: 0.85rem;
  svg {
    width: 1rem;
    height: 1rem;
    color: var(--hud-warning);
  }
}

.gm__side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  min-height: 0;
  overflow-y: auto;
  padding-top: 1rem;
}
.gm__sugg {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: 100%;
  h3 {
    margin: 0 0 0.2rem;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--hud-text-dim);
  }
}
.gm__sugg-btn {
  width: 100%;
  justify-content: flex-start;
  padding: 0 0.8rem;
  font-size: 0.92rem;
}
</style>
