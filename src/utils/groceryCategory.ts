import type { GroceryCategory } from '@/models'

const KEYWORDS: [GroceryCategory, string[]][] = [
  ['produce', ['banana', 'apple', 'orange', 'lettuce', 'spinach', 'tomato', 'potato', 'onion', 'carrot', 'grape', 'berry', 'berries', 'avocado', 'lemon', 'lime', 'pepper', 'cucumber', 'broccoli', 'celery', 'fruit', 'veggie']],
  ['dairy', ['milk', 'egg', 'cheese', 'butter', 'yogurt', 'cream', 'creamer']],
  ['meat', ['chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'steak', 'salmon', 'fish', 'shrimp', 'ham']],
  ['frozen', ['frozen', 'ice cream', 'pizza', 'waffle']],
  ['household', ['paper towel', 'toilet', 'soap', 'detergent', 'trash bag', 'sponge', 'tissue', 'napkin', 'bleach', 'foil']],
  ['pantry', ['bread', 'rice', 'pasta', 'cereal', 'flour', 'sugar', 'oil', 'sauce', 'beans', 'soup', 'chips', 'cracker', 'coffee', 'tea', 'peanut', 'jelly', 'oats']],
]

export function inferGroceryCategory(name: string): GroceryCategory {
  const n = name.toLowerCase()
  for (const [cat, words] of KEYWORDS) {
    if (words.some((w) => n.includes(w))) return cat
  }
  return 'other'
}

/** "bananas" → "Bananas"; keeps long names intact (the UI truncates, not the data). */
export function titleCase(name: string): string {
  const t = name.trim().replace(/\s+/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
