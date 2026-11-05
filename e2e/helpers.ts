/// <reference lib="dom" />
import { expect } from '@playwright/test'
import type { Browser, BrowserContext, Page } from '@playwright/test'

export const NAMES = ['Anne', 'Bob', 'Cléo', 'Dan']

export interface Player {
  name: string
  ctx: BrowserContext
  page: Page
}

/** Quatre contextes indépendants : stockage local, cookies et connexions séparés. */
export async function fourPlayers(browser: Browser): Promise<Player[]> {
  const out: Player[] = []
  for (const name of NAMES) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true })
    out.push({ name, ctx, page: await ctx.newPage() })
  }
  return out
}

/** Hôte crée le salon ; les trois autres le rejoignent par le lien partagé (code seul). */
export async function createAndJoin(players: Player[]): Promise<string> {
  const [host, ...others] = players
  await host.page.goto('/#/en-ligne')
  await host.page.getByTestId('nickname').fill(host.name)
  await host.page.getByTestId('create-room').click()
  await expect(host.page.getByTestId('lobby')).toBeVisible()
  const code = (await host.page.getByTestId('room-code').innerText()).replace('-', '')
  for (const p of others) {
    await p.page.goto(`/#/en-ligne/rejoindre/${code}`)
    await p.page.getByTestId('nickname').fill(p.name)
    await p.page.getByTestId('join-room').click()
    await expect(p.page.getByTestId('lobby')).toBeVisible()
  }
  return code
}

export async function sitAndReady(players: Player[]): Promise<void> {
  for (const [i, p] of players.entries()) {
    await p.page.getByTestId(`seat-${i}`).getByTestId('take-seat').click()
    await expect(p.page.getByTestId(`seat-${i}`)).toContainText(`${p.name} (vous)`)
    await p.page.getByTestId('ready').click()
  }
}

/** Joue la première carte autorisée de celui dont c'est le tour, jusqu'à ce que `until` soit visible chez tous. */
export async function playAllCards(players: Player[], until: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (await players[0].page.getByTestId(until).isVisible()) return
    let acted = false
    for (const p of players) {
      const playable = p.page.locator('[data-testid=hand-card][data-state=playable]')
      if ((await playable.count()) > 0) {
        await playable.first().click()
        await p.page.getByTestId('play-card').click()
        // Attendre la confirmation du serveur (la carte quitte la main) avant de repartir : pas de décision locale.
        await expect(p.page.getByTestId('play-card')).toHaveCount(0)
        acted = true
        break
      }
    }
    if (!acted) await players[0].page.waitForTimeout(60)
  }
  throw new Error('La donne ne se termine pas')
}

export async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}
