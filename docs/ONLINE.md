# Coinche en ligne

Fonctionnalité **en cours de développement, testée uniquement en local**. Elle n'est pas déployée : le site GitHub Pages ne la propose pas (aucun serveur configuré → l'entrée « Jouer en ligne » est masquée). Le compteur local est inchangé.

## Architecture

- `shared/coinche/` : règles pures partagées (cartes, coups autorisés, enchères, belote, scoring, vues filtrées). Le scoring réutilise `src/engine/coinche.ts` (`scoreCoinche`) ; seul ajout : l'option `allowFullPoints` (162 points de plis sans capot possibles en ligne, jamais déduit comme capot).
- `shared/protocol.ts` : schémas Zod des commandes (validation à l'exécution côté serveur).
- `server/src/` : Node + TypeScript, Socket.IO, SQLite (`better-sqlite3`). Le serveur est seul maître : participants, mains, enchères, délais, cartes autorisées, plis, belote, scores, fin de partie.
- `src/online/`, `src/views/Online*.vue` : client Vue. Il envoie des **intentions** et n'affiche que des vues filtrées.
- Traitement d'une commande : synchrone (validation → application → écriture SQLite → diffusion) donc strictement séquentiel par salon.

## Protocole (Socket.IO)

Client → serveur (avec accusé) : `room:create {nickname}`, `room:join {code, nickname}`, `room:resume {roomId, participantId, token}`, `command {type, commandId, expectedVersion?, …}`.
Serveur → client : `state` (vue filtrée complète), `replaced`, `kicked`, `left`.
Commandes : `takeSeat leaveSeat assignSeat kick setReady leaveRoom configure start abandon bid capot pass coinche surcoinche acceptCoinche playCard nextRound`.

- `commandId` : un doublon reçoit la même réponse sans second effet.
- `expectedVersion` : obligatoire pour les commandes de jeu ; version périmée → `stale`. `coinche` vise en plus `contractRef` (index de l'enchère) → `stale_contract` si le contrat a changé.
- Limites : 10 Ko par message, 30 commandes en rafale puis 10/s par connexion, 10 recherches de code ratées / 10 min / IP, 20 créations / h / IP.
- Origines autorisées : `ALLOWED_ORIGINS` (les navigateurs envoient toujours `Origin`).

## Confidentialité

Les vues sont construites champ par champ (`shared/coinche/views.ts`) : sa main, les cartes jouées, les nombres de cartes des autres, ses actions autorisées. Jamais : mains adverses, belote non annoncée, jetons, état interne. Les jetons sont stockés hachés (SHA-256) dans une table distincte de l'état. Les logs ne contiennent ni jeton ni carte. Le paquet est entièrement distribué : il n'existe pas de « paquet restant ».

## Identité sans compte — limites

À la création/entrée, le serveur remet un `participantId` et un jeton secret (32 octets aléatoires), conservés dans le `localStorage` de l'appareil (hors export JSON du compteur). Le lien partagé ne contient que le code du salon. **Perdre le jeton (données du navigateur effacées, autre appareil) = perdre la place** : on ne reprend pas une place avec un pseudo. Pas de procédure de récupération dans cette version (point ouvert : l'hôte pourrait libérer une place en lobby uniquement). Une seule connexion agit par participant : la plus récente remplace l'ancienne, qui est fermée.

## Choix par défaut

- Aucun délai de jeu ; seule la surcoinche dure 10 s.
- **Pause** : dès qu'une personne assise est déconnectée, toutes les actions de jeu sont refusées. Rien ne se joue à sa place, aucune défaite automatique. Le temps de surcoinche restant est suspendu et repris sans repartir à 10 s.
- Abandon : réservé à l'hôte, avec confirmation ; aucune victoire attribuée ; permis même en pause.
- Hôte déconnecté → rôle transféré à un participant connecté (sans pouvoir sur les cartes).
- Pseudo unique par salon (insensible à la casse). 4 personnes maximum, pas de spectateur.
- Redémarrage serveur : parties rechargées en pause ; arrêt propre (SIGTERM) suspend les délais ; en cas de crash, un battement de cœur toutes les 5 s limite l'erreur à ≤ 5 s.
- Quatre passes : donne consignée « passée » (visible dans l'historique), nouvelle distribution automatique, donneur suivant.
- Résultats locaux : stockés séparément (`localStorage`), distingués du compteur, dédoublonnés par identifiant de salon ; **non** associés aux joueurs/statistiques locaux (association explicite non implémentée — point ouvert).

## Règles personnalisées

Voir [REGLES.md](REGLES.md) pour le scoring. Cartes autorisées : fournir ; hors atout, pas d'obligation de monter ; partenaire maître = défausse libre ; adversaire maître : couper, surcouper si le pli est coupé, sinon libre (pas de sous-coupe forcée) ; à l'atout : fournir et monter même sur le partenaire. Entame et première parole : à gauche du donneur. Belote-rebelote automatique (20 pts, non multipliée), révélée à la première carte jouée.

## Commandes locales

```bash
npm install
npm run dev:online     # serveur (127.0.0.1:3001) + client (http://localhost:5173) ensemble
npm run dev:server     # serveur seul     |  npm run dev  # client seul (compteur uniquement)
npm run test:run       # règles + serveur (Vitest)
npm run test:e2e       # 4 navigateurs Playwright, viewport téléphone (serveur déterministe de test)
npm run typecheck && npm run lint && npm run format:check
npm run build:all      # client (dist/) + serveur (server/dist/)
```

`npx playwright install chromium` si le navigateur de test manque.

### Essayer à quatre sur un Mac

1. `npm run dev:online`, ouvrir `http://localhost:5173` → « Jouer en ligne » → créer un salon.
2. Dans 3 autres fenêtres de **navigation privée** ou profils distincts (le jeton est dans le `localStorage`), ouvrir le lien partagé.

### Depuis un téléphone sur le même réseau

1. Mac et téléphone sur le même Wi-Fi. Trouver l'IP du Mac : `ipconfig getifaddr en0`.
2. `npm run dev:lan` (Vite en `--host`, serveur de jeu accepte les origines du réseau privé). Le serveur de jeu reste lié à 127.0.0.1 : seul Vite est exposé, et proxifie `/socket.io`.
3. Sur le téléphone : `http://<IP-du-Mac>:5173`. À n'utiliser que sur un réseau de confiance ; ne jamais rediriger ce port vers Internet.

## Préparation VPS (rien n'est déployé)

Choix : **Docker Compose + Caddy** (HTTPS automatique, WebSocket, un seul fichier) plutôt que systemd (qui imposerait Node, la compilation native de `better-sqlite3` et un reverse proxy à installer à la main).

- `Dockerfile`, `deploy/docker-compose.yml`, `deploy/Caddyfile`. `DOMAIN` et `ALLOWED_ORIGINS` requis. `restart: unless-stopped`, arrêt propre (SIGTERM, 15 s), volume persistant `/data`, santé `GET /healthz` (`{"status":"ok"}`), rotation des logs (json-file 10 Mo × 5).
- Client : construire avec `VITE_ONLINE_SERVER_URL=https://jeu.exemple.fr` (ou `same-origin` si servi par le même hôte) et `BASE_PATH` adapté ; ajouter l'origine du client dans `ALLOWED_ORIGINS`.
- **Sauvegarde cohérente** (API de sauvegarde SQLite, sûre pendant les écritures) :
  `docker compose -f deploy/docker-compose.yml exec game node server/dist/backup.mjs /data/backup-$(date +%F).sqlite` puis copier le fichier hors du serveur.
- **Restauration** : `docker compose … stop game`, remplacer `/data/coinche.sqlite` par la sauvegarde, supprimer `/data/coinche.sqlite-wal` et `-shm`, `docker compose … start game`.

## Points restant ouverts avant Internet

Test de charge et durée ; récupération d'une place sans jeton ; association des résultats aux joueurs locaux ; revue de sécurité externe ; configuration CORS/origines réelle ; validation Docker sur un hôte Linux ; politique de rétention (purge actuelle : 30 j parties finies, 2 j salons d'attente) ; test sur vrais téléphones.
