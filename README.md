# Nos parties de cartes

Compteur de points pour la **coinche**, la **belote** et le **tarot**, pensé pour le téléphone. Ce n'est pas un jeu numérique : on joue avec de vraies cartes et on saisit les résultats des donnes.

Vue 3 (Composition API, `<script setup>`) · TypeScript strict · Vite · Pinia · Vue Router (mode hash) · Tailwind CSS · IndexedDB · Vitest · PWA (hors connexion et installation).

## Installation et commandes

```bash
npm install
npm run dev        # serveur de développement
npm test           # tests (moteur de calcul, parties, statistiques, persistance, import)
npm run typecheck  # contrôle TypeScript (vue-tsc)
npm run build      # contrôle TypeScript puis compilation dans dist/
npm run preview    # sert dist/ (nécessaire pour tester le mode hors connexion)
```

## Organisation du code

| Dossier                         | Rôle                                                                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/`                   | Règles et calculs **purs** (sans Vue ni stockage) : `coinche.ts`, `belote.ts`, `tarot.ts`, `rounding.ts`, `game.ts` (progression, réserves, fin de partie), `stats.ts` (classements recalculés à partir des donnes), `describe.ts` |
| `src/db/`                       | `idb.ts` (IndexedDB), `backup.ts` (format versionné, migrations, validation, fusion)                                                                                                                                               |
| `src/stores/data.ts`            | Store Pinia : joueurs, équipes, soirées, parties, brouillons, préférences, annulation                                                                                                                                              |
| `src/forms.ts`                  | Conversion formulaire (textes) ↔ entrées du moteur                                                                                                                                                                                 |
| `src/views/`, `src/components/` | Écrans et composants                                                                                                                                                                                                               |

Les scores, réserves, résultats et statistiques ne sont **jamais stockés** : ils sont recalculés à partir des donnes. Une correction, une suppression ou une réouverture met donc tout à jour sans compteur qui diverge.

## Coinche en ligne (en développement)

Coinche à quatre à distance, en salon privé : voir [docs/ONLINE.md](docs/ONLINE.md). Non déployée ; invisible sur GitHub Pages tant qu'aucun serveur n'est configuré. `npm run dev:online` pour l'essayer en local.

## Règles et ordre des calculs

Voir [docs/REGLES.md](docs/REGLES.md).

## Choix par défaut (non définis par vos règles)

- Égalité finale en coinche/belote : on poursuit avec une donne supplémentaire. Une réserve de litige non résolue empêche aussi la fin de partie.
- Contrat de coinche : multiple de 10 entre 80 et 160, ou capot annoncé.
- Belote : l'équipe ayant la plus forte annonce est **choisie par l'utilisateur** (équipe A, B ou égalité) ; pas de départage automatique. Si une seule équipe a des annonces, elle est retenue d'office.
- Donne passée : enregistrée sans point, le donneur tourne ; visible dans l'historique.
- Les donneurs de donnes déjà enregistrées ne bougent jamais seuls ; le bouton « Recalculer les donneurs » les remet explicitement dans l'ordre.
- Tarot : un joueur ne peut recevoir qu'une prime d'un même type, une seule poignée et un seul chelem par donne.
- Seules les parties **terminées** alimentent classements et statistiques (prises comprises).
- Le bilan « tous jeux » ne montre que participations, victoires et taux, jamais de scores bruts.
- Annulation : mémoire de la session uniquement (perdue au rechargement).
- Fusion d'équipes à l'import : une équipe importée ayant les mêmes membres qu'une équipe existante n'est pas dupliquée.

## Stockage local et hors connexion — limites

- Tout reste dans **ce navigateur, sur cet appareil** (IndexedDB) : pas de compte, de serveur ni de synchronisation.
- Effacer les données du navigateur (ou certains modes de navigation privée) peut effacer l'historique. **Exportez régulièrement** (Paramètres → Exporter).
- Une sauvegarde qui échoue affiche une erreur ; aucun succès n'est annoncé sans confirmation d'IndexedDB.
- Le fonctionnement hors connexion nécessite un **premier chargement réussi** en ligne (service worker) et un hébergement en HTTPS (ou `localhost`).
- Installation sur l'écran d'accueil : proposée par le navigateur quand il le permet (iPhone : Partager → Sur l'écran d'accueil).
- L'import par fusion est écrit en une seule transaction : en cas d'échec rien n'est modifié.

## Vérifications effectuées

Voir la fin de ce fichier mise à jour lors de la livraison : tests (`npm test`), `npm run typecheck`, `npm run build`, et un parcours automatisé dans Chrome (viewport 375 px) : création de joueurs et d'équipes, partie de coinche, saisie d'une donne, rechargement, absence de défilement horizontal, chargement hors connexion, tarot à six.

## Déploiement, CI et PWA

- Site : https://vfuster66.github.io/nos_parties_de_cartes/ (GitHub Pages, source « GitHub Actions »).
- Workflow `.github/workflows/ci.yml` : jobs lint, formatage, TypeScript, tests, build en parallèle ; le job `deploy` ne s'exécute que sur `main` (push ou lancement manuel), après réussite de tous les contrôles, et publie l'artefact construit sur ce même commit. Aucune pull request n'est déployée. Aucun secret n'est utilisé.
- Commandes : `npm run lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test:run`, `build`.
- Publier : fusionner une pull request vers `main` (ou relancer le workflow depuis l'onglet Actions sur `main`).
- Le `base` de Vite et le manifeste viennent de `BASE_PATH` (défini par le workflow à `/<nom du dépôt>/`) : aucun nom de compte n'est codé en dur. En local, `base` vaut `/`.
- Routeur en **mode hash** (`#/partie/...`) : GitHub Pages ne réécrit pas les URL, les liens directs et rechargements fonctionnent ainsi sans contournement.
- Mises à jour de la PWA : une bannière « Nouvelle version disponible » propose de recharger ; rien n'est rechargé automatiquement pendant une saisie. Les brouillons sont enregistrés dans IndexedDB.
- Hors connexion : après une première visite en ligne, le service worker met l'application en cache.
- **Données locales ≠ site publié** : IndexedDB est propre à chaque origine. Les données de `localhost` ne sont pas transférées vers `github.io` : exportez-les depuis la version locale (Paramètres → Exporter), puis importez le fichier sur le site publié.
- Dependabot (`.github/dependabot.yml`) propose chaque semaine des mises à jour groupées (npm et Actions), sans fusion automatique.
