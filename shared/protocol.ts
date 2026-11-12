// Protocole client ↔ serveur. Les schémas Zod valident TOUT ce que le serveur reçoit.
import { z } from 'zod'

const seat = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
const suit = z.enum(['pique', 'coeur', 'trefle', 'carreau'])
const rank = z.enum(['7', '8', '9', '10', 'V', 'D', 'R', 'A'])
const card = z.object({ suit, rank }).strict()
const tarotCard = z.custom<import('./tarot/cards').TarotCard>(
  (value) =>
    typeof value === 'string' &&
    /^(excuse|atout:([1-9]|1[0-9]|2[01])|(pique|coeur|trefle|carreau):([1-9]|10|V|C|D|R))$/.test(value),
)
const id = z.string().min(1).max(64)

/** Texte affiché tel quel (jamais interprété comme HTML) : sans caractères de contrôle ni de mise en forme. */
export const cleanText = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((s) =>
      s
        .normalize('NFC')
        .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .refine((s) => [...s].length >= 1 && [...s].length <= max, { message: `1 à ${max} caractères` })

export const nicknameSchema = cleanText(20)

const base = { commandId: id, expectedVersion: z.number().int().nonnegative().optional() }
const cmd = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), ...base, ...shape }).strict()

export const commandSchema = z.discriminatedUnion('type', [
  // Salon
  cmd('takeSeat', { seat }),
  cmd('leaveSeat', {}),
  cmd('assignSeat', { participantId: id, seat: seat.nullable() }),
  cmd('fillBots', {}),
  cmd('kick', { participantId: id }),
  cmd('setReady', { ready: z.boolean() }),
  cmd('leaveRoom', {}),
  cmd('configure', {
    gameName: cleanText(40).optional(),
    teamNames: z.tuple([cleanText(20), cleanText(20)]).optional(),
    rounding: z.enum(['rounded', 'exact']).optional(),
    target: z
      .number()
      .int()
      .min(100)
      .max(20000)
      .refine((n) => n % 10 === 0, 'Multiple de 10')
      .optional(),
    tarotEndMode: z.enum(['free', 'threshold']).optional(),
    firstDealer: z.union([z.literal('random'), seat]).optional(),
  }),
  cmd('start', {}),
  cmd('abandon', { confirm: z.literal(true) }),
  // Jeu
  cmd('bid', { value: z.number().int(), suit }),
  cmd('capot', { suit }),
  cmd('pass', {}),
  cmd('take', { suit }),
  cmd('tarotBid', { contract: z.enum(['pousse', 'garde', 'gardeSans', 'gardeContre']) }),
  cmd('tarotCall', { card: tarotCard }),
  cmd('tarotDiscard', { cards: z.union([z.array(tarotCard).length(3), z.array(tarotCard).length(6)]) }),
  cmd('tarotDeclare', {
    types: z
      .array(
        z.enum([
          'poigneSimple',
          'poigneDouble',
          'poigneTriple',
          'blancTete',
          'blancAtout',
          'petitChelem',
          'grandChelem',
        ]),
      )
      .max(4),
    shown: z.array(tarotCard).max(18),
  }),
  cmd('tarotPlay', { card: tarotCard }),
  cmd('tarotFinish', {}),
  cmd('coinche', { contractRef: z.number().int().nonnegative() }),
  cmd('surcoinche', {}),
  cmd('acceptCoinche', {}),
  cmd('playCard', { card }),
  cmd('nextRound', {}),
])
export type Command = z.infer<typeof commandSchema>
export type CommandType = Command['type']

/** Commandes qui doivent viser la version exacte de l'état qu'a vu le joueur. */
export const VERSIONED: ReadonlySet<CommandType> = new Set([
  'bid',
  'capot',
  'pass',
  'take',
  'tarotBid',
  'tarotDiscard',
  'tarotCall',
  'tarotDeclare',
  'tarotPlay',
  'tarotFinish',
  'coinche',
  'surcoinche',
  'acceptCoinche',
  'playCard',
  'nextRound',
])

export const createRoomSchema = z
  .object({
    nickname: nicknameSchema,
    game: z.enum(['coinche', 'belote', 'belote-annonces', 'tarot', 'tarot-3', 'tarot-5', 'tarot-6']).optional(),
  })
  .strict()
export const joinRoomSchema = z.object({ code: z.string().max(32), nickname: nicknameSchema }).strict()
export const resumeSchema = z.object({ roomId: id, participantId: id, token: z.string().min(16).max(128) }).strict()
export const lookupSchema = z.object({ code: z.string().max(32) }).strict()

/** Messages d'accusé de réception (ack) Socket.IO. */
export type Ack<T = object> = ({ ok: true } & T) | { ok: false; code: string; message: string }
export interface SessionGrant {
  roomId: string
  code: string
  participantId: string
  /** Secret : affiché une seule fois, conservé sur l'appareil, jamais dans un lien. */
  token: string
}

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 8
/** Normalise un code saisi (majuscules, sans séparateur, 0→O, 1→I… évités par l'alphabet). */
export const normalizeCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
export const formatCode = (c: string): string => `${c.slice(0, 4)}-${c.slice(4)}`
