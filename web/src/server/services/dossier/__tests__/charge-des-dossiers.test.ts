import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { chargerUtilisateurAutorise } from '@/server/authz'
import { utilisateurAvecRoles } from '@/server/authz/__tests__/aide'
import { clauseDontJeReponds } from '../liste'
import { comptesQuiTraitent } from '../suivi-ei'

/**
 * Qui TRAITE les dossiers — un paramètre du rôle, pas une déduction.
 *
 * ⚠️ L'ERREUR QUE CE FICHIER PROTÈGE. « Traiter » se lisait dans `dossiers.status.update`, le
 * droit de faire AVANCER un dossier. Ce sont deux choses différentes, et le Service MGP le
 * montre : il arbitre, il relance après une réouverture — il porte donc ce droit —, mais il
 * n'instruit pas. Il apparaissait pourtant comme titulaire de TOUS les dossiers, sur chaque fiche
 * et dans son « vos dossiers à traiter ».
 *
 * Ce sont les correspondants qui instruisent. Aucune permission ne dit cela : c'est une donnée
 * d'organisation, et elle se coche rôle par rôle dans les habilitations.
 */
describe('⚠️ Le Service MGP ne traite pas les dossiers', () => {
  it('ne le compte pas parmi les traitants', async () => {
    const traitants = await comptesQuiTraitent()

    const roles = await prisma.roles.findMany({
      where: { guard_name: 'web', traite_dossiers: true },
      select: { name: true },
    })

    expect(
      roles.map((r) => r.name),
      'le Service MGP est de nouveau marqué comme traitant'
    ).not.toContain('service_mgp')

    // Les comptes retenus ne doivent porter QUE des rôles traitants.
    const nomsTraitants = new Set(roles.map((r) => r.name))

    for (const compte of traitants) {
      expect(
        compte.pourCloisonnement.roles.some((r) => nomsTraitants.has(r)),
        `${compte.nom} est retenu comme traitant sans porter aucun rôle qui l’est`
      ).toBe(true)
    }
  })

  it('⚠️ ne lui attribue aucun dossier dans « ses dossiers »', async () => {
    /*
      Le symptôme exact qui a été remonté. Un compte Service MGP voyait tous les dossiers arriver
      dans sa liste personnelle, alors qu'il n'en instruit aucun.

      La clause doit retomber sur la seule affectation — il n'en reste que d'anciennes — et non
      sur le rattachement.
    */
    const mgp = utilisateurAvecRoles('service_mgp')

    expect(mgp.traiteLesDossiers, 'le reflet de test marque le Service MGP comme traitant').toBe(
      false
    )

    const clause = clauseDontJeReponds(mgp)

    expect(
      clause.OR,
      'la clause ouvre la branche « par rattachement » pour un rôle non traitant'
    ).toBeUndefined()
    expect(clause.dossier_affectations).toBeDefined()
  })

  it('retient en revanche un correspondant', () => {
    // La contrepartie : ce sont eux qui instruisent, et la branche par rattachement doit s'ouvrir.
    const drh = utilisateurAvecRoles('correspondant_drh')

    expect(drh.traiteLesDossiers).toBe(true)
    expect(clauseDontJeReponds(drh).OR, 'un correspondant ne répond d’aucun dossier').toBeDefined()
  })
})

describe('⚠️ La charge se paramètre, elle ne se déduit pas', () => {
  it('ne se lit dans aucune permission', async () => {
    /*
      ⚠️ LE CŒUR DE LA CORRECTION. Déduire la charge d'un droit voisin, quel qu'il soit, ramènerait
      le défaut : aucune permission ne dit qui instruit. Le service doit lire la colonne, et elle
      seule.
    */
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/server/services/dossier/liste.ts', 'utf8')
    const clause = source.slice(
      source.indexOf('export function clauseDontJeReponds'),
      source.indexOf('export function clauseNonAffectes')
    )

    expect(clause, 'la charge est de nouveau déduite d’une permission').not.toContain(
      "aPermission(u, 'dossiers.status.update')"
    )
    expect(clause, 'la charge ne vient plus du paramètre du rôle').toContain('u.traiteLesDossiers')
  })

  it('suit le paramétrage de la base, compte par compte', async () => {
    // Le croisement qui compte : ce que `chargerUtilisateurAutorise()` rend doit correspondre à
    // ce qui est coché en base, pour chaque compte actif.
    const comptes = await prisma.users.findMany({
      where: { actif: true },
      select: { id: true, name: true },
    })

    expect(comptes.length, 'aucun compte actif : le cas ne prouverait rien').toBeGreaterThan(0)

    for (const compte of comptes) {
      const u = await chargerUtilisateurAutorise(compte.id)
      if (!u) continue

      const traitants = await prisma.roles.count({
        where: {
          guard_name: 'web',
          actif: true,
          traite_dossiers: true,
          model_has_roles: {
            some: { model_type: String.raw`App\Models\User`, model_id: compte.id },
          },
        },
      })

      expect(u.traiteLesDossiers, `${compte.name} : charge différente du paramétrage`).toBe(
        traitants > 0
      )
    }
  })

  it('⚠️ un rôle DÉSACTIVÉ ne confère pas la charge', async () => {
    // Même règle que pour les permissions et les types : un rôle éteint ne confère rien. La
    // contourner rendrait la désactivation à moitié effective.
    const eteintTraitant = await prisma.roles.findFirst({
      where: { guard_name: 'web', actif: false, traite_dossiers: true },
      select: { name: true },
    })

    expect(
      eteintTraitant,
      'aucun rôle désactivé ne porte la charge : le cas ne prouverait rien'
    ).not.toBeNull()
    if (!eteintTraitant) return

    const porteurs = await prisma.model_has_roles.findMany({
      where: {
        model_type: String.raw`App\Models\User`,
        roles: { name: eteintTraitant.name },
      },
      select: { model_id: true },
    })

    for (const porteur of porteurs) {
      const u = await chargerUtilisateurAutorise(porteur.model_id)
      if (!u) continue

      const autreTraitantActif = await prisma.roles.count({
        where: {
          guard_name: 'web',
          actif: true,
          traite_dossiers: true,
          model_has_roles: {
            some: { model_type: String.raw`App\Models\User`, model_id: porteur.model_id },
          },
        },
      })

      if (autreTraitantActif > 0) continue

      expect(
        u.traiteLesDossiers,
        `un rôle désactivé confère encore la charge (${eteintTraitant.name})`
      ).toBe(false)
    }
  })
})
