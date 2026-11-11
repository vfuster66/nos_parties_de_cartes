import { expect, test } from '@playwright/test'
import { createAndJoin, fourPlayers, noHorizontalScroll, playAllCards, sitAndReady } from './helpers'

test('belote avec annonces : deuxième tour, donne complète et score partagé', async ({ browser }) => {
  const players = await fourPlayers(browser)
  const host = players[0].page
  try {
    await createAndJoin(players, 'belote-annonces')
    await expect(host.locator('#target')).toHaveValue('1000')
    await host.locator('#dealer').selectOption('3')
    await host.getByTestId('save-config').click()
    await expect(host.getByTestId('save-config')).toBeDisabled()
    await sitAndReady(players)
    await host.getByTestId('start').click()
    for (const player of players) {
      await expect(player.page.getByTestId('hand-card')).toHaveCount(5)
      await expect(player.page.getByTestId('bidding')).toContainText('Tour 1/2')
    }
    await expect(host.getByRole('button', { name: /^Prendre à/ })).toHaveCount(1)
    for (const player of players) await player.page.getByTestId('pass').click()
    await expect(host.getByTestId('bidding')).toContainText('Tour 2/2')
    await expect(host.getByRole('button', { name: /^Prendre à/ })).toHaveCount(3)
    await host
      .getByRole('button', { name: /^Prendre à/ })
      .first()
      .click()
    for (const player of players) await expect(player.page.getByTestId('hand-card')).toHaveCount(8)
    await playAllCards(players, 'round-summary')
    const totals = await Promise.all(players.map((p) => p.page.getByTestId('totals').innerText()))
    expect(new Set(totals).size).toBe(1)
    await noHorizontalScroll(host)
  } finally {
    for (const player of players) await player.ctx.close()
  }
})
