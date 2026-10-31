import { Bath, BedDouble, ListChecks, PawPrint, Sparkles, Sprout, Trash2, Utensils } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { ChoreIcon } from '@/models'

export const CHORE_ICONS: Record<ChoreIcon, Component> = {
  trash: Trash2,
  pet: PawPrint,
  table: Utensils,
  bath: Bath,
  vacuum: Sparkles,
  bed: BedDouble,
  dishes: Utensils,
  plants: Sprout,
  generic: ListChecks,
}
