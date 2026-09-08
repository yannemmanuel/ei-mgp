import { SqueletteListe } from '@/components/layout/squelettes'

/**
 * Repli de chargement pour tout le back-office : chaque page du groupe en hérite tant qu'elle
 * n'en définit pas un plus proche de sa forme. Sa seule présence rend la navigation instantanée —
 * la coquille (barre latérale, en-tête) reste en place, seul le contenu se recompose.
 */
export default function Chargement() {
  return <SqueletteListe />
}
