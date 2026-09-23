'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

/**
 * Le retour d'une opération s'annonce en surimpression, plus dans la page.
 *
 * Toutes les Server Actions de l'application rendent la même forme — un message de succès ou un
 * message d'échec — que chaque écran affichait jusqu'ici dans un encart. Ces encarts
 * apparaissaient et disparaissaient au fil des enregistrements, déplaçant le contenu sous le
 * curseur ; et rien ne garantissait qu'on les voie, un tableau long pouvant les laisser hors de
 * l'écran. Une notification se montre là où l'œil est, puis s'efface.
 *
 * Le `<Toaster />` est monté une fois pour toutes dans `app/layout.tsx`.
 *
 * ⚠️ Ce qui ne doit PAS passer par ici :
 *
 * - une erreur rattachée à un CHAMP — elle se lit à côté du champ à corriger, pas ailleurs ;
 * - une valeur à lire ou à recopier, un mot de passe initial par exemple : une notification
 *   s'efface, et avec elle ce qu'on n'a pas eu le temps de noter.
 */
export type RetourOperation = { succes?: string; erreur?: string }

export function useRetourEnToast(etat: RetourOperation): void {
  /*
   * L'objet d'état DÉJÀ annoncé, comparé par identité.
   *
   * `useActionState` rend un objet neuf à chaque exécution, y compris lorsque le message est le
   * même que la fois précédente — deux échecs identiques doivent bien produire deux
   * notifications. À l'inverse, un simple re-rendu (une revalidation, un état voisin qui change)
   * conserve le même objet : sans cette garde, la notification reviendrait sans que rien ne se
   * soit produit.
   *
   * Cette garde couvre aussi le double appel des effets en mode strict.
   */
  const annonce = useRef<RetourOperation | null>(null)

  useEffect(() => {
    if (annonce.current === etat) return
    annonce.current = etat

    if (etat.succes) toast.success(etat.succes)
    else if (etat.erreur) toast.error(etat.erreur)
  }, [etat])
}
