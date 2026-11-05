// Vérifications d'une pile en fonctionnement (Docker + Caddy en local, ou serveur seul). Développement uniquement.
//   tsx tools/probe-stack.ts setup  <url> <fichier>   crée une partie à quatre, la joue jusqu'au milieu d'un pli, enregistre l'état vu
//   tsx tools/probe-stack.ts advance <url> <fichier>  reprend la partie et la fait avancer (nouvelles donnes)
//   tsx tools/probe-stack.ts verify <url> <fichier>   reprend les quatre places et compare à l'état enregistré
//   tsx tools/probe-stack.ts origins <url>            origines refusées / acceptée, WebSocket effectif
//   tsx tools/probe-stack.ts spoof <url>              un X-Forwarded-For fourni par le client ne contourne pas les limites
import { readFileSync, writeFileSync } from 'node:fs'
import { Bot, openTable } from './bots'
import type { SessionGrant } from '../shared/protocol'
import type { RoomView } from '../shared/coinche/views'

const [mode, url, file] = process.argv.slice(2)
const origin = new URL(url).origin

/** Représentation comparable d'une vue (hors horloge, version, présence, délai restant). */
function stable(v: RoomView): string {
  const r = v.round && { ...v.round, window: v.round.window && { acceptedSeats: v.round.window.acceptedSeats } }
  return JSON.stringify({
    status: v.status,
    totals: v.totals,
    rounds: v.rounds,
    round: r,
    hand: v.hand,
    seats: v.seats,
    you: v.you.seat,
    nicknames: v.participants.map((p) => [p.id, p.nickname, p.seat]),
  })
}

async function resumeAll(grants: SessionGrant[]): Promise<Bot[]> {
  const out: Bot[] = []
  for (const [i, g] of grants.entries()) {
    const b = new Bot({ url, name: `p${i}`, origin })
    await b.connect()
    const r = await b.call('room:resume', { roomId: g.roomId, participantId: g.participantId, token: g.token })
    if (!r.ok) throw new Error(`reprise place ${i} : ${r.code}`)
    b.grant = g
    out.push(b)
  }
  await Promise.all(out.map((b) => b.waitFor((v) => v.pause === null && v.hand.length >= 0)))
  return out
}

async function main() {
  if (mode === 'setup') {
    const bots = await openTable(url, 'probe', { origin, target: 3000 })
    for (const b of bots) b.play()
    await bots[0].waitFor(
      (v) => v.round?.phase === 'playing' && v.rounds.length >= 1 && v.round.trick.length === 2,
      60_000,
    )
    for (const b of bots) b.autoplay = false // gèle la partie : plus d'action pendant la photographie
    await new Promise((r) => setTimeout(r, 400))
    const snap = bots.map((b) => stable(b.view!))
    writeFileSync(file, JSON.stringify({ grants: bots.map((b) => b.grant), snap }))
    console.log(`transport WebSocket effectif : ${bots.map((b) => b.socket.io.engine.transport.name).join(',')}`)
    console.log(
      `état enregistré : phase=${bots[0].view!.round!.phase} donnes=${bots[0].view!.rounds.length} totaux=${bots[0].view!.totals} pli=${bots[0].view!.round!.trick.length} cartes=${bots.map((b) => b.view!.hand.length)}`,
    )
    bots.forEach((b) => b.disconnect())
  } else if (mode === 'verify') {
    const { grants, snap } = JSON.parse(readFileSync(file, 'utf8')) as { grants: SessionGrant[]; snap: string[] }
    const bots = await resumeAll(grants)
    const same = bots.map((b, i) => stable(b.view!) === snap[i])
    console.log(`identique à l'état enregistré (par place) : ${same.join(',')}`)
    console.log(
      `phase=${bots[0].view!.round?.phase} donnes=${bots[0].view!.rounds.length} totaux=${bots[0].view!.totals} cartes=${bots.map((b) => b.view!.hand.length)}`,
    )
    bots.forEach((b) => b.disconnect())
    if (!same.every(Boolean)) process.exitCode = 1
  } else if (mode === 'advance') {
    const { grants } = JSON.parse(readFileSync(file, 'utf8')) as { grants: SessionGrant[] }
    const bots = await resumeAll(grants)
    const start = bots[0].view!.rounds.length
    for (const b of bots) b.play()
    await bots[0].waitFor((v) => v.rounds.length >= start + 2, 90_000)
    for (const b of bots) b.autoplay = false
    await new Promise((r) => setTimeout(r, 400))
    console.log(`partie avancée : donnes=${bots[0].view!.rounds.length} totaux=${bots[0].view!.totals}`)
    writeFileSync(file + '.advanced', JSON.stringify({ snap: bots.map((b) => stable(b.view!)) }))
    bots.forEach((b) => b.disconnect())
  } else if (mode === 'origins') {
    const bad = ['https://evil.example', 'null', 'http://127.0.0.1:9999']
    for (const o of bad) {
      const b = new Bot({ url, name: 'x', origin: o })
      const ok = await b.connect().then(
        () => true,
        () => false,
      )
      const res = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: o } })
      console.log(`origine ${o} : WebSocket ${ok ? 'ACCEPTÉ (anormal)' : 'refusé'} ; polling HTTP ${res.status}`)
      if (ok || res.status !== 403) process.exitCode = 1
      b.disconnect()
    }
    const good = new Bot({ url, name: 'bon', origin })
    await good.connect()
    console.log(`origine ${origin} : accepté, transport=${good.socket.io.engine.transport.name}`)
    good.disconnect()
  } else if (mode === 'spoof') {
    // Le client prétend venir d'une adresse différente à chaque création. Si le proxy conservait cet en-tête,
    // la limite de 20 créations par heure et par adresse ne s'appliquerait jamais.
    let limited = 0
    for (let i = 0; i < 24; i++) {
      const b = new Bot({ url, name: `sp${i}`, origin, xff: `203.0.113.${i + 1}` })
      await b.connect()
      const r = await b.call('room:create', { nickname: 'Test' })
      if (!r.ok && r.code === 'rate_limited') limited++
      b.disconnect()
    }
    console.log(`créations refusées par la limite : ${limited} sur 24 (attendu ≥ 4 si l'en-tête usurpé est ignoré)`)
    if (limited < 4) process.exitCode = 1
  } else throw new Error('mode inconnu')
}
main().then(
  () => process.exit(),
  (e) => {
    console.error('ÉCHEC', e instanceof Error ? e.message : e)
    process.exit(1)
  },
)
