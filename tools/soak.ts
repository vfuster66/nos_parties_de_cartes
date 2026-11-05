// Endurance et charge raisonnable (développement uniquement) :
//   npm run build:server && npx tsx tools/soak.ts --rooms 12 --minutes 10
// Lance un VRAI serveur (bundle de production) dans un processus séparé et le mesure de l'extérieur.
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Bot, openTable, percentile } from './bots'

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i < 0 ? d : (process.argv[i + 1] ?? d)
}
const ROOMS = Number(arg('rooms', '8'))
const MINUTES = Number(arg('minutes', '5'))
const TARGET = Number(arg('target', '500'))
const CHURN = Number(arg('churn', '0.004')) // probabilité de déconnexion par pas de 25 ms et par salon (un joueur à la fois)
const PORT = Number(arg('port', '3190'))
const url = `http://127.0.0.1:${PORT}`
const dir = mkdtempSync(join(tmpdir(), 'soak-'))
const dbPath = join(dir, 'soak.sqlite')

const server = spawn('node', ['server/dist/index.mjs'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DB_PATH: dbPath,
    TRUST_PROXY: '1',
    ALLOWED_ORIGINS: url,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverErrors = 0
let serverWarn = 0
const serverLines: string[] = []
server.stdout.on('data', (d: Buffer) => {
  for (const l of d.toString().split('\n').filter(Boolean)) {
    if (l.includes('"level":"error"')) {
      serverErrors++
      serverLines.push(l)
    }
    if (l.includes('"level":"warn"')) serverWarn++
  }
})
server.stderr.on('data', (d: Buffer) => serverLines.push(`STDERR ${d}`))

const sh = (c: string) => {
  try {
    return execSync(c, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}
const rssMb = () => Number(sh(`ps -o rss= -p ${server.pid}`)) / 1024
const fds = () => Number(sh(`lsof -p ${server.pid} 2>/dev/null | wc -l`))
const connsToServer = () =>
  Number(sh(`lsof -nP -iTCP:${PORT} -sTCP:ESTABLISHED -a -p ${server.pid} 2>/dev/null | wc -l`))

const stats = {
  games: 0,
  rounds: 0,
  abandoned: 0,
  churns: 0,
  resumes: 0,
  windowsLeftToExpire: 0,
  unexpected: [] as string[],
}
const allBots: Bot[] = []
const stopAt = Date.now() + MINUTES * 60_000
const samples: { t: number; rss: number; fds: number; conns: number }[] = []

async function playOneGame(roomNo: number, gameNo: number): Promise<void> {
  const xff = `10.${roomNo >> 8}.${roomNo & 255}.${(gameNo % 250) + 1}`
  const bots = await openTable(url, `s${roomNo}g${gameNo}`, { origin: url, xff, target: TARGET })
  const grants = bots.map((b) => b.grant!)
  const live = [...bots]
  for (const b of bots) {
    b.play(0.12)
    allBots.push(b)
  }
  const deadline = Date.now() + 8 * 60_000
  let lastChurn = 0
  while (Date.now() < deadline) {
    const v = live[0].view
    if (v && (v.status === 'finished' || v.status === 'abandoned')) break
    if (Math.random() < CHURN && Date.now() - lastChurn > 400 && v?.status === 'playing') {
      lastChurn = Date.now()
      const i = 1 + Math.floor(Math.random() * 3) // jamais l'observateur live[0]
      live[i].disconnect()
      stats.churns++
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 200))
      const back = new Bot({ url, name: `${bots[i].o.name}-r`, origin: url, xff: bots[i].o.xff })
      await back.connect()
      const r = await back.call('room:resume', {
        roomId: grants[i].roomId,
        participantId: grants[i].participantId,
        token: grants[i].token,
      })
      if (!r.ok) stats.unexpected.push(`resume ${r.code}`)
      stats.resumes++
      back.grant = grants[i]
      back.play(0.12)
      live[i] = back
      allBots.push(back)
    }
    await new Promise((r) => setTimeout(r, 25))
  }
  const final = live[0].view
  if (final?.status === 'finished') {
    stats.games++
    stats.rounds += final.rounds.length
    const sum = final.rounds.reduce((a, r) => [a[0] + r.delta[0], a[1] + r.delta[1]], [0, 0])
    if (sum[0] !== final.totals[0] || sum[1] !== final.totals[1]) stats.unexpected.push('total ≠ somme des donnes')
    if (final.rounds.filter((r) => !r.passed).some((r) => r.trickPoints[0] + r.trickPoints[1] !== 162))
      stats.unexpected.push('une donne ne fait pas 162 points')
  } else stats.unexpected.push(`partie non terminée (${final?.status})`)
  for (const b of live) b.disconnect()
}

async function roomLoop(roomNo: number): Promise<void> {
  for (let g = 0; Date.now() < stopAt; g++) {
    try {
      await playOneGame(roomNo, g)
    } catch (e) {
      stats.unexpected.push(`salle ${roomNo} : ${(e as Error).message}`)
    }
  }
}

async function main() {
  for (let i = 0; i < 40 && !sh(`curl -s ${url}/healthz`); i++) await new Promise((r) => setTimeout(r, 250))
  const t0 = Date.now()
  const sampler = setInterval(
    () => samples.push({ t: Math.round((Date.now() - t0) / 1000), rss: rssMb(), fds: fds(), conns: connsToServer() }),
    15_000,
  )
  samples.push({ t: 0, rss: rssMb(), fds: fds(), conns: connsToServer() })
  await Promise.all(Array.from({ length: ROOMS }, (_, i) => roomLoop(i)))
  clearInterval(sampler)
  await new Promise((r) => setTimeout(r, 2000)) // laisse le serveur traiter les dernières déconnexions
  const after = { rss: rssMb(), fds: fds(), conns: connsToServer() }
  const lat = allBots.flatMap((b) => b.latencies)
  const codes = new Map<string, number>()
  for (const b of allBots) for (const [k, v] of b.codes) codes.set(k, (codes.get(k) ?? 0) + v)
  const health = sh(`curl -s ${url}/healthz`)
  const rows = sh(`sqlite3 ${dbPath} "select status, count(*) from rooms group by status" 2>/dev/null`)
  console.log(
    JSON.stringify(
      {
        config: { salons_simultanes: ROOMS, joueurs_par_salon: 4, minutes: MINUTES, objectif: TARGET, churn: CHURN },
        duree_reelle_s: Math.round((Date.now() - t0) / 1000),
        parties_terminees: stats.games,
        donnes_jouees: stats.rounds,
        deconnexions_reprises: stats.resumes,
        commandes: lat.length,
        latence_ack_ms: {
          p50: +percentile(lat, 50).toFixed(2),
          p95: +percentile(lat, 95).toFixed(2),
          p99: +percentile(lat, 99).toFixed(2),
          max: +lat.reduce((m, x) => (x > m ? x : m), 0).toFixed(1),
        },
        refus_par_code: Object.fromEntries(codes),
        anomalies: stats.unexpected,
        serveur: {
          erreurs_log: serverErrors,
          avertissements_log: serverWarn,
          extraits: serverLines.slice(0, 5),
          sante: health,
        },
        memoire_rss_mo: samples.map((s) => `${s.t}s:${s.rss.toFixed(0)}`),
        descripteurs_ouverts: samples.map((s) => `${s.t}s:${s.fds}`),
        connexions_tcp: samples.map((s) => `${s.t}s:${s.conns}`),
        apres_arret_des_clients: after,
        salons_en_base: rows,
      },
      null,
      1,
    ),
  )
}

main()
  .catch((e) => {
    console.error('ÉCHEC', e)
    process.exitCode = 1
  })
  .finally(() => {
    server.kill('SIGTERM')
    setTimeout(() => {
      rmSync(dir, { recursive: true, force: true })
      process.exit()
    }, 1500)
  })
