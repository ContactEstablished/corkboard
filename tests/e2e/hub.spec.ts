import { type Page, expect, test } from '@playwright/test'

// `persist=0` keeps each test on fresh seed data instead of localStorage state.
test.beforeEach(async ({ page }) => {
  await page.goto('/?persist=0')
  await expect(page.getByTestId('home')).toBeVisible()
})

const SECTIONS = [
  { id: 'calendar', marker: 'calendar-screen' },
  { id: 'tasks', marker: 'chores-modal' },
  { id: 'groceries', marker: 'grocery-modal' },
  { id: 'messages', marker: 'messages-modal' },
  { id: 'photos', marker: 'photos-modal' },
] as const

/** Feature modals cover the nav rail; they are closed with their own X. */
async function closeModalIfOpen(page: Page) {
  const close = page.getByRole('dialog').getByRole('button', { name: 'Close' })
  if (await close.count()) await close.first().tap()
}

test('every primary section is reachable by touch and the header stays put', async ({ page }) => {
  for (const s of SECTIONS) {
    await page.getByTestId(`nav-${s.id}`).tap()
    await expect(page.getByTestId(s.marker)).toBeVisible()
    await expect(page.getByTestId('global-mic')).toBeVisible()
    await closeModalIfOpen(page)
  }
  await page.getByTestId('nav-home').tap()
  await expect(page.getByTestId('home')).toBeVisible()
})

test('no production screen offers a text-entry control', async ({ page }) => {
  const count = () => page.locator('input:not([type=hidden]), textarea, [contenteditable=true]').count()
  expect(await count()).toBe(0)
  for (const s of SECTIONS) {
    await page.getByTestId(`nav-${s.id}`).tap()
    await expect(page.getByTestId(s.marker)).toBeVisible()
    expect(await count()).toBe(0)
    await closeModalIfOpen(page)
  }
  await page.getByTestId('global-mic').tap()
  await expect(page.getByTestId('voice-modal')).toBeVisible()
  expect(await count()).toBe(0)
})

test('the home dashboard fits the viewport with no horizontal scroll', async ({ page }) => {
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }))
  expect(overflow).toEqual({ x: 0, y: 0 })
})

test('selecting a family member filters every screen until cleared', async ({ page }) => {
  await expect(page.getByTestId('member-dashboard')).toBeHidden()
  await page.getByRole('button', { name: 'Liam', exact: true }).first().tap()
  await expect(page.getByTestId('member-dashboard')).toContainText('Liam')

  // Home becomes Liam's dashboard: only his chores
  await expect(page.getByTestId('chore-c-dog')).toHaveCount(0) // Ethan's chore
  await expect(page.getByTestId('chore-c-trash')).toBeVisible()

  // …persists across navigation (other screens get the identity banner)
  await page.getByTestId('nav-calendar').tap()
  await expect(page.getByTestId('member-banner')).toContainText('Liam')
  await page.getByTestId('nav-home').tap()
  await expect(page.getByTestId('member-dashboard')).toBeVisible()

  // …until Family / Everyone restores the household view
  await page.getByTestId('back-to-family').tap()
  await expect(page.getByTestId('home')).toBeVisible()
  await expect(page.getByTestId('chore-c-dog')).toBeVisible()
})

test('completing a chore adds its points once', async ({ page }) => {
  const points = page.getByTestId('weekly-points')
  const before = Number(await points.textContent())
  const row = page.getByTestId('chore-c-trash')
  await row.tap()
  await expect(points).toHaveText(String(before + 20))
  await row.tap({ force: true }) // completed rows are aria-disabled; a second tap must not score again
  await page.waitForTimeout(200)
  await expect(points).toHaveText(String(before + 20))
})

test('grocery items can be ticked off by touch', async ({ page }) => {
  const milk = page.getByRole('button', { name: 'Milk' })
  await milk.tap()
  await expect(page.getByRole('button', { name: 'Milk, purchased' })).toBeVisible()
})

test.describe('voice interaction', () => {
  test('local grocery mic opens the contextual modal, previews, and only commits on confirm', async ({ page }) => {
    const rows = page.getByTestId('grocery-list').locator('li')
    const before = await rows.count()

    await page.getByRole('button', { name: 'Add items by voice' }).tap()
    await expect(page.getByRole('dialog', { name: 'Add to Groceries' })).toBeVisible()
    await expect(page.getByTestId('voice-context')).toHaveText('From: Groceries')

    await expect(page.getByTestId('action-preview')).toContainText('Ready to add', { timeout: 10_000 })
    await expect(page.getByTestId('action-preview')).toContainText('Yogurt')
    expect(await rows.count()).toBe(before) // nothing committed yet

    await page.getByTestId('voice-confirm').tap()
    await expect(page.getByTestId('voice-result')).toContainText('Added 3 items')
    await expect(page.getByTestId('voice-modal')).toBeHidden({ timeout: 6000 })
    expect(await rows.count()).toBe(before + 3)
  })

  test('global and local microphones open the same modal', async ({ page }) => {
    await page.getByTestId('global-mic').tap()
    await expect(page.getByTestId('voice-modal')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await page.getByRole('button', { name: 'Cancel' }).tap()
    await expect(page.getByTestId('voice-modal')).toBeHidden()

    await page.getByRole('button', { name: 'Chores by voice' }).tap()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(page.getByTestId('voice-context')).toHaveText('From: Chores')
  })

  test('the selected member becomes the default person for a calendar request', async ({ page }) => {
    await page.getByRole('button', { name: 'Liam', exact: true }).first().tap()
    await page.getByTestId('nav-calendar').tap()
    await page.getByTestId('calendar-mic').tap()
    await expect(page.getByTestId('voice-context')).toHaveText('From: Calendar')
    await expect(page.getByTestId('action-preview')).toContainText('Liam', { timeout: 10_000 })
    await expect(page.getByTestId('action-preview')).toContainText('Dentist Appointment')
  })

  test('failure states are explained and recoverable', async ({ page }) => {
    await page.getByTestId('global-mic').tap()
    await page.getByRole('button', { name: 'Mic blocked' }).tap()
    await expect(page.getByTestId('voice-error')).toContainText('microphone access', { timeout: 10_000 })

    await page.getByTestId('voice-retry').tap()
    await expect(page.getByTestId('voice-modal')).toBeVisible()
  })

  test('closing the modal discards the interaction without changes', async ({ page }) => {
    const rows = page.getByTestId('grocery-list').locator('li')
    const before = await rows.count()
    await page.getByRole('button', { name: 'Add items by voice' }).tap()
    await expect(page.getByTestId('action-preview')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Close' }).tap()
    await expect(page.getByTestId('voice-modal')).toBeHidden()
    expect(await rows.count()).toBe(before)
  })
})
