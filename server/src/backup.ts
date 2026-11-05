// Sauvegarde cohérente : npm run server:backup -- <fichier de destination>
// Utilise l'API de sauvegarde en ligne de SQLite : sûre même pendant que le serveur écrit.
import { loadConfig } from './config'
import { Store } from './store'

const dest = process.argv[2]
if (!dest) {
  console.error('Usage : backup <fichier de destination>')
  process.exit(2)
}
const store = new Store(loadConfig().dbPath)
store
  .backup(dest)
  .then(() => {
    console.log(`Sauvegarde écrite : ${dest}`)
    store.close()
  })
  .catch((e: Error) => {
    console.error(`Échec de la sauvegarde : ${e.message}`)
    process.exit(1)
  })
