import { loadConfig } from './config'
import { createApp } from './app'
import { createLogger } from './logger'

// Fichiers de base et sauvegardes lisibles par le seul compte du service (empreintes de jetons à l'intérieur).
process.umask(0o077)

const config = loadConfig()
const log = createLogger()
const app = createApp({ config, logger: log })

app.listen().then(
  (port) => log.info('serveur démarré', { host: config.host, port }),
  (e: Error) => {
    log.error('démarrage impossible', { message: e.message })
    process.exit(1)
  },
)

let closing = false
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    if (closing) return
    closing = true
    log.info('arrêt demandé', { signal: sig })
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    )
    setTimeout(() => process.exit(1), 8000).unref()
  })
}
