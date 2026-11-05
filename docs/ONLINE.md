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
npm run test:review    # revue visuelle Chromium + WebKit, 3 largeurs (captures dans test-results/review)
npm run soak           # endurance (après build:server) : npm run soak -- --rooms 12 --minutes 10
npm run typecheck && npm run lint && npm run format:check
npm run build:all      # client (dist/) + serveur (server/dist/)
```

`npx playwright install chromium` si le navigateur de test manque.

### Essayer à quatre sur un Mac

1. `npm run dev:online`, ouvrir `http://localhost:5173` → « Jouer en ligne » → créer un salon.
2. Dans 3 autres fenêtres de **navigation privée** ou profils distincts (le jeton est dans le `localStorage`), ouvrir le lien partagé.

### Depuis un téléphone sur le même réseau

1. Mac et téléphone sur le même Wi-Fi. Trouver l'IP du Mac : `ipconfig getifaddr en0`.
2. `npm run dev:lan` (Vite en `--host`, serveur de jeu accepte les origines du réseau privé ; testé : 4 joueurs en WebSocket via l'IP du Mac, port 3001 inaccessible depuis le réseau, origine externe refusée). Le serveur de jeu reste lié à 127.0.0.1 : seul Vite est exposé, et proxifie `/socket.io`.
3. Sur le téléphone : `http://<IP-du-Mac>:5173`. À n'utiliser que sur un réseau de confiance ; ne jamais rediriger ce port vers Internet.

## Préparation VPS (rien n'est déployé)

Choix : **Docker Compose + Caddy** (HTTPS automatique, WebSocket, un seul fichier) plutôt que systemd (qui imposerait Node, la compilation native de `better-sqlite3` et un reverse proxy à installer à la main).

- `Dockerfile`, `deploy/docker-compose.yml`, `deploy/Caddyfile`. `DOMAIN` et `ALLOWED_ORIGINS` requis. `restart: unless-stopped`, arrêt propre (SIGTERM, 15 s), volume persistant `/data`, santé `GET /healthz` (`{"status":"ok"}`), rotation des logs (json-file 10 Mo × 5).
- Client : construire avec `VITE_ONLINE_SERVER_URL=https://jeu.exemple.fr` (ou `same-origin` si servi par le même hôte) et `BASE_PATH` adapté ; ajouter l'origine du client dans `ALLOWED_ORIGINS`.
- **Essai local de la pile sans domaine** (testé sur Docker Desktop, Mac) : Caddy en HTTP sur `127.0.0.1:18080`, volumes isolés par le nom de projet, base habituelle jamais touchée :
  ```bash
  export DOMAIN=localhost ALLOWED_ORIGINS=http://127.0.0.1:18080
  C="-p coinche-local -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml"
  docker compose $C build --no-cache game && docker compose $C up -d
  curl http://127.0.0.1:18080/healthz          # {"status":"ok"}
  docker compose $C down -v                    # nettoie l'essai (volumes de l'essai seulement)
  ```
  Cela valide l'image, le WebSocket derrière Caddy, les origines, les volumes, la recréation des conteneurs et l'arrêt propre. Cela **ne valide pas** un certificat public, Let's Encrypt, un DNS ni un pare-feu.
- **Sauvegarde cohérente** (API de sauvegarde SQLite : inclut le contenu du journal WAL, sûre pendant les écritures) :
  `docker compose -f deploy/docker-compose.yml exec game node server/dist/backup.mjs /data/backup-$(date +%F).sqlite`, puis `docker cp <conteneur>:/data/backup-….sqlite .` pour la sortir du serveur. Le fichier est en mode 600 (il contient des empreintes de jetons) : le chiffrer ou le stocker de façon privée.
- **Restauration** — procédure testée (partie sauvegardée au milieu d'un pli, puis poursuivie, environnement arrêté, restauration dans un volume neuf, redémarrage, reconnexion des quatre clients : mains, phase, scores, identités identiques à l'instant de la sauvegarde) :
  ```bash
  docker volume create <projet>_coinche-data
  docker run --rm --user node -v <projet>_coinche-data:/data -v "$PWD/sauvegardes":/in:ro \
    --entrypoint sh <image-du-jeu> -c 'cp /in/backup-….sqlite /data/coinche.sqlite'
  docker compose -p <projet> -f deploy/docker-compose.yml up -d     # aucun -wal/-shm à copier : la sauvegarde est autonome
  ```
  Ne jamais copier à chaud `coinche.sqlite` seul (le WAL contient des écritures récentes) : utiliser la commande de sauvegarde. Restaurer sur place (arrêter, remplacer le fichier, supprimer `-wal`/`-shm`) n'a pas été rejoué à part.
- Droits : le processus tourne en utilisateur `node` (uid 1000, non root), `umask 077` ; `/data` en 700, fichiers de base et sauvegardes en 600. Aucun secret dans l'image (ni `.env`, ni base, ni jeton ; le jeu n'a aucun secret statique).
- Derrière Caddy, `TRUST_PROXY=1` : l'adresse client vient de `X-Forwarded-For` posé par Caddy, qui **écrase** celui du client (vérifié : un en-tête usurpé ne contourne pas la limite de créations). Ne jamais publier le port 3001.

## Vérifications automatiques réalisées (essai local)

- **CI GitHub** : lint, format, TypeScript (client + serveur), Vitest, parcours Playwright à quatre navigateurs, build serveur, build de production.
- **Vitest** : règles, scores (dont `allowFullPoints`), serveur. Le serveur est testé avec de vrais clients Socket.IO : confidentialité de tout ce qui est reçu (états, accusés, erreurs, reconnexion, historique), origines (WebSocket **et** polling HTTP, `Origin: null`), schémas et limites, déconnexions à chaque phase, redémarrage à chaque phase, échec d'écriture SQLite, remplacement de connexion.
- **Endurance** (`npm run build:server && npm run soak -- --rooms 12 --minutes 10`) : vrai serveur en processus séparé, joueurs automatiques qui n'utilisent que les actions annoncées par le serveur, déconnexions/reprises aléatoires, fenêtres de surcoinche laissées expirer. Mesure effectuée sur un Mac, **sans extrapolation de capacité** : 12 salons simultanés (48 connexions), 10 min, 5 036 parties, 10 480 donnes, 433 480 commandes, 1 079 reprises après déconnexion : 0 erreur serveur, 0 anomalie de score, latence d'accusé p50 0,6 ms / p99 2,8 ms / max 191 ms, descripteurs stables, 0 connexion résiduelle à l'arrêt des clients. Une fuite a été trouvée (salons terminés conservés en mémoire : RSS 107 → 280 Mo) et corrigée ; ré-essai 5 min / 2 523 parties : RSS stable ≈ 100 Mo.
- **Revue visuelle** (`npm run test:review`, captures dans `test-results/review/`) : Chromium et WebKit automatisé à 375, 390 et 1100 px, quatre contextes, pseudos de 20 caractères, hauteur réduite pour le clavier virtuel, commandes sortantes perdues pour vérifier qu'aucune carte n'est retirée sans validation du serveur et que l'écran ne reste pas bloqué. **WebKit automatisé ne remplace pas Safari sur un vrai iPhone.**

## Limites connues acceptables pour un essai

- Perte du jeton = perte de la place (pas de récupération). Seule issue : l'hôte ferme le salon et on recommence.
- Une partie en cours dont les joueurs ne reviennent jamais reste indéfiniment en base (seules les parties terminées/abandonnées sont purgées : 30 j ; salons d'attente : 2 j).
- Limites par adresse IP : derrière le proxy Vite du mode LAN, tous les téléphones partagent l'adresse 127.0.0.1 (20 créations de salon/h, 10 codes faux/10 min pour l'ensemble) — suffisant pour un essai.
- Sans en-tête `Origin` (client non navigateur), la connexion est acceptée : seules les actions avec identité (jeton) sont possibles, et les limites s'appliquent.
- Pseudos tronqués sur la table à 375 px (le nom complet du preneur reste affiché au-dessus).
- Bannière « Rebelote ! » : reste affichée ~3,5 s, peut recouvrir un instant le dernier pli.
- Le parcours de revue WebKit à 1100 px (premier test) s'est bloqué de façon intermittente dans le pilote d'automatisation (clic « S'asseoir » sans effet) ; non reproduit à 375/390 px ni sous Chromium, cause non établie.

## Points restant ouverts avant Internet

Récupération d'une place sans jeton ; association des résultats aux joueurs locaux ; revue de sécurité externe ; domaine, DNS et certificat réels (Let's Encrypt non testé) ; validation Docker sur un hôte Linux (testé seulement sur Docker Desktop/Mac) ; test sur vrais téléphones (Safari iOS, Chrome Android) ; sauvegardes automatisées hors du serveur ; surveillance de l'espace disque.
