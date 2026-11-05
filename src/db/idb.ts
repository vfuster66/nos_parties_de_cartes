// Mince couche IndexedDB. Un magasin d'objets par collection ; clé = `id` (ou `key`).
export const STORES = ['players', 'teams', 'evenings', 'games', 'drafts', 'meta'] as const
export type StoreName = (typeof STORES)[number]

const DB_NAME = 'nos-parties-de-cartes'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'drafts' ? 'key' : s === 'meta' ? 'key' : 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(new Error('Impossible d’ouvrir le stockage du navigateur (IndexedDB).'))
    }
    req.onblocked = () => reject(new Error('Le stockage du navigateur est bloqué par un autre onglet.'))
  })
  return dbPromise
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Échec de l’écriture.'))
    tx.onabort = () => reject(tx.error ?? new Error('Écriture annulée.'))
  })
}

const asPlain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const r = db.transaction(store, 'readonly').objectStore(store).getAll()
    r.onsuccess = () => resolve(r.result as T[])
    r.onerror = () => reject(r.error)
  })
}

export async function put(store: StoreName, value: unknown): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(asPlain(value))
  await done(tx)
}

export async function remove(store: StoreName, key: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await done(tx)
}

/** Plusieurs écritures/suppressions dans une seule transaction (atomique). */
export async function batch(ops: { store: StoreName; put?: unknown; remove?: string }[]): Promise<void> {
  const db = await openDb()
  const names = [...new Set(ops.map((o) => o.store))]
  const tx = db.transaction(names, 'readwrite')
  for (const o of ops) {
    const os = tx.objectStore(o.store)
    if (o.remove !== undefined) os.delete(o.remove)
    else os.put(asPlain(o.put))
  }
  await done(tx)
}

/** Remplace tout le contenu des collections données, atomiquement. */
export async function replaceAll(data: Partial<Record<StoreName, unknown[]>>): Promise<void> {
  const db = await openDb()
  const names = Object.keys(data) as StoreName[]
  const tx = db.transaction(names, 'readwrite')
  for (const n of names) {
    const os = tx.objectStore(n)
    os.clear()
    for (const v of data[n] ?? []) os.put(asPlain(v))
  }
  await done(tx)
}
