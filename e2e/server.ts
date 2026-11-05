// Serveur de test pour Playwright : mélange DÉTERMINISTE (reproductible) et base en mémoire.
// Ce fichier n'est ni compilé dans le serveur de production ni démarrable avec NODE_ENV=production.
import { seededRandomInt } from '../shared/coinche/testkit'
import { createApp } from '../server/src/app'
import { loadConfig } from '../server/src/config'

if (process.env.NODE_ENV === 'production') throw new Error('Serveur de test interdit en production.')

const port = Number(process.env.E2E_SERVER_PORT ?? 3101)
const app = createApp({
  config: loadConfig({
    PORT: String(port),
    HOST: '127.0.0.1',
    DB_PATH: ':memory:',
    ALLOWED_ORIGINS: 'http://127.0.0.1:5199,http://localhost:5199',
  }),
  randomInt: seededRandomInt(Number(process.env.E2E_SEED ?? 2024)),
})
void app.listen().then((p) => console.log(`serveur e2e prêt sur ${p}`))
