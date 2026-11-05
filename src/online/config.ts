// Le jeu en ligne dépend d'un serveur : il n'est proposé que si VITE_ONLINE_SERVER_URL est défini au build.
//  - une URL (https://jeu.exemple.fr) : serveur dédié, d'origine autorisée côté serveur ;
//  - « same-origin » : le serveur est derrière le même hôte (proxy Vite en développement, reverse proxy en production).
// Sans valeur (cas du site GitHub Pages actuel), aucune entrée « Jouer en ligne » n'est affichée.
const raw = (import.meta.env.VITE_ONLINE_SERVER_URL as string | undefined)?.trim()

export const onlineServerUrl: string | null = !raw ? null : raw === 'same-origin' ? '' : raw.replace(/\/$/, '')
export const onlineEnabled: boolean = onlineServerUrl !== null
