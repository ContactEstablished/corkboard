import type { GroceryCategory } from '@/models'

export const GROCERY_CATEGORIES: { value: GroceryCategory; label: string }[] = [
  { value: 'produce', label: 'Produce' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'meat', label: 'Meat & Seafood' },
  { value: 'pantry', label: 'Pantry' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'household', label: 'Household' },
  { value: 'other', label: 'Other' },
]

export const GROCERY_UNITS = ['lb', 'oz', 'gal', 'pack', 'dozen'] as const
