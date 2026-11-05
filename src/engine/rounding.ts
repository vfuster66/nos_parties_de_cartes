/** Coinche / belote : dizaine la plus proche, 5 vers le haut (84→80, 85→90, 112→110). */
export function roundToTenHalfUp(points: number): number {
  return Math.floor((points + 5) / 10) * 10
}

/**
 * Tarot : arrondi de la valeur absolue de l'écart à la dizaine.
 * Jusqu'à 5 inclus : dizaine inférieure ; au-dessus de 5 : dizaine supérieure.
 * Calcul en demi-points entiers pour éviter les erreurs flottantes.
 */
export function roundTarotGap(gap: number): number {
  const halves = Math.round(Math.abs(gap) * 2) // 1 = 0,5
  const tens = Math.floor(halves / 20)
  const remainderHalves = halves - tens * 20 // 0..19
  return (remainderHalves > 10 ? tens + 1 : tens) * 10
}
