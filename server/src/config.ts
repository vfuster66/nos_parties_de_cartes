export interface ServerConfig {
  port: number
  /** Par défaut 127.0.0.1 : le serveur n'est pas exposé hors de la machine sans choix explicite. */
  host: string
  dbPath: string
  allowedOrigins: string[]
  /** Développement sur téléphone : accepte aussi les origines du réseau local (192.168.x.x, 10.x.x.x, 172.16-31.x.x). */
  allowPrivateNetworkOrigins: boolean
  /** Derrière un reverse proxy de confiance : lit l'adresse client dans X-Forwarded-For. */
  trustProxy: boolean
}

const flag = (v: string | undefined): boolean => v === '1' || v === 'true'

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 3001)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT invalide : ${env.PORT}`)
  return {
    port,
    host: env.HOST ?? '127.0.0.1',
    dbPath: env.DB_PATH ?? './data/coinche.sqlite',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean),
    allowPrivateNetworkOrigins: flag(env.ALLOW_PRIVATE_NETWORK_ORIGINS),
    trustProxy: flag(env.TRUST_PROXY),
  }
}

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/

export function isOriginAllowed(origin: string | undefined, cfg: ServerConfig): boolean {
  if (!origin) return true // clients non navigateurs (les navigateurs envoient toujours Origin)
  const o = origin.replace(/\/$/, '')
  if (cfg.allowedOrigins.includes(o)) return true
  if (!cfg.allowPrivateNetworkOrigins) return false
  try {
    const u = new URL(o)
    return (u.protocol === 'http:' || u.protocol === 'https:') && PRIVATE_HOST.test(u.hostname)
  } catch {
    return false
  }
}
