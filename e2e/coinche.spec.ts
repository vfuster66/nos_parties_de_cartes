import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createAndJoin, fourPlayers, noHorizontalScroll, playAllCards, sitAndReady } from './helpers'
import type { Player } from './helpers'

const shot = (page: Page, name: string) => page.screenshot({ path: `docs/online/${name}.png`, fullPage: true })

async function startGame(players: Player[], rules: { target: number }) {
  const host = players[0].page
  await host.getByTestId('room-code').waitFor()
  // Règles : l'hôte les enregistre (cela remet les « prêt » à zéro), puis tout le monde se déclare prêt.
  await host.getByTestId('rules-toggle').click()
  await host.locator('#target').fill(String(rules.target))
  await host.locator('#dealer').selectOption('3') // la place 4 donne : la place 1 parle et entame
  await host.locator('#gname').fill('Soirée e2e')
  await host.getByTestId('save-config').click()
  await expect(host.getByTestId('save-config')).toBeDisabled()
  for (const p of players) await expect(p.page.getByTestId('seat-0')).toBeVisible()
  await sitAndReady(players)
  await expect(host.getByTestId('start')).toBeEnabled()
  await host.getByTestId('start').click()
  for (const p of players) await expect(p.page.getByTestId('table')).toBeVisible()
}

async function bidAndPass(players: Player[]) {
  const [anne, ...rest] = players
  await anne.page.getByTestId('bid-value').filter({ hasText: /^80$/ }).click()
  await anne.page.getByTestId('bid-suit').nth(1).click() // cœur
  await anne.page.getByTestId('bid-confirm').click()
  for (const p of rest) {
    await expect(p.page.getByTestId('pass')).toBeVisible()
    await p.page.getByTestId('pass').click()
  }
  for (const p of players) await expect(p.page.getByTestId('hand-card').first()).toBeVisible()
}

test('parcours complet : salon, places, enchères, donne, nouvelle donne, reconnexion', async ({ browser }) => {
  const players = await fourPlayers(browser)
  try {
    const code = await createAndJoin(players)
    expect(code).toMatch(/^[A-Z2-9]{8}$/)
    await shot(players[0].page, '01-salon')
    await startGame(players, { target: 3000 })

    // Chacun voit huit cartes à lui, rien des autres.
    const hands: string[][] = []
    for (const p of players) {
      const cards = await p.page
        .getByTestId('hand-card')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-card')!))
      expect(cards).toHaveLength(8)
      hands.push(cards)
    }
    expect(new Set(hands.flat()).size).toBe(32)
    await expect(players[0].page.getByTestId('bidding')).toBeVisible()
    await expect(players[1].page.getByText(/Au tour de/)).toBeVisible()
    await noHorizontalScroll(players[0].page)
    await shot(players[0].page, '02-encheres')

    await bidAndPass(players)
    await expect(players[2].page.getByTestId('contract-bar')).toContainText('Contrat 80')
    await shot(players[0].page, '03-table')
    await noHorizontalScroll(players[0].page)

    // Une carte interdite n'est pas jouable pour celui qui n'a pas la main.
    await expect(players[1].page.locator('[data-testid=hand-card][data-state=playable]')).toHaveCount(0)

    await playAllCards(players, 'round-summary')
    for (const p of players) await expect(p.page.getByTestId('round-summary')).toBeVisible()

    // Résultat identique pour les quatre, et cohérent : 162 points de plis.
    const summary = await Promise.all(players.map((p) => p.page.getByTestId('round-summary').innerText()))
    expect(new Set(summary.map((s) => s.replace(/\s+/g, ' '))).size).toBe(1)
    const pts = /Points de plis\s+(\d+) \/ (\d+)/.exec(summary[0])!
    expect(Number(pts[1]) + Number(pts[2])).toBe(162)
    const delta = (await players[0].page.getByTestId('delta').innerText()).match(/-?\d+|\d+/g)!
    const totals = (await players[0].page.getByTestId('totals').innerText()).match(/\d+/g)!
    expect(totals.slice(-2).map(Number)).toEqual(delta.slice(-2).map((x) => Math.abs(Number(x))))
    await shot(players[0].page, '04-resume-donne')
    await noHorizontalScroll(players[0].page)

    // Donne suivante : tous doivent être prêts.
    for (const p of players.slice(0, 3)) await p.page.getByTestId('next-round').click()
    await expect(players[3].page.getByTestId('round-summary')).toContainText('Prêts : 3 / 4')
    await players[3].page.getByTestId('next-round').click()
    for (const p of players) await expect(p.page.getByTestId('bidding')).toBeVisible()
    // Le donneur a tourné : la place 1 est donneuse, Bob (place 2) parle en premier.
    await expect(players[1].page.getByText('À vous', { exact: true })).toBeVisible()

    // Déconnexion de Dan : pause pour les autres ; retour avec la même main.
    const danHand = await players[3].page
      .getByTestId('hand-card')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-card')!))
    await players[3].page.close()
    for (const p of players.slice(0, 3)) await expect(p.page.getByTestId('pause')).toBeVisible()
    await shot(players[0].page, '05-pause')
    const back = await players[3].ctx.newPage()
    await back.goto('/#/en-ligne')
    await back.getByText('Mes salons').waitFor()
    await back.locator('a', { hasText: 'Dan' }).first().click()
    await expect(back.getByTestId('table')).toBeVisible()
    const restored = await back
      .getByTestId('hand-card')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-card')!))
    expect(restored).toEqual(danHand)
    for (const p of players.slice(0, 3)) await expect(p.page.getByTestId('pause')).toHaveCount(0)
    players[3].page = back

    // Un pseudo seul ne permet pas de reprendre une place : un contexte neuf est refusé.
    const stranger = await (await browser.newContext()).newPage()
    await stranger.goto(`/#/en-ligne/rejoindre/${code}`)
    await stranger.getByTestId('nickname').fill('Dan')
    await stranger.getByTestId('join-room').click()
    await expect(stranger.getByRole('alert')).toContainText(/commencé|complet|introuvable|pseudo/i)
  } finally {
    for (const p of players) await p.ctx.close()
  }
})

test('coinche, surcoinche et partie complète jusqu’au résultat final', async ({ browser }) => {
  const players = await fourPlayers(browser)
  try {
    await createAndJoin(players)
    await startGame(players, { target: 100 })
    const [anne, bob] = players
    await anne.page.getByTestId('bid-value').filter({ hasText: /^80$/ }).click()
    await anne.page.getByTestId('bid-suit').first().click()
    await anne.page.getByTestId('bid-confirm').click()
    // Bob (adversaire) coince hors de son tour de parler : il a la main, mais la coinche est possible à la volée.
    await expect(bob.page.getByTestId('coinche')).toBeVisible()
    await bob.page.getByTestId('coinche').click()
    await bob.page.getByRole('button', { name: 'Coincher', exact: true }).click()
    for (const p of players) await expect(p.page.getByTestId('coinche-window')).toBeVisible()
    await shot(bob.page, '06-fenetre-coinche')
    // Les adversaires ne voient pas de bouton de surcoinche ; Anne surcoinche.
    await expect(bob.page.getByTestId('surcoinche')).toHaveCount(0)
    await anne.page.getByTestId('surcoinche').click()
    for (const p of players) await expect(p.page.getByTestId('contract-bar')).toContainText('surcoinché ×3')
    await playAllCards(players, 'result')
    const finals = await Promise.all(players.map((p) => p.page.getByTestId('result').innerText()))
    expect(new Set(finals.map((s) => s.replace(/\s+/g, ' '))).size).toBe(1)
    await expect(anne.page.getByTestId('winner')).toBeVisible()
    await shot(anne.page, '07-resultat')
    await noHorizontalScroll(anne.page)
  } finally {
    for (const p of players) await p.ctx.close()
  }
})
