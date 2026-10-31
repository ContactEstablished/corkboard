import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?persist=0')
  await expect(page.getByTestId('home')).toBeVisible()
})

test.describe('calendar', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByTestId('nav-calendar').tap()
    await expect(page.getByTestId('day-view')).toBeVisible()
  })

  test('Day, Week and Month views share one selected date', async ({ page }) => {
    const title = page.getByTestId('cal-title')
    const dayTitle = await title.textContent()

    await page.getByRole('radio', { name: 'Week' }).tap()
    await expect(page.getByTestId('week-view')).toBeVisible()
    await expect(title).toContainText('–')

    await page.getByRole('radio', { name: 'Month' }).tap()
    await expect(page.getByTestId('month-view')).toBeVisible()
    await expect(title).toContainText('2026')

    await page.getByRole('radio', { name: 'Day' }).tap()
    await expect(title).toHaveText(dayTitle!) // coming back lands on the same date
  })

  test('navigating the month and selecting a date reveals that date’s events', async ({ page }) => {
    await page.getByRole('radio', { name: 'Month' }).tap()
    const month = await page.getByTestId('cal-title').textContent()
    await page.getByTestId('cal-next').tap()
    await expect(page.getByTestId('cal-title')).not.toHaveText(month!)
    await page.getByTestId('cal-today').tap()
    await expect(page.getByTestId('cal-title')).toHaveText(month!)

    await page.locator('[data-testid^=day-]').nth(15).tap()
    await expect(page.getByTestId('month-events').or(page.getByTestId('month-empty'))).toBeVisible()
  })

  test('tapping a day in the week view opens that day', async ({ page }) => {
    await page.getByRole('radio', { name: 'Week' }).tap()
    await page.getByRole('button', { name: /^Open Monday/ }).tap()
    await expect(page.getByTestId('day-view')).toBeVisible()
    await expect(page.getByTestId('cal-title')).toContainText('Monday')
  })

  test('adds, edits and deletes an event by touch', async ({ page }) => {
    // add
    await page.getByTestId('calendar-add').tap()
    await expect(page.getByTestId('event-save')).toBeDisabled() // a title is required
    await page.getByRole('button', { name: 'Dinner', exact: true }).tap()
    await page.getByRole('button', { name: 'Next day' }).tap()
    await page.getByRole('button', { name: '15 minutes later' }).tap()
    await expect(page.getByTestId('editor-time')).toHaveText('9:15 AM')
    await page.getByRole('button', { name: 'Jaime', exact: true }).last().tap()
    await page.getByTestId('event-save').tap()
    await expect(page.getByTestId('event-editor')).toBeHidden()

    // it lives on tomorrow
    await page.getByTestId('cal-next').tap()
    await expect(page.getByRole('button', { name: 'Dinner, open details' })).toBeVisible()

    // edit: change the title
    await page.getByRole('button', { name: 'Dinner, open details' }).tap()
    await page.getByTestId('event-edit').tap()
    await page.getByRole('button', { name: 'Playdate', exact: true }).tap()
    await page.getByTestId('event-save').tap()
    await expect(page.getByRole('button', { name: 'Playdate, open details' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dinner, open details' })).toHaveCount(0)

    // delete needs a second, explicit confirmation
    await page.getByRole('button', { name: 'Playdate, open details' }).tap()
    await page.getByRole('button', { name: 'Delete', exact: true }).tap()
    await expect(page.getByRole('button', { name: 'Playdate, open details' })).toBeVisible() // not yet deleted
    await page.getByTestId('confirm-delete').tap()
    await expect(page.getByRole('button', { name: 'Playdate, open details' })).toHaveCount(0)
  })

  test('repeating events warn that edits and deletes apply to the whole series', async ({ page }) => {
    // open any recurring event from the week view
    await page.getByRole('radio', { name: 'Week' }).tap()
    await page.getByRole('button', { name: /School at/ }).first().tap()
    await expect(page.getByTestId('event-detail')).toContainText('Repeats')
    await page.getByRole('button', { name: 'Delete', exact: true }).tap()
    await expect(page.getByRole('alert')).toContainText('Delete every repeat?')
  })
})

test.describe('grocery modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('button', { name: 'Open grocery list' }).tap()
    await expect(page.getByTestId('grocery-modal')).toBeVisible()
  })

  test('opens from the dashboard chevron and filters by category', async ({ page }) => {
    await page.getByRole('button', { name: /^Dairy/ }).tap()
    await expect(page.getByTestId('grocery-modal-items').locator('li')).toHaveCount(3) // milk, eggs, cheese
    await page.getByRole('button', { name: /^All items/ }).tap()
    await expect(page.getByTestId('grocery-modal-items').locator('li')).toHaveCount(9)
  })

  test('suggestions add items with one touch', async ({ page }) => {
    await page.getByRole('button', { name: 'Butter' }).tap()
    await expect(page.getByRole('button', { name: 'Butter, edit details' })).toBeVisible()
    await expect(page.getByTestId('grocery-modal').getByRole('button', { name: 'Butter', exact: true })).toHaveCount(0) // suggestion consumed
  })

  test('edits quantity and removes an item only after confirming', async ({ page }) => {
    await page.getByRole('button', { name: 'Bread, edit details' }).tap()
    await page.getByRole('button', { name: 'Increase quantity' }).tap()
    await page.getByRole('button', { name: 'Increase quantity' }).tap()
    await page.getByRole('button', { name: 'pack' }).tap()
    await expect(page.getByRole('button', { name: 'Bread, edit details' })).toContainText('2 pack')

    await page.getByRole('button', { name: 'Remove Bread', exact: true }).tap()
    await expect(page.getByRole('button', { name: 'Bread, edit details' })).toBeVisible() // still there
    await page.getByTestId('confirm-delete').tap()
    await expect(page.getByRole('button', { name: 'Bread, edit details' })).toHaveCount(0)
  })

  test('purchased items move down and can be cleared with confirmation', async ({ page }) => {
    await page.getByRole('button', { name: 'Mark Milk purchased' }).tap()
    await expect(page.getByRole('button', { name: 'Mark Milk not purchased' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear purchased' }).tap()
    await page.getByTestId('confirm-delete').tap()
    await expect(page.getByRole('button', { name: 'Mark Milk not purchased' })).toHaveCount(0)
  })

  test('closes back to the dashboard', async ({ page }) => {
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).tap()
    await expect(page.getByTestId('grocery-modal')).toBeHidden()
    await expect(page).toHaveURL(/#\/$/)
  })
})

test.describe('chores modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('button', { name: 'Open chores' }).tap()
    await expect(page.getByTestId('chores-modal')).toBeVisible()
  })

  test('completing a chore updates points, progress and history', async ({ page }) => {
    const row = page.getByTestId('modal-chore-c-table')
    await row.tap()
    await expect(page.getByTestId('chores-modal')).toContainText('Lumen completed Set the table')
    await expect(page.getByTestId('chores-modal-list')).not.toContainText('Set the table') // left the To do tab
    await page.getByRole('radio', { name: /^Done/ }).tap()
    await expect(page.getByTestId('modal-chore-c-table')).toBeDisabled()
  })

  test('creates, edits and deletes a chore', async ({ page }) => {
    await page.getByTestId('chore-new').tap()
    await expect(page.getByTestId('chore-save')).toBeDisabled()
    await page.getByRole('button', { name: 'Fold the laundry' }).tap()
    await page.getByRole('button', { name: 'Jaime', exact: true }).last().tap()
    await page.getByRole('button', { name: 'More points' }).tap()
    await expect(page.getByTestId('chore-points')).toHaveText('20')
    await page.getByRole('button', { name: 'Every day' }).tap()
    await page.getByTestId('chore-save').tap()
    await expect(page.getByTestId('chores-modal-list')).toContainText('Fold the laundry')

    await page.getByRole('button', { name: 'Edit Fold the laundry' }).tap()
    await page.getByRole('button', { name: 'More points' }).tap()
    await page.getByTestId('chore-save').tap()
    await expect(page.getByTestId('chores-modal-list')).toContainText('+25')

    await page.getByRole('button', { name: 'Edit Fold the laundry' }).tap()
    await page.getByRole('button', { name: 'Delete chore' }).tap()
    await page.getByTestId('confirm-delete').tap()
    await expect(page.getByTestId('chores-modal-list')).not.toContainText('Fold the laundry')
  })

  test('the All tab shows chores that are not due today with their next date', async ({ page }) => {
    await page.getByRole('radio', { name: 'All' }).tap()
    await expect(page.getByTestId('chores-modal-list')).toContainText('Water the plants')
    await expect(page.getByTestId('modal-chore-c-plants')).toBeDisabled() // not due today
  })

  test('follows the member filter chosen in the header', async ({ page }) => {
    await page.getByRole('button', { name: 'Ethan', exact: true }).first().tap()
    await expect(page.getByTestId('chores-modal-list')).toContainText('Clean bathroom')
    await expect(page.getByTestId('chores-modal-list')).not.toContainText('Take out the trash') // Liam's
  })
})

test.describe('messages modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('button', { name: 'Open messages' }).tap()
    await expect(page.getByTestId('messages-modal')).toBeVisible()
  })

  test('filters by type and keeps private messages hidden on the shared screen', async ({ page }) => {
    const list = page.getByTestId('messages-modal-list')
    await expect(list).toContainText('Private message')
    await expect(list).not.toContainText('Insurance paperwork')

    await page.getByRole('button', { name: /^Notes/ }).tap()
    await expect(list).toContainText('Wi-Fi password')
    await expect(list).not.toContainText('Pizza for dinner')

    await page.getByRole('button', { name: /^Reminders/ }).tap()
    await expect(list).toContainText('Trash pickup')
  })

  test('private messages are revealed only to their participants', async ({ page }) => {
    await page.getByRole('button', { name: 'Dad', exact: true }).first().tap()
    await expect(page.getByTestId('messages-modal-list')).toContainText('Insurance paperwork')
  })

  test('deleting a message needs confirmation', async ({ page }) => {
    const list = page.getByTestId('messages-modal-list')
    await page.getByRole('button', { name: 'Delete message' }).nth(3).tap()
    await expect(page.getByRole('alert')).toContainText('Delete?')
    await page.getByTestId('confirm-delete').tap()
    await expect(list.locator('li')).toHaveCount(9)
  })

  test('a reminder can be marked done', async ({ page }) => {
    await page.getByRole('button', { name: 'Mark reminder done' }).first().tap()
    await expect(page.getByRole('button', { name: 'Mark reminder not done' })).toHaveCount(1)
  })

  test('a voice message can be re-addressed by touch before it is sent', async ({ page }) => {
    await page.getByTestId('messages-modal').getByRole('button', { name: 'Add message or note by voice' }).tap()
    const picker = page.getByTestId('recipient-picker')
    await expect(picker).toBeVisible({ timeout: 10_000 })
    const to = page.getByTestId('action-preview').locator('dd').nth(1) // From / To / Message
    await expect(to).toContainText('Everyone')

    await picker.getByRole('button', { name: 'Jaime' }).tap()
    await expect(to).toContainText('Jaime')
    await expect(to).not.toContainText('Everyone')

    await page.getByTestId('voice-confirm').tap()
    await expect(page.getByTestId('voice-modal')).toBeHidden({ timeout: 6000 })
    await expect(page.getByTestId('messages-modal-list')).toContainText('Dinner is at six tonight')
  })
})

test.describe('photos modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByTestId('nav-photos').tap()
    await expect(page.getByTestId('photos-modal')).toBeVisible()
  })

  test('grid → viewer with next/previous and favorites', async ({ page }) => {
    await page.getByTestId('photo-grid').locator('button').first().tap()
    const caption = page.getByTestId('photo-caption')
    const first = await caption.textContent()
    await page.getByRole('button', { name: 'Next photo' }).tap()
    await expect(caption).not.toHaveText(first!)
    await page.getByRole('button', { name: 'Previous photo' }).tap()
    await expect(caption).toHaveText(first!)

    await page.getByRole('button', { name: 'Add to favorites' }).tap()
    await expect(page.getByRole('button', { name: 'Remove from favorites' })).toBeVisible()
  })

  test('category and favorites filters, and an empty album message', async ({ page }) => {
    await page.getByRole('button', { name: /^Pets/ }).tap()
    await expect(page.getByTestId('photo-grid').locator('li')).toHaveCount(1)
    await page.getByRole('button', { name: /^Favorites/ }).tap()
    await expect(page.getByTestId('photo-grid').locator('li').first()).toBeVisible()

    await page.getByRole('button', { name: 'Lumen', exact: true }).first().tap() // Lumen has no pets photos
    await page.getByRole('button', { name: /^Pets/ }).tap()
    await expect(page.getByTestId('photos-empty')).toBeVisible()
  })

  test('slideshow advances and can be paused', async ({ page }) => {
    await page.getByRole('radio', { name: 'Slideshow' }).tap()
    await expect(page.getByTestId('photo-stage')).toBeVisible()
    await page.getByRole('button', { name: 'Pause slideshow' }).tap()
    await expect(page.getByRole('button', { name: 'Play slideshow' })).toBeVisible()
  })

  test('shows only the selected member’s photos with a personal title', async ({ page }) => {
    await page.getByRole('button', { name: 'Ethan', exact: true }).first().tap()
    await expect(page.getByRole('dialog', { name: 'Ethan’s photos' })).toBeVisible()
  })
})

test.describe('member dashboard', () => {
  test('shows the person’s schedule, chores, upcoming events, messages and photos', async ({ page }) => {
    await page.getByRole('button', { name: 'Liam', exact: true }).first().tap()
    const dash = page.getByTestId('member-dashboard')
    await expect(dash).toContainText('Level 5')
    await expect(dash).toContainText('Soccer Player')
    await expect(page.getByTestId('member-today')).toBeVisible()
    await expect(page.getByTestId('member-chores')).toContainText('Take out the trash')
    await expect(page.getByTestId('member-upcoming')).toContainText('Science Project Due')
    await expect(page.getByTestId('member-photos').locator('li').first()).toBeVisible()

    // chores can be completed right from the dashboard
    const points = page.getByTestId('weekly-points')
    const before = Number(await points.textContent())
    await page.getByTestId('chore-c-trash').tap()
    await expect(points).toHaveText(String(before + 20))
  })

  test('chevrons open the matching full screens', async ({ page }) => {
    await page.getByRole('button', { name: 'Liam', exact: true }).first().tap()
    await page.getByRole('button', { name: 'Open photos' }).tap()
    await expect(page.getByRole('dialog', { name: 'Liam’s photos' })).toBeVisible()
  })
})
