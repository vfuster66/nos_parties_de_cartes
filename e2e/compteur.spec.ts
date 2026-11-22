import { expect, test } from '@playwright/test'

test('compteur : coinche, une donne, historique et classement provisoire', async ({ page }) => {
  await page.goto('/#/nouvelle?kind=coinche')
  await page.getByTestId('seat-a1').fill('Camille')
  await page.getByTestId('seat-a2').fill('Inès')
  await page.getByTestId('seat-b1').fill('Louis')
  await page.getByTestId('seat-b2').fill('Marc')
  await page.getByTestId('start-game').click()

  await expect(page.getByTestId('add-deal')).toBeVisible()
  await expect(page.getByText('arrondi à la dizaine')).toBeVisible()
  await page.getByTestId('add-deal').click()

  await page.getByRole('radio', { name: 'Camille', exact: true }).click()
  await page.getByRole('radio', { name: 'cœur' }).click()
  await page.getByRole('radio', { name: '80', exact: true }).click()
  await page.locator('#pts').fill('100')
  await expect(page.getByTestId('live-result')).toContainText('+')
  await page.getByTestId('save-deal').click()

  await expect(page.getByText('Donnes (1)')).toBeVisible()
  await expect(page.getByText('Camille — Camille & Inès — 80 à cœur')).toBeVisible()

  await page.goto('/#/historique')
  await expect(page.getByText('Coinche')).toBeVisible()
  await expect(page.getByRole('option', { name: /Camille & Inès/ })).toBeAttached()

  await page.goto('/#/classements')
  await expect(page.getByRole('heading', { name: 'En cours' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Coinche — Partie 1/ })).toBeVisible()
})

test('relier un résultat en ligne aux joueurs du compteur', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'ncp.online.results.v1',
      JSON.stringify([
        {
          roomId: 'room-test',
          name: 'Coinche en ligne',
          status: 'finished',
          endedAt: Date.now(),
          players: [
            { nickname: 'Ada', seat: 0 },
            { nickname: 'Bea', seat: 1 },
            { nickname: 'Celia', seat: 2 },
            { nickname: 'Dina', seat: 3 },
          ],
          rounds: 2,
          formula: 'coinche',
          game: 'team',
          teamNames: ['Nord', 'Sud'],
          totals: [400, 120],
          winnerTeam: 0,
          myTeam: 0,
        },
      ]),
    )
  })
  await page.goto('/#/en-ligne')
  await page.getByTestId('link-online').click()
  await expect(page.getByTestId('link-online-form')).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter aux classements' }).click()
  await expect(page.getByText('Score ramené d’une table en ligne (2 donnes)')).toBeVisible()
  await expect(page.getByLabel('Nord : 400 points')).toBeVisible()

  await page.goto('/#/classements')
  await expect(page.getByRole('link', { name: 'Ada' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nord' })).toBeVisible()
})
