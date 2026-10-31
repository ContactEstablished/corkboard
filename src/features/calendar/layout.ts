import type { CalendarEvent, FamilyMember } from '@/models'

export interface Packed {
  index: number
  /** Zero-based lane within its overlap cluster. */
  col: number
  /** Number of lanes in the cluster (for width). */
  cols: number
}

/**
 * Lays out time ranges so overlapping events sit side by side.
 * `ranges` are [startMinutes, endMinutes). Returns one entry per input, in input order.
 */
export function packColumns(ranges: { start: number; end: number }[]): Packed[] {
  const order = ranges.map((_, i) => i).sort((a, b) => ranges[a]!.start - ranges[b]!.start || ranges[b]!.end - ranges[a]!.end)
  const out: Packed[] = ranges.map((_, index) => ({ index, col: 0, cols: 1 }))

  let cluster: number[] = []
  let clusterEnd = -Infinity
  let laneEnds: number[] = []

  const close = () => {
    for (const i of cluster) out[i]!.cols = Math.max(1, laneEnds.length)
    cluster = []
    laneEnds = []
    clusterEnd = -Infinity
  }

  for (const i of order) {
    const r = ranges[i]!
    if (r.start >= clusterEnd) close()
    let lane = laneEnds.findIndex((end) => end <= r.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(r.end)
    } else {
      laneEnds[lane] = r.end
    }
    out[i]!.col = lane
    cluster.push(i)
    clusterEnd = Math.max(clusterEnd, r.end)
  }
  close()
  return out
}

/**
 * Accent for an event: the person's color when it belongs to one member,
 * otherwise the neutral brand color (family-wide). Names/avatars always
 * accompany the color in the UI.
 */
export function eventAccent(e: Pick<CalendarEvent, 'memberIds'>, byId: Map<string, FamilyMember>): string {
  const people = e.memberIds.map((id) => byId.get(id)).filter((m): m is FamilyMember => !!m)
  return people.length === 1 || (people.length > 1 && people.length < 4) ? `var(--hud-accent-${people[0]!.accent})` : 'var(--hud-primary)'
}

export function isWholeFamily(e: Pick<CalendarEvent, 'memberIds'>): boolean {
  return e.memberIds.length === 0 || e.memberIds.length >= 4
}
