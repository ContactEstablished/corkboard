import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ID, Message, Reminder } from '@/models'
import { getServices } from '@/services/container'
import { useFamilyStore } from './family'

export interface FeedItem {
  id: ID
  type: 'message' | 'announcement' | 'note' | 'reminder'
  senderId: ID | 'family'
  recipientIds: ID[] | 'everyone'
  text: string
  at: string
  private: boolean
  done?: boolean
  targetId?: ID
}

export const useMessageStore = defineStore('messages', () => {
  const family = useFamilyStore()
  const messages = ref<Message[]>([])
  const reminders = ref<Reminder[]>([])

  async function load() {
    const repo = getServices().messages
    ;[messages.value, reminders.value] = await Promise.all([repo.listMessages(), repo.listReminders()])
  }

  const involves = (m: Message) => {
    const id = family.selectedId
    if (!id) return true
    return m.senderId === id || m.recipientIds === 'everyone' || m.recipientIds.includes(id)
  }

  /** Newest first: messages, notes and reminders in one stream. Completed reminders are included (flagged). */
  const all = computed<FeedItem[]>(() => {
    const id = family.selectedId
    const fromMessages = messages.value.filter(involves).map<FeedItem>((m) => ({
      id: m.id,
      type: m.kind,
      senderId: m.senderId,
      recipientIds: m.recipientIds,
      text: m.body,
      at: m.createdAt,
      private: !!m.private,
    }))
    const fromReminders = reminders.value
      .filter((r) => !id || !r.targetId || r.targetId === id)
      .map<FeedItem>((r) => ({
        id: r.id,
        type: 'reminder',
        senderId: r.createdBy,
        recipientIds: r.targetId ? [r.targetId] : 'everyone',
        text: r.text,
        at: r.dueAt,
        private: false,
        done: r.done,
        targetId: r.targetId,
      }))
    return [...fromMessages, ...fromReminders].sort((a, b) => b.at.localeCompare(a.at))
  })

  /** Dashboard stream: hides finished reminders. */
  const feed = computed(() => all.value.filter((m) => !m.done))

  /**
   * Whether the body of a private message may be shown. On the shared screen
   * (no member selected) it never is; with a member selected, only to its
   * sender or a named recipient.
   */
  function canReveal(item: FeedItem): boolean {
    if (!item.private) return true
    const id = family.selectedId
    if (!id) return false
    return item.senderId === id || (item.recipientIds !== 'everyone' && item.recipientIds.includes(id))
  }

  async function remove(item: FeedItem) {
    const repo = getServices().messages
    if (item.type === 'reminder') await repo.deleteReminder(item.id)
    else await repo.deleteMessage(item.id)
    await load()
  }

  async function setReminderDone(id: ID, done: boolean) {
    await getServices().messages.setReminderDone(id, done)
    await load()
  }

  return { messages, reminders, load, feed, all, canReveal, remove, setReminderDone }
})
