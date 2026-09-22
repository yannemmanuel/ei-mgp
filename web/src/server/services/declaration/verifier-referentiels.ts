import { prisma } from '@/lib/prisma'
import type { Champ } from './parcours-config'
import { POSTE_AUTRE } from './referentiels-formulaire'

/**
 * Confronte les valeurs choisies dans une liste administrable au référentiel réel.
 *
 * ⚠️ Sans ce contrôle, le formulaire ne prouverait rien. Poste, lieu et ville sont transmis en
 * clair — c'est voulu, pour que renommer un référentiel ne réécrive pas rétroactivement ce qu'un
 * déclarant a choisi — mais une chaîne libre acceptée telle quelle laisserait n'importe quelle
 * requête forgée écrire n'importe quoi dans ces colonnes. Le formulaire public est la surface
 * d'abus la plus large de l'application : ce qui vient de lui n'est jamais cru sur parole.
 *
 * Le poste est vérifié AVEC sa direction : un poste réel mais rattaché à une autre direction est
 * refusé, sans quoi la cascade n'aurait de sens que pour qui la respecte.
 *
 * ⚠️ L'ANCIENNETÉ NE PASSE PLUS PAR ICI depuis le 2026-09-22 : ses paliers sont figés dans
 * `TRANCHES_ANCIENNETE` et deviennent une énumération Zod, refusée à la porte plutôt que
 * confrontée à une table après coup.
 */
export async function verifierReferentiels(
  champs: readonly Champ[],
  valeurs: Record<string, unknown>
): Promise<Record<string, string> | null> {
  const erreurs: Record<string, string> = {}

  for (const champ of champs) {
    if (champ.referentiel === undefined || champ.referentiel === 'directions') continue

    const valeur = valeurs[champ.nom]
    if (valeur === undefined || valeur === '') continue

    const libelle = String(valeur)
    /*
      Le référentiel est passé à PART, bien qu'il soit lisible sur `champ`.

      Le rétrécissement obtenu par le `continue` ci-dessus vit sur la LECTURE de la propriété, pas
      sur le type de `champ` : transmettre l'objet seul le perdrait, et la fonction appelée devrait
      traiter à nouveau les cas que cette boucle vient d'écarter. L'argument explicite porte la
      garantie jusqu'à l'autre bout.
    */
    const connue = await estDansLeReferentiel(champ, champ.referentiel, libelle, valeurs)

    if (!connue) {
      erreurs[champ.nom] = `« ${champ.libelle} » ne correspond à aucune valeur proposée.`
    }
  }

  return Object.keys(erreurs).length > 0 ? erreurs : null
}

/**
 * Les référentiels réellement confrontés à une table.
 *
 * `directions` en est exclue : c'est une clé étrangère, validée par le schéma lui-même.
 */
type ReferentielVerifie = Exclude<NonNullable<Champ['referentiel']>, 'directions'>

async function estDansLeReferentiel(
  champ: Champ,
  referentiel: ReferentielVerifie,
  libelle: string,
  valeurs: Record<string, unknown>
): Promise<boolean> {
  if (referentiel === 'postes') {
    // Le poste de repli est proposé sous chaque direction : il doit donc être accepté sous
    // chacune. Même constante que celle qui alimente la liste — le serveur ne reconnaît pas une
    // chaîne libre, il reconnaît CELLE qu'il a lui-même proposée.
    if (libelle === POSTE_AUTRE) return true

    const direction = champ.dependDe ? valeurs[champ.dependDe] : undefined
    if (direction === undefined || direction === '') return false

    const compte = await prisma.postes.count({
      where: { libelle, actif: true, direction_id: BigInt(String(direction)) },
    })

    return compte > 0
  }

  if (referentiel === 'lieux') {
    return (await prisma.lieux.count({ where: { libelle, actif: true } })) > 0
  }

  if (referentiel === 'villes') {
    return (await prisma.villes.count({ where: { libelle, actif: true } })) > 0
  }

  /*
    ⚠️ EXHAUSTIF, ET C'EST LE POINT. Ce module se terminait par un `return` de repli qui
    interrogeait `tranches_anciennete` — la dernière branche restante. Un référentiel ajouté à
    l'union sans branche ici serait tombé dans ce repli : confronté à la MAUVAISE table, donc
    validé ou refusé pour de mauvaises raisons, et sans que rien ne le signale.

    L'affectation à `never` fait désormais échouer la COMPILATION dans ce cas, plutôt que de
    laisser une vérification silencieusement fausse partir en production.
  */
  const jamais: never = referentiel
  throw new Error(`Référentiel non traité : ${String(jamais)}`)
}
