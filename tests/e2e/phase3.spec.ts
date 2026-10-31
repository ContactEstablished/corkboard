import { type Page, expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?persist=0')
  await expect(page.getByTestId('home')).toBeVisible()
})

/** Open the global mic and pick a scripted phrase from the dev strip. */
async function say(page: Page, chip: string) {
  await page.getByTestId('global-mic').tap()
  await expect(page.getByTestId('voice-modal')).toBeVisible()
  await page.getByRole('button', { name: chip, exact: true }).tap()
}

test.describe('clarification', () => {
  test('an ambiguous request becomes tappable questions, then a reviewable event', async ({ page }) => {
    await say(page, 'Needs a time')
    await expect(page.getByTestId('clarify')).toContainText('Which did you mean?', { timeout: 10_000 })
    await expect(page.getByTestId('clarify-option')).toHaveCount(4)

    await page.getByTestId('clarify-option').filter({ hasText: 'Add a calendar event' }).tap()
    await expect(page.getByTestId('clarify')).toContainText('What time')
    await page.getByTestId('clarify-option').filter({ hasText: '4:00 PM' }).tap()

    await expect(page.getByTestId('action-preview')).toContainText('Practice', { timeout: 10_000 })
    await expect(page.getByTestId('action-preview')).toContainText('4:00 PM')
    await page.getByTestId('voice-confirm').tap()
    await expect(page.getByTestId('voice-result')).toContainText('Added')
  })

  test('starting over from a question returns to listening', async ({ page }) => {
    await say(page, 'Needs a time')
    await expect(page.getByTestId('clarify')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Start over' }).tap()
    await expect(page.getByTestId('clarify')).toHaveCount(0)
  })
})

test.describe('"show me…" navigation by voice', () => {
  test('"Show me next week" opens the calendar on the Week view with no review step', async ({ page }) => {
    await say(page, 'Show next week')
    await expect(page.getByTestId('voice-modal')).toBeHidden({ timeout: 10_000 })
    await expect(page).toHaveURL(/#\/calendar/)
    await expect(page.getByTestId('week-view')).toBeVisible()
    await expect(page.getByTestId('cal-title')).toContainText('NOV')
  })

  test('"Show me Lumen’s activities this weekend" filters to Lumen on the calendar', async ({ page }) => {
    await say(page, 'Show Lumen')
    await expect(page.getByTestId('voice-modal')).toBeHidden({ timeout: 10_000 })
    await expect(page.getByTestId('member-banner')).toContainText('Lumen')
    await expect(page.getByTestId('week-view')).toBeVisible()
    await expect(page.getByTestId('week-view')).toContainText('Dance Class')
    await expect(page.getByTestId('week-view')).not.toContainText('Soccer Game') // Liam's
  })

  test('"Open Liam’s soccer photos" opens that album', async ({ page }) => {
    await say(page, 'Open photos')
    await expect(page.getByRole('dialog', { name: 'Liam’s photos' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /^Sports/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('dictation', () => {
  test('say an event title: reviewed first, then dropped into the editor', async ({ page }) => {
    await page.getByTestId('nav-calendar').tap()
    await page.getByTestId('calendar-add').tap()
    await expect(page.getByTestId('event-save')).toBeDisabled()

    await page.getByTestId('say-title').tap()
    await expect(page.getByRole('dialog', { name: 'Name this event' })).toBeVisible()
    await expect(page.getByTestId('action-preview')).toContainText('Soccer tournament', { timeout: 10_000 })
    await expect(page.getByTestId('event-editor')).not.toContainText('Current: Soccer tournament') // not applied yet

    await page.getByTestId('voice-confirm').tap()
    await expect(page.getByTestId('voice-modal')).toBeHidden({ timeout: 6000 })
    await expect(page.getByTestId('event-editor')).toContainText('Current: Soccer tournament')
    await page.getByTestId('event-save').tap()
    await expect(page.getByRole('button', { name: 'Soccer tournament, open details' })).toBeVisible()
  })

  test('cancelling a dictation leaves the form untouched', async ({ page }) => {
    await page.getByTestId('nav-calendar').tap()
    await page.getByTestId('calendar-add').tap()
    await page.getByTestId('say-title').tap()
    await expect(page.getByTestId('action-preview')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('voice-modal').getByRole('button', { name: 'Cancel' }).tap()
    await expect(page.getByTestId('event-save')).toBeDisabled()
  })

  test('say a photo caption', async ({ page }) => {
    await page.getByTestId('nav-photos').tap()
    await page.getByTestId('photo-grid').locator('button').first().tap()
    await page.getByTestId('say-caption').tap()
    await expect(page.getByRole('dialog', { name: 'Add a caption' })).toBeVisible()
    await expect(page.getByTestId('action-preview')).toContainText('Liam scores the winning goal', { timeout: 10_000 })
    await page.getByTestId('voice-confirm').tap()
    await expect(page.getByTestId('photo-caption')).toHaveText('Liam scores the winning goal')
  })

  test('say a chore name', async ({ page }) => {
    await page.getByTestId('nav-tasks').tap()
    await page.getByTestId('chore-new').tap()
    await page.getByTestId('say-chore').tap()
    await expect(page.getByTestId('action-preview')).toContainText('Clean the garage', { timeout: 10_000 })
    await page.getByTestId('voice-confirm').tap()
    await expect(page.getByTestId('voice-modal')).toBeHidden({ timeout: 6000 })
    await expect(page.getByTestId('chore-editor')).toContainText('Current: Clean the garage')
    await expect(page.getByTestId('chore-save')).toBeEnabled()
  })
})

test.describe('voice edits', () => {
  test('assign a chore by voice from the Chores modal', async ({ page }) => {
    await page.getByTestId('nav-tasks').tap()
    const list = page.getByTestId('chores-modal-list')
    await page.getByRole('radio', { name: 'All' }).tap()
    const before = await list.locator('li', { hasText: 'Take out the trash' }).count()

    await page.getByTestId('chores-modal').getByRole('button', { name: 'Chores by voice' }).tap()
    await page.getByRole('button', { name: 'Assign chore', exact: true }).tap()
    const preview = page.getByTestId('action-preview')
    await expect(preview).toContainText('Ethan', { timeout: 10_000 })
    await expect(preview).toContainText('Every Wed')
    await expect(preview).toContainText('20 points')
    expect(await list.locator('li', { hasText: 'Take out the trash' }).count()).toBe(before) // nothing yet

    await page.getByTestId('voice-confirm').tap()
    await expect(page.getByTestId('voice-modal')).toBeHidden({ timeout: 6000 })
    await expect(list.locator('li', { hasText: 'Take out the trash' })).toHaveCount(before + 1)
  })

  test('cancelling an event by voice is a destructive, explicitly confirmed action', async ({ page }) => {
    await page.getByTestId('nav-calendar').tap()
    await page.getByTestId('calendar-mic').tap()
    await page.getByRole('button', { name: 'Cancel event', exact: true }).tap()
    await expect(page.getByTestId('action-preview')).toContainText('Dentist Appointment', { timeout: 10_000 })
    await expect(page.getByTestId('action-preview')).toContainText('can’t be undone')
    await expect(page.getByTestId('voice-confirm')).toHaveText('Cancel Event')
    await page.getByTestId('voice-modal').getByRole('button', { name: 'Cancel', exact: true }).tap() // back out
    await expect(page.getByTestId('voice-modal')).toBeHidden()
  })

  test('the event detail mic carries the event, so “it” is unambiguous', async ({ page }) => {
    await page.getByTestId('nav-calendar').tap()
    await page.getByRole('radio', { name: 'Month' }).tap()
    await page.getByTestId('cal-next').tap() // dentist is within 5 days; find it from the month list
    await page.getByTestId('cal-today').tap()
    await page.getByRole('radio', { name: 'Day' }).tap()
    for (let i = 0; i < 5; i++) await page.getByTestId('cal-next').tap()
    await page.getByRole('button', { name: 'Dentist Appointment, open details' }).tap()
    await page.getByTestId('event-voice').tap()
    await expect(page.getByTestId('voice-modal')).toBeVisible()
    await expect(page.getByTestId('voice-modal')).toContainText('Move it to 5 PM')
  })
})

test('spoken replies are opt-in and the choice is remembered', async ({ page }) => {
  await page.getByTestId('global-mic').tap()
  const toggle = page.getByTestId('speak-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.tap()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await page.getByTestId('global-mic').tap()
  await expect(page.getByTestId('speak-toggle')).toHaveAttribute('aria-pressed', 'true')
})
