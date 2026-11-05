# Règles personnalisées et ordre des calculs

Ces règles sont celles de l'application ; elles ne sont pas les règles officielles.

## Arrondis

- **Coinche / belote** (mode arrondi) : dizaine la plus proche, 5 vers le haut (84→80, 85→90, 112→110), appliquée **séparément** à chaque équipe, avant ajout des annonces et de la belote. Réussite, chute et litige se jugent toujours sur les points **exacts**.
- **Tarot** : réussite jugée sur l'écart exact ; on arrondit la valeur absolue de l'écart (≤ 5 → dizaine inférieure, > 5 → supérieure : 5→0, 5,5→10, 15→10, 15,5→20), puis V = ±(base du contrat + écart arrondi).

## Coinche (4 joueurs, 2 équipes, aucune annonce, belote-rebelote seule)

1. Points de plis exacts d'une équipe saisis (dix de der inclus, belote exclue) ; complément sur 162.
2. Capot : case distincte (162 points ne prouvent pas un capot).
3. Réussite si `points exacts des preneurs + leur belote ≥ contrat` (la belote adverse n'aide jamais ni ne nuit).
4. Réussite : preneurs `(plis retenus + contrat) × m + belote` ; défense `plis retenus + belote`.
5. Chute : preneurs `0 + belote` ; défense `(base + contrat) × m + belote` (base 160 arrondi / 162 réel).
6. Capot réalisé non annoncé : `(250 + contrat) × m` ; annoncé réalisé : `500 × m` ; annoncé chuté : défense `(base + 250) × m` (410 / 412 avant multiplicateur).
7. m = 1, 2 (coinché), 3 (surcoinché). La belote (20) n'est jamais multipliée et reste à son propriétaire, même en cas de chute.
8. Fin : à la fin d'une donne, une équipe ≥ objectif (3 000 par défaut) ; le plus haut total gagne ; égalité → on continue.

## Belote (4 joueurs, 2 équipes)

Annonces : tierce 20, cinquante 50, cent 100, carré de 7/8 0, carré de 9 150, carré de valets 200, carré as/10/rois/dames 100. Belote-rebelote 20.

1. **Plus forte annonce** (choix de l'utilisateur : équipe A, B ou égalité) : l'équipe désignée garde toutes ses annonces, l'autre perd les siennes ; égalité = toutes annulées. La belote est indépendante.
2. **Capot** (prioritaire) : l'équipe qui a tous les plis marque 250 ; chaque équipe garde ses annonces validées et sa belote.
3. Sinon comparaison des **totaux exacts** `plis + annonces validées + belote` :
   - preneurs > défense : chaque équipe marque `plis retenus + annonces validées + belote` ;
   - preneurs < défense (chute) : preneurs 0 ; défense `base (160/162) + toutes les annonces validées + toute la belote` (même celle des preneurs). Les annonces éliminées ne reviennent jamais ;
   - égalité (**litige**) : preneurs 0, défense marque son score ; le score que les preneurs auraient marqué (plis retenus + annonces validées + belote) est mis en **réserve**, composantes conservées.
4. **Réserve** : plusieurs litiges cumulent. Elle revient au gagnant de la prochaine donne **sans litige** (preneurs si réussite, défense si chute, équipe du capot). Une donne passée ne l'attribue pas. Tant qu'une réserve est en attente, la partie ne peut pas se terminer.
5. Fin : comme la coinche (objectif 1 000 par défaut).

## Tarot (3 à 6 inscrits)

- Bases : pousse 40, garde 80, garde sans 160, garde contre 320 (réglables). L'écart n'est jamais multiplié par le contrat.
- Répartition de V : à 3 preneur +2V, défenseurs −V ; à 4 preneur +3V ; à 5 avec partenaire preneur +2V, appelé +V, défenseurs −V ; à 5 seul (s'appelle / roi au chien) preneur +4V. V négatif inverse les signes.
- À 6 inscrits : 5 actifs, le donneur est au repos (0 point, ni preneur, ni appelé, ni bénéficiaire) et le donneur tourne à chaque donne.
- **Primes** individuelles, traitées après et séparément du contrat, conservées même si le contrat chute : le bénéficiaire reçoit `valeur × (actifs − 1)`, chaque autre actif paie `valeur`. Valeurs par défaut : petit au bout 10, poignées 10/20/30, blancs 10, petit chelem annoncé 10, grand chelem annoncé 20.
- Chelems annoncés : petit réussi si le camp concède au plus 3 plis (réglable), grand si 0 pli ; en cas d'échec les transferts sont inversés. Pas de prime pour un chelem non annoncé.
- Fin : arrêt libre, ou quand un joueur atteint ±seuil (1 000 par défaut) à la fin d'une donne. Premiers ex æquo = tous vainqueurs.
- Invariants testés : somme des variations = 0, donneur au repos = 0, chaque prime à somme nulle.
