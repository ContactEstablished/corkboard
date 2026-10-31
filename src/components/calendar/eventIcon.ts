import { CalendarDays, Clapperboard, Dumbbell, GraduationCap, Goal, Laptop, Scissors, Stethoscope, Trash2 } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { CalendarEvent } from '@/models'

const BY_CATEGORY: Record<CalendarEvent['category'], Component> = {
  school: GraduationCap,
  work: Laptop,
  activity: Goal,
  appointment: Stethoscope,
  home: Clapperboard,
  fitness: Dumbbell,
  other: CalendarDays,
}

/** Title keywords beat the category (a "Nail Appointment" gets scissors, not a stethoscope). */
export function eventIcon(e: Pick<CalendarEvent, 'title' | 'category'>): Component {
  const t = e.title.toLowerCase()
  if (/nail|hair|salon/.test(t)) return Scissors
  if (/movie|film/.test(t)) return Clapperboard
  if (/trash/.test(t)) return Trash2
  return BY_CATEGORY[e.category]
}
