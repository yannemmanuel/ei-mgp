import { isValidElement } from "react"

/**
 * Base UI a besoin de savoir si l'élément rendu est un `<button>` natif.
 *
 * Sans cette indication, deux défauts symétriques : sur un composant dont la balise par défaut
 * EST un bouton, fournir un lien fait perdre le clavier et le rôle ARIA ; sur un composant dont la
 * balise par défaut n'en est pas un, fournir un bouton fait poser des attributs en double
 * (`role`, `aria-disabled`). Les deux cas se signalent par un avertissement en console.
 *
 * D'où cette déduction, faite une fois pour toutes plutôt qu'à chaque appel : l'oubli est
 * silencieux à l'écran et ne se voit qu'en console.
 *
 * `null` signifie « on ne peut pas savoir » — `render` absent, ou fourni sous forme de fonction,
 * qui n'est pas inspectable. L'appelant retombe alors sur la valeur par défaut de SA balise, et
 * reste libre de fixer `nativeButton` lui-même.
 */
export function renduEstUnBouton(render: unknown): boolean | null {
  if (render === undefined || render === null) return null
  if (!isValidElement(render)) return null

  return render.type === "button"
}
