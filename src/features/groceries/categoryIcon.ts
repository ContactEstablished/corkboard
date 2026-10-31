import { Apple, Beef, Milk, Package, SprayCan, Snowflake, Wheat } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { GroceryCategory } from '@/models'

export const CATEGORY_ICONS: Record<GroceryCategory, Component> = {
  produce: Apple,
  dairy: Milk,
  meat: Beef,
  pantry: Wheat,
  frozen: Snowflake,
  household: SprayCan,
  other: Package,
}
