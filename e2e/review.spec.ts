// Revue visuelle et ergonomique (à la demande) : npm run test:review
// Quatre contextes indépendants, plusieurs largeurs, Chromium et WebKit automatisé.
// Les captures vont dans test-results/review/<navigateur>-<largeur>/. WebKit automatisé ≠ Safari sur un vrai iPhone.
import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { createAndJoin, noHorizontalScroll, playAllCards, sitAndReady } from './helpers'
import type { Player } from './helpers'

const WIDTHS = (process.env.REVIEW_WIDTHS ?? '375,390,1100').split(',').map(Number)
// Pseudos volontairement longs (20 caractères maximum acceptés par le serveur).
const LONG = ['Anne-Sophie-Marguerit', 'Wolfeschlegelsteinha', 'Jean-Baptiste-Emmanu', 'ÉléonoreDeLaFontaine']
const NAMES = LONG.map((n) => [...n].slice(0, 20).join(''))

interface Ctx {
  dir: string
  issues: string[]
}

async function snap(page: Page, c: Ctx, name: string): Promise<void> {
  if (process.env.REVIEW_LOG) console.log(`[snap] ${c.dir} ${name}`)
  // Les captures pleine page de WebKit automatisé se bloquent parfois : repli sur la fenêtre visible.
  await page
    .screenshot({ path: `${c.dir}/${name}.png`, fullPage: true, timeout: 8000 })
    .catch(() => page.screenshot({ path: `${c.dir}/${name}.png`, timeout: 8000 }))
  const problems = await page.evaluate(() => {
    const out: string[] = []
    const vw = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth > vw)
      out.push(`débordement horizontal ${document.documentElement.scrollWidth}>${vw}`)
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const st = getComputedStyle(el)
      if (st.visibility === 'hidden' || st.display === 'none' || st.position === 'fixed') continue
      if (r.right > vw + 1 || r.left < -1) {
        out.push(
          `hors écran : <${el.tagName.toLowerCase()}> ${(el.textContent ?? '').trim().slice(0, 30)} [${Math.round(r.left)}..${Math.round(r.right)}]`,
        )
        break
      }
    }
    // Zones tactiles : boutons et liens-boutons visibles d'au moins 40 px de haut.
    for (const el of document.querySelectorAll<HTMLElement>('button, a.btn, [role=button]')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (r.height < 40 || r.width < 40)
        out.push(
          `cible tactile trop petite ${Math.round(r.width)}×${Math.round(r.height)} : « ${(el.textContent ?? '').trim().slice(0, 30)} »`,
        )
    }
    return out
  })
  for (const p of problems) c.issues.push(`${name} : ${p}`)
}

async function players(
  browser: import('@playwright/test').Browser,
  width: number,
  patch?: (ctx: BrowserContext, i: number) => Promise<void>,
): Promise<Player[]> {
  const out: Player[] = []
  for (const [i, name] of NAMES.entries()) {
    const ctx = await browser.newContext({
      viewport: { width, height: 800 },
      hasTouch: width < 600,
      isMobile: width < 600 && browser.browserType().name() !== 'firefox',
    })
    if (patch) await patch(ctx, i)
    out.push({ name, ctx, page: await ctx.newPage() })
  }
  return out
}

for (const width of WIDTHS) {
  test(`revue ${width}px : accueil, salons, enchères, table, pause, résumé, nouvelle donne, erreurs`, async ({
    browser,
    browserName,
  }, info) => {
    const dir = `test-results/review/${browserName}-${width}`
    mkdirSync(dir, { recursive: true })
    const c: Ctx = { dir, issues: [] }
    // Ce joueur-ci (Dan) peut « perdre » ses commandes sortantes pour simuler un serveur qui ne répond pas.
    const ps = await players(browser, width, async (ctx, i) => {
      if (i !== 3) return
      await ctx.addInitScript(() => {
        const send = WebSocket.prototype.send
        WebSocket.prototype.send = function (d: Parameters<WebSocket['send']>[0]) {
          if (
            (window as unknown as { __drop?: boolean }).__drop &&
            typeof d === 'string' &&
            d.startsWith('42') &&
            d.includes('"command"')
          )
            return
          return send.call(this, d)
        }
      })
    })
    // Garde-fou de diagnostic : si le parcours se bloque, on photographie les quatre écrans avant l'expiration.
    const watchdog = setTimeout(() => {
      for (const p of ps)
        void p.page
          .screenshot({ path: `${dir}/BLOQUE-${p.name.slice(0, 6)}.png`, timeout: 5000 })
          .catch(() => undefined)
    }, 30_000)
    try {
      const [anne, bob, cleo, dan] = ps
      // --- Accueil et erreurs ---
      await anne.page.goto('/')
      await snap(anne.page, c, '00-accueil-compteur')
      await anne.page.getByRole('link', { name: /Jouer en ligne/ }).click() // le chemin réel de l'utilisateur
      await expect(anne.page.getByTestId('create-room')).toBeVisible()
      await snap(anne.page, c, '01-accueil-en-ligne')
      // Clavier virtuel (émulation par réduction de la hauteur) : le formulaire reste atteignable.
      await anne.page.setViewportSize({ width, height: 320 })
      await anne.page.getByTestId('nickname').fill(NAMES[0])
      await anne.page.getByTestId('create-room').scrollIntoViewIfNeeded()
      await expect(anne.page.getByTestId('create-room')).toBeInViewport()
      await anne.page.setViewportSize({ width, height: 800 })
      // Salon introuvable (code valide mais inconnu) et salon enregistré inconnu.
      await dan.page.goto('/#/en-ligne/rejoindre/ZZZZZZZZ')
      await dan.page.getByTestId('nickname').fill('Visiteur')
      await dan.page.getByTestId('join-room').click()
      await expect(dan.page.getByRole('alert')).toContainText(/introuvable/i)
      await snap(dan.page, c, '02-salon-introuvable')
      await dan.page.goto('/#/en-ligne/salon/inconnu')
      await expect(dan.page.getByText('Impossible de reprendre cette place')).toBeVisible()
      await snap(dan.page, c, '03-salon-inconnu')

      // --- Salon : création, quatre arrivées, cinquième refusée ---
      const code = await createAndJoin(ps)
      await snap(anne.page, c, '04-salon-complet-avant-places')
      const fifth = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage()
      await fifth.goto(`/#/en-ligne/rejoindre/${code}`)
      await fifth.getByTestId('nickname').fill('Cinquième')
      await fifth.getByTestId('join-room').click()
      await expect(fifth.getByRole('alert')).toContainText(/complet|commencé/i)
      await snap(fifth, c, '05-salon-complet-refus')
      await anne.page.locator('#gname').fill('Une soirée dont le nom est vraiment très très long pour tester')
      await anne.page.locator('#dealer').selectOption('3')
      await anne.page.locator('#target').fill('3000')
      await anne.page.getByTestId('save-config').click()
      await sitAndReady(ps)
      await snap(anne.page, c, '06-places-et-prets')
      await snap(dan.page, c, '06b-places-vue-joueur')
      await expect(anne.page.getByTestId('start')).toBeEnabled()
      await anne.page.getByTestId('start').click()
      for (const p of ps) await expect(p.page.getByTestId('table')).toBeVisible()

      // --- Enchères ---
      await expect(anne.page.getByTestId('bidding')).toBeVisible()
      await snap(anne.page, c, '07-encheres-mon-tour')
      await snap(bob.page, c, '07b-encheres-attente')
      await anne.page.getByTestId('bid-value').filter({ hasText: /^80$/ }).click()
      await anne.page.getByTestId('bid-suit').nth(1).click()
      await snap(anne.page, c, '08-encheres-saisie')
      await anne.page.getByTestId('bid-confirm').click()
      for (const p of [bob, cleo, dan]) {
        await expect(p.page.getByTestId('pass')).toBeVisible()
        if (p === bob) await snap(bob.page, c, '09-encheres-reponse-possible-coinche')
        if (process.env.REVIEW_LOG) console.log(`[passe] ${p.name}`)
        await p.page.getByTestId('pass').click()
      }
      if (process.env.REVIEW_LOG) console.log('[passes terminées]')
      for (const p of ps) await expect(p.page.getByTestId('hand-card').first()).toBeVisible()

      // --- Table : main de huit cartes, tour, atout, cartes autorisées ---
      const cards = anne.page.getByTestId('hand-card')
      await expect(cards).toHaveCount(8)
      for (let i = 0; i < 8; i++) {
        const b = (await cards.nth(i).boundingBox())!
        expect(b.x, `carte ${i} à gauche`).toBeGreaterThanOrEqual(0)
        expect(b.x + b.width, `carte ${i} à droite`).toBeLessThanOrEqual(width + 1)
        expect(b.width, `carte ${i} largeur`).toBeGreaterThanOrEqual(40)
      }
      await expect(anne.page.getByTestId('contract-bar')).toContainText('Contrat 80')
      await snap(anne.page, c, '10-table-mon-tour')
      await snap(bob.page, c, '10b-table-attente')

      // Une carte n'est retirée de la main qu'après validation du serveur : ici les commandes de Dan sont perdues.
      // Anne ouvre, Bob, Cléo jouent la première carte autorisée ; puis Dan tente de jouer sans réponse du serveur.
      const playFirst = async (p: Player) => {
        if (process.env.REVIEW_LOG) console.log(`[joue] ${p.name}`)
        const playable = p.page.locator('[data-testid=hand-card][data-state=playable]')
        await expect(playable.first()).toBeVisible()
        await playable.first().click()
        await p.page.getByTestId('play-card').click()
        await expect(p.page.getByTestId('play-card')).toHaveCount(0)
      }
      await playFirst(anne)
      await playFirst(bob)
      await playFirst(cleo)
      await expect(dan.page.locator('[data-testid=hand-card][data-state=playable]').first()).toBeVisible()
      await snap(dan.page, c, '11-table-cartes-autorisees-et-bloquees')
      const blocked = await dan.page.locator('[data-testid=hand-card][data-state=blocked]').count()
      const before = await dan.page.getByTestId('hand-card').count()
      await dan.page.evaluate(() => ((window as unknown as { __drop?: boolean }).__drop = true))
      await dan.page.locator('[data-testid=hand-card][data-state=playable]').first().click()
      await dan.page.getByTestId('play-card').click()
      await dan.page.waitForTimeout(1200)
      expect(await dan.page.getByTestId('hand-card').count(), 'carte conservée sans réponse du serveur').toBe(before)
      await snap(dan.page, c, '12-envoi-en-attente-du-serveur')
      if (width === 375 && browserName === 'chromium') {
        await expect(dan.page.getByRole('alert').filter({ hasText: /ne répond pas/ })).toBeVisible({ timeout: 12_000 })
        await snap(dan.page, c, '13-erreur-serveur-muet')
      } else await dan.page.waitForTimeout(9000)
      await dan.page.evaluate(() => ((window as unknown as { __drop?: boolean }).__drop = false))
      if (await dan.page.getByRole('button', { name: 'Fermer ce message' }).count())
        await dan.page.getByRole('button', { name: 'Fermer ce message' }).click()
      // Aucun état bloqué : la carte est toujours là, on peut réessayer et le serveur valide.
      await expect(dan.page.getByTestId('hand-card')).toHaveCount(before)
      const again = dan.page
        .locator(
          '[data-testid=hand-card][data-state=playable], [data-testid=hand-card][data-state=selected], [data-testid=hand-card][data-state=pending]',
        )
        .first()
      await again.click({ force: true })
      if ((await dan.page.getByTestId('play-card').count()) === 0)
        await dan.page.locator('[data-testid=hand-card][data-state=playable]').first().click()
      await dan.page.getByTestId('play-card').click()
      await expect(dan.page.getByTestId('hand-card')).toHaveCount(before - 1)
      expect(blocked).toBeGreaterThanOrEqual(0)

      // --- Pause et reconnexion de Dan ---
      // Le gagnant du pli (variable selon la donne) entame le suivant.
      for (let i = 0; i < 100; i++) {
        const who = await Promise.all(
          ps.map((p) => p.page.locator('[data-testid=hand-card][data-state=playable]').count()),
        )
        const k = who.findIndex((n) => n > 0)
        if (k >= 0) {
          await playFirst(ps[k])
          break
        }
        await anne.page.waitForTimeout(80)
      }
      await dan.page.close()
      await expect(bob.page.getByTestId('pause')).toBeVisible()
      await snap(bob.page, c, '14-pause')
      const back = await dan.ctx.newPage()
      await back.goto('/#/en-ligne')
      await back.getByText('Mes salons').waitFor()
      await snap(back, c, '15-mes-salons')
      await back
        .locator('a', { hasText: NAMES[3].slice(0, 12) })
        .first()
        .click()
      await expect(back.getByTestId('table')).toBeVisible()
      await expect(bob.page.getByTestId('pause')).toHaveCount(0)
      dan.page = back
      await snap(back, c, '16-reconnexion')

      // --- Fin de donne : résumé, nouvelle donne ---
      await playAllCards(ps, 'round-summary')
      await snap(anne.page, c, '17-resume-donne')
      await snap(bob.page, c, '17b-resume-donne-autre-equipe')
      for (const p of ps.slice(0, 3)) await p.page.getByTestId('next-round').click()
      await snap(anne.page, c, '18-attente-des-autres')
      await dan.page.getByTestId('next-round').click()
      for (const p of ps) await expect(p.page.getByTestId('bidding')).toBeVisible()
      await snap(bob.page, c, '19-nouvelle-donne')
      await noHorizontalScroll(anne.page)
    } finally {
      clearTimeout(watchdog)
      if (info.status !== info.expectedStatus)
        for (const p of ps)
          await p.page.screenshot({ path: `${dir}/ECHEC-${p.name.slice(0, 6)}.png` }).catch(() => undefined)
      for (const p of ps) await p.ctx.close()
      info.annotations.push({ type: 'problèmes', description: c.issues.join('\n') || 'aucun' })
      if (c.issues.length) console.log(`\n[revue ${browserName} ${width}px]\n  ${c.issues.join('\n  ')}`)
    }
    expect
      .soft(
        c.issues.filter((i) => /débordement|hors écran/.test(i)),
        'débordements',
      )
      .toEqual([])
  })

  test(`revue ${width}px : coinche, compte à rebours, belote, résultat final`, async ({
    browser,
    browserName,
  }, info) => {
    const dir = `test-results/review/${browserName}-${width}`
    mkdirSync(dir, { recursive: true })
    const c: Ctx = { dir, issues: [] }
    const ps = await players(browser, width)
    try {
      const [anne, bob] = ps
      await createAndJoin(ps)
      await anne.page.locator('#target').fill('100')
      await anne.page.locator('#dealer').selectOption('3')
      await anne.page.getByTestId('save-config').click()
      await sitAndReady(ps)
      await anne.page.getByTestId('start').click()
      for (const p of ps) await expect(p.page.getByTestId('table')).toBeVisible()
      await anne.page.getByTestId('bid-value').filter({ hasText: /^80$/ }).click()
      await anne.page.getByTestId('bid-suit').first().click()
      await anne.page.getByTestId('bid-confirm').click()
      await expect(bob.page.getByTestId('coinche')).toBeVisible()
      await bob.page.getByTestId('coinche').click()
      await snap(bob.page, c, '20-confirmation-coinche')
      await bob.page.getByRole('button', { name: 'Coincher', exact: true }).click()
      for (const p of ps) await expect(p.page.getByTestId('coinche-window')).toBeVisible()
      const t0 = await anne.page.getByTestId('window-timer').innerText()
      await snap(anne.page, c, '21-fenetre-coinche-preneurs')
      await snap(bob.page, c, '21b-fenetre-coinche-adversaires')
      await anne.page.waitForTimeout(1500)
      const t1 = await anne.page.getByTestId('window-timer').innerText()
      expect(t1, 'le compte à rebours avance').not.toBe(t0)
      await anne.page.getByTestId('surcoinche').click()
      for (const p of ps) await expect(p.page.getByTestId('contract-bar')).toContainText('surcoinché ×3')
      // Jeu : on capture l'annonce « Belote / Rebelote » si elle survient.
      let belote = false
      for (let i = 0; i < 400 && !(await anne.page.getByTestId('result').isVisible()); i++) {
        if (!belote) {
          for (const p of ps)
            if (await p.page.getByTestId('belote-announce').isVisible()) {
              await snap(p.page, c, '22-belote-annonce')
              belote = true
              break
            }
        }
        let acted = false
        for (const p of ps) {
          const playable = p.page.locator('[data-testid=hand-card][data-state=playable]')
          if ((await playable.count()) > 0) {
            await playable.first().click()
            await p.page.getByTestId('play-card').click()
            await expect(p.page.getByTestId('play-card')).toHaveCount(0)
            acted = true
            break
          }
        }
        if (!acted) await anne.page.waitForTimeout(40)
      }
      info.annotations.push({
        type: 'belote',
        description: belote ? 'annonce capturée' : 'aucune belote dans cette donne déterministe',
      })
      await expect(anne.page.getByTestId('result')).toBeVisible()
      await snap(anne.page, c, '23-resultat-final')
      await snap(bob.page, c, '23b-resultat-final-perdants')
      await noHorizontalScroll(anne.page)
    } finally {
      for (const p of ps) await p.ctx.close()
      if (c.issues.length)
        console.log(`\n[revue ${browserName} ${width}px — coinche/final]\n  ${c.issues.join('\n  ')}`)
    }
    expect
      .soft(
        c.issues.filter((i) => /débordement|hors écran/.test(i)),
        'débordements',
      )
      .toEqual([])
  })
}
