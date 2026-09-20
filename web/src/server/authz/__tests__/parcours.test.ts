import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { PARCOURS_CODES, parcoursAutorises, peutVoirParcours } from '../parcours'
import { chargerUtilisateurAutorise } from '../utilisateur'
import { utilisateurAvecRoles } from './aide'

/**
 * Le périmètre par type de déclaration, depuis qu'il se coche dans les habilitations.
 *
 * ⚠️ CE FICHIER TESTAIT UNE TABLE ÉCRITE DANS LE CODE (`ROLES_PAR_PARCOURS`) et son croisement
 * avec l'attribution par personne. Les deux ont disparu le 2026-09-20 : la table vit en base
 * (`role_parcours`), et le rôle décide seul.
 *
 * Ce qui les remplace tient en deux choses, et les deux comptent :
 *
 *   - les prédicats rendent exactement le périmètre qu'on leur donne, sans rien y ajouter ;
 *   - ce périmètre vient bien de la BASE, pour les rôles réellement enregistrés.
 */
describe('Le périmètre est rendu tel quel', () => {
  it('ne montre RIEN à qui n’a aucun type de déclaration', () => {
    /*
      ⚠️ La liste vide signifie « aucun dossier », jamais « tous ». C'est la règle la plus
      dangereuse à inverser : un `in: []` SQL ne ramène rien, et c'est le comportement voulu.
    */
    const sansRien = { ...utilisateurAvecRoles('correspondant_drh'), parcours: [] }

    expect(parcoursAutorises(sansRien)).toEqual([])
    for (const code of PARCOURS_CODES) {
      expect(peutVoirParcours(sansRien, code), code).toBe(false)
    }
  })

  it('n’ouvre que ce qui est coché, et rien d’autre', () => {
    const correspondant = {
      ...utilisateurAvecRoles('correspondant_drh'),
      parcours: ['grief_employe' as const],
    }

    expect(parcoursAutorises(correspondant)).toEqual(['grief_employe'])
    expect(peutVoirParcours(correspondant, 'grief_employe')).toBe(true)
    expect(peutVoirParcours(correspondant, 'grief_communaute')).toBe(false)
    expect(peutVoirParcours(correspondant, 'ei_employe')).toBe(false)
  })

  it('⚠️ ne traite plus aucun rôle à part', () => {
    /*
      Les rôles transverses — Service MGP, Direction générale, Auditeur, DPO — recevaient les 4
      types par une règle séparée, écrite dans le code. Ils les reçoivent maintenant parce qu'ils
      leur sont cochés. Décocher doit donc les priver, sans quoi la case serait un leurre.
    */
    const transverseDecoche = { ...utilisateurAvecRoles('service_mgp'), parcours: [] }

    expect(parcoursAutorises(transverseDecoche)).toEqual([])
    expect(peutVoirParcours(transverseDecoche, 'grief_employe')).toBe(false)
  })
})

describe('⚠️ Le périmètre vient de la base', () => {
  it('résout les types d’un compte réel depuis role_parcours', async () => {
    /*
      Le croisement qui compte : ce que `chargerUtilisateurAutorise()` rend doit être exactement
      l'union des types cochés sur les rôles ACTIFS du compte. C'est la seule façon de voir que la
      lecture en base et les cases de l'écran disent la même chose.
    */
    const comptes = await prisma.users.findMany({
      where: { actif: true },
      select: { id: true, name: true },
    })

    expect(comptes.length, 'aucun compte actif : le cas ne prouverait rien').toBeGreaterThan(0)

    let comptesAvecPerimetre = 0

    for (const compte of comptes) {
      const u = await chargerUtilisateurAutorise(compte.id)
      if (!u) continue

      const attendu = await prisma.role_parcours.findMany({
        where: {
          parcours: { actif: true },
          roles: {
            actif: true,
            guard_name: 'web',
            model_has_roles: {
              some: { model_type: String.raw`App\Models\User`, model_id: compte.id },
            },
          },
        },
        select: { parcours: { select: { code: true } } },
      })

      const codes = [...new Set(attendu.map((a) => a.parcours.code))].sort()

      expect([...u.parcours].sort(), `${compte.name} : périmètre différent de la base`).toEqual(
        codes
      )

      if (codes.length > 0) comptesAvecPerimetre++
    }

    expect(
      comptesAvecPerimetre,
      'aucun compte n’a de type de déclaration : le cas ne prouverait rien'
    ).toBeGreaterThan(0)
  })

  it('⚠️ ignore les types cochés sur un rôle DÉSACTIVÉ', async () => {
    /*
      Un rôle éteint ne confère rien — ni permission, ni type de déclaration. Lire `role_parcours`
      sans filtrer sur `roles.actif` rendrait la désactivation à moitié effective : le compte
      perdrait ses droits mais garderait sa vue.
    */
    const surRoleEteint = await prisma.role_parcours.findFirst({
      where: { roles: { actif: false, guard_name: 'web' } },
      select: { roles: { select: { name: true } }, parcours: { select: { code: true } } },
    })

    expect(
      surRoleEteint,
      'aucun rôle désactivé ne porte de type : le cas ne prouverait rien'
    ).not.toBeNull()
    if (!surRoleEteint) return

    const porteurs = await prisma.model_has_roles.findMany({
      where: {
        model_type: String.raw`App\Models\User`,
        roles: { name: surRoleEteint.roles.name },
      },
      select: { model_id: true },
    })

    for (const porteur of porteurs) {
      const u = await chargerUtilisateurAutorise(porteur.model_id)
      if (!u) continue

      // Le type peut lui venir d'un AUTRE rôle actif : on ne vérifie que l'absence d'apport par
      // le rôle éteint, en s'assurant qu'aucun rôle actif ne l'ouvre.
      const parUnRoleActif = await prisma.role_parcours.count({
        where: {
          parcours: { code: surRoleEteint.parcours.code, actif: true },
          roles: {
            actif: true,
            guard_name: 'web',
            model_has_roles: {
              some: { model_type: String.raw`App\Models\User`, model_id: porteur.model_id },
            },
          },
        },
      })

      if (parUnRoleActif > 0) continue

      expect(
        u.parcours,
        `un rôle désactivé ouvre encore « ${surRoleEteint.parcours.code} »`
      ).not.toContain(surRoleEteint.parcours.code)
    }
  })
})
