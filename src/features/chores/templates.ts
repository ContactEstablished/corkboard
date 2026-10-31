import type { ChoreIcon } from '@/models'

/** Touch-selectable chore ideas (there is no keyboard). Custom titles arrive with voice dictation in Phase 3. */
export interface ChoreTemplate {
  title: string
  detail: string
  icon: ChoreIcon
  points: number
}

export const CHORE_TEMPLATES: ChoreTemplate[] = [
  { title: 'Take out the trash', detail: 'Outside', icon: 'trash', points: 20 },
  { title: 'Feed the dog', detail: 'Morning & evening', icon: 'pet', points: 15 },
  { title: 'Set the table', detail: 'Dinner time', icon: 'table', points: 10 },
  { title: 'Load the dishwasher', detail: 'After dinner', icon: 'dishes', points: 10 },
  { title: 'Clean bathroom', detail: 'Upstairs', icon: 'bath', points: 25 },
  { title: 'Vacuum upstairs', detail: 'This week', icon: 'vacuum', points: 25 },
  { title: 'Clean your room', detail: 'Upstairs', icon: 'bed', points: 25 },
  { title: 'Water the plants', detail: 'Living room', icon: 'plants', points: 15 },
  { title: 'Fold the laundry', detail: 'Laundry room', icon: 'generic', points: 15 },
  { title: 'Walk the dog', detail: 'Evening', icon: 'pet', points: 15 },
  { title: 'Wipe the counters', detail: 'Kitchen', icon: 'generic', points: 10 },
  { title: 'Homework', detail: 'Before screens', icon: 'generic', points: 20 },
]
