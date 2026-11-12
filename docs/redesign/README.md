# Refonte UI/UX — audit, décisions, vérifications

Captures « avant » : `avant/` (état de `main` à `e555ef2`). « Après » : `apres/` (390 px), `apres-large/` (1100 px), `apres-webkit/` (WebKit automatisé).
Toutes les captures sont produites par `npx tsx tools/shots.ts <dossier> [largeur] [chromium|webkit]` avec des données fictives
(serveur de test déterministe, joueurs automatiques qui n'utilisent que les actions annoncées comme autorisées).

## Audit (avant)

### Empêchait ou freinait réellement de jouer

| Écran                          | Ce qui gênait                                                                                                                                                   | Quand                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Tarot (toutes tailles) — table | Aucune table : pli, scores et phase en listes de texte ; le joueur dont c'est le tour n'était qu'une phrase                                                     | Toute la donne         |
| Tarot — main                   | Cartes = boutons de texte « Atout 20 », « 8♠ » ; 24 cartes (à 3) ou 15 cartes (à 5/6) illisibles à distinguer, jouées au premier toucher (risque de faux geste) | Jeu des cartes         |
| Tarot — appel, écart, poignée  | Cases à cocher et boutons sans cartes ; pas d'indication de ce qu'il faut toucher                                                                               | Appel, écart, annonces |
| Coinche — table                | Étiquettes « Donneur » / « Preneur » coupées hors de l'écran (375 px) ; pli recouvert par la bannière « Belote ! » plein centre                                 | Pli en cours           |
| Coinche — enchères             | Main sous le panneau d'enchères : il fallait défiler pour voir ses cartes en enchérissant                                                                       | Enchères               |
| Salon                          | 4 sections empilées (≈ 2 000 px) ; le bouton « Lancer » en bas, sans dire ce qui manque ; réglages ouverts en permanence                                        | Avant le lancement     |
| Compteur — saisie d'une donne  | 8 à 10 listes déroulantes et champs ; le preneur, l'atout et le contrat passaient par des sélecteurs natifs                                                     | Chaque donne           |
| Connexion perdue               | Message en haut de la table seulement, sans dire que la place est conservée ; aucune confirmation au retour                                                     | Coupure Wi-Fi          |

### Ralentissaient

- Accueil : 6 boutons de même poids, deux usages sans hiérarchie ; reprise d'un salon cachée dans « Jouer en ligne ».
- Saisie : aperçu du calcul complet affiché en permanence (long), résultat utile (points par camp) noyé.
- Scores et historique de la table en bas de page (défilement) ; abandon à côté de « Dernier pli ».

### Présentation

- Palette teal/blanc générique, cartes sans hiérarchie (symbole 24 px, rang 18 px), pas d'identité « jeu de cartes ».

## Direction visuelle

Tapis de jeu vert, papier crème, filet doré pour l'action attendue. Le vert remplace le « teal » via le thème Tailwind (un seul endroit : `src/style.css`).
Cartes dessinées en CSS (indice en coin + grand symbole, tailles en unités de conteneur : la même carte sert en main de 24 cartes et au centre du pli) ;
couleurs rouge/noir conservées, atouts du tarot en bleu, Excuse en or. Aucun état n'est porté par la couleur seule (texte « ▶ à jouer », « ✓ Prêt », coche, etc.).

## Décisions d'UX

- **Accueil** : deux cartes d'usage (compter / jouer en ligne), chacune avec sa reprise (partie en cours / dernier salon de moins de 24 h).
- **Salon** : code et « Partager le lien » en tête ; places avec pastilles `Hôte`, `Hors ligne`, `✓ Prêt`/`… Pas prêt` ; compteur « 3/4 assis · 2/4 prêts » ;
  barre collante « Pour lancer : 1 place à prendre · 1 joueur pas prêt » avec « Je suis prêt » et « Lancer » ; règles repliées.
- **Table** (coinche, belote, tarot 3 à 6) : un composant commun `TableSeats` (ovale, moi en bas, pli posé vers son auteur, donneur au repos en pointillé).
  En-tête compact (scores, contrat) ; scores détaillés, historique des annonces et abandon dans la feuille « Scores » ; « Dernier pli » à côté de la bannière d'état.
- **Main** : composant commun `HandFan` (4, 6 ou 8 colonnes selon le nombre de cartes ; 24 cartes = 3 lignes de 8). Sélection puis bouton collant « Jouer … » (tarot compris).
  Pendant les enchères, la main est sur une seule ligne au-dessus des commandes.
- **Annonces de belote** : bandeau repliable sous la table, cartes des annonces retenues dessinées ; moment de révélation inchangé (serveur).
- **Compteur** : preneur et donneur en boutons, atout en gros symboles colorés, contrat en pastilles, résultat par camp en direct + détail du calcul repliable,
  « Saisir une donne » collant sur le tableau des scores, barres de progression vers l'objectif.
- **États difficiles** : bandeau collant « Connexion perdue — votre place est gardée », boutons désactivés, puis « ✓ Reconnecté — la partie est à jour ».
- **Mouvement** : animations courtes (≤ 0,22 s), jamais bloquantes ; coupées avec `prefers-reduced-motion`.

## Règles et données

Aucune règle, aucun calcul, aucun schéma de données ni protocole modifiés. Les mains restent privées ; la révélation des annonces de belote reste au début du deuxième pli.
Aucun défaut fonctionnel du serveur ou du moteur n'a été corrigé : tous les écarts relevés sont d'ergonomie.
Un changement de comportement côté client : au tarot, jouer une carte demande désormais « sélection puis bouton Jouer » (comme la coinche) au lieu d'un toucher direct.

## Vérifications

Voir la description de la PR (résultats de lint, format, TypeScript, Vitest, Playwright, builds, revue Chromium/WebKit).
