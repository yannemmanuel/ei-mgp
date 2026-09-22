import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { ErreurWorkflow } from '@/server/services/dossier/workflow'
import {
  supprimerCanalCaptage,
  supprimerCompte,
  supprimerDirection,
  supprimerNiveauGravite,
  supprimerSite,
} from '../suppression'
import { MODELES } from '@/server/modeles'

/**
 * La suppression protégée du back-office.
 *
 * Une seule règle : on efface ce que rien ne cite, on refuse le reste, et on dit quoi faire à la
 * place. ⚠️ Ce qui compte ici est le REFUS — un fichier qui ne vérifierait que les suppressions
 * réussies laisserait passer exactement le défaut qu'on cherche à empêcher.
 */
const MODEL_TYPE_USER = MODELES.utilisateur

const crees = {
  canaux: [] as bigint[],
  gravites: [] as bigint[],
  sites: [] as bigint[],
  directions: [] as bigint[],
  users: [] as bigint[],
}

async function acteur() {
  const u = await prisma.users.findFirstOrThrow({ where: { actif: true }, select: { id: true } })
  return { id: u.id }
}

const suffixe = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// ⚠️ Borné aux lignes fabriquées ici : jamais de suppression large sur un référentiel réel.
afterAll(async () => {
  await prisma.canaux_captage.deleteMany({ where: { id: { in: crees.canaux } } })
  await prisma.niveaux_gravite.deleteMany({ where: { id: { in: crees.gravites } } })
  await prisma.directions.deleteMany({ where: { id: { in: crees.directions } } })
  await prisma.sites.deleteMany({ where: { id: { in: crees.sites } } })
  await prisma.audit_logs.deleteMany({
    where: { auditable_type: MODEL_TYPE_USER, auditable_id: { in: crees.users.map(String) } },
  })
  await prisma.users.deleteMany({ where: { id: { in: crees.users } } })
})

describe('Ce que rien ne cite s’efface', () => {
  it('supprime un canal inutilisé, et consigne ce qu’il contenait', async () => {
    const canal = await prisma.canaux_captage.create({
      data: { code: `test-${suffixe()}`, libelle: 'Canal de test', actif: true },
      select: { id: true },
    })
    crees.canaux.push(canal.id)

    await supprimerCanalCaptage(await acteur(), canal.id)

    expect(await prisma.canaux_captage.findUnique({ where: { id: canal.id } })).toBeNull()

    // ⚠️ L'audit garde les VALEURS effacées : c'est la seule trace qui reste de la ligne.
    const trace = await prisma.audit_logs.findFirst({
      where: { action: 'canal_captage.supprime', auditable_id: String(canal.id) },
      select: { old_values: true },
    })

    expect(trace, 'la suppression n’est pas consignée').not.toBeNull()
    expect(JSON.stringify(trace?.old_values)).toContain('Canal de test')
  })

  it('supprime un site vide', async () => {
    const site = await prisma.sites.create({
      data: { code: `s-${suffixe()}`, libelle: 'Site de test', actif: true },
      select: { id: true },
    })
    crees.sites.push(site.id)

    await supprimerSite(await acteur(), site.id)

    expect(await prisma.sites.findUnique({ where: { id: site.id } })).toBeNull()
  })
})

describe('⚠️ Ce qui est cité est REFUSÉ, en nommant par quoi', () => {
  it('refuse un canal utilisé par des dossiers', async () => {
    // Le canal « qr_code » porte toutes les déclarations publiques : il ne peut pas disparaître.
    const canal = await prisma.canaux_captage.findFirstOrThrow({
      where: { code: 'qr_code' },
      select: { id: true, _count: { select: { dossiers: true } } },
    })

    expect(canal._count.dossiers, 'aucun dossier : le cas ne prouverait rien').toBeGreaterThan(0)

    await expect(supprimerCanalCaptage(await acteur(), canal.id)).rejects.toThrow(ErreurWorkflow)

    // Et il est TOUJOURS là : le refus doit précéder l'écriture, pas la rattraper.
    expect(await prisma.canaux_captage.findUnique({ where: { id: canal.id } })).not.toBeNull()
  })

  it('nomme ce qui s’oppose, et renvoie vers la désactivation', async () => {
    /*
      Le message est la moitié utile du refus. « Cet élément est utilisé » n'apprend rien et ne se
      vérifie pas ; « cité par 20 dossiers » dit où chercher. Et sans le remède, l'administrateur
      reste devant une impasse.
    */
    const canal = await prisma.canaux_captage.findFirstOrThrow({ where: { code: 'qr_code' } })

    await expect(supprimerCanalCaptage(await acteur(), canal.id)).rejects.toThrow(/dossier/)
    await expect(supprimerCanalCaptage(await acteur(), canal.id)).rejects.toThrow(/[Dd]ésactivez/)
  })

  it('refuse un site qui porte encore des directions', async () => {
    // Un site effacé sous ses directions les laisserait sans rattachement — et leurs déclarations
    // n'atteindraient plus personne.
    const site = await prisma.sites.create({
      data: { code: `s-${suffixe()}`, libelle: 'Site peuplé', actif: true },
      select: { id: true },
    })
    crees.sites.push(site.id)

    const direction = await prisma.directions.create({
      data: { code: `d-${suffixe()}`, libelle: 'Direction de test', actif: true, site_id: site.id },
      select: { id: true },
    })
    crees.directions.push(direction.id)

    /*
      ⚠️ `ErreurWorkflow` explicitement, et pas seulement le mot « direction ».

      Postgres refuserait de toute façon par contrainte de clé étrangère, et son message contient
      le nom de la contrainte — `directions_site_id_foreign` — donc le mot cherché. Le cas
      passerait alors sans rien prouver de NOTRE garde, celle qui explique et propose un remède.
    */
    await expect(supprimerSite(await acteur(), site.id)).rejects.toThrow(ErreurWorkflow)
    await expect(supprimerSite(await acteur(), site.id)).rejects.toThrow(/Désactivez/)
  })

  it('⚠️ compte les DEUX rattachements d’une direction à un dossier', async () => {
    /*
      Un dossier cite une direction deux fois : celle des faits et celle du déclarant. N'en
      vérifier qu'une laisserait effacer une direction encore citée par l'autre — et le dossier
      pointerait alors vers une ligne disparue.
    */
    const dossier = await prisma.dossiers.findFirst({ select: { id: true } })
    if (!dossier) return // base vide : le cas ne prouverait rien

    const site = await prisma.sites.findFirstOrThrow({ select: { id: true } })
    const temoin = await prisma.directions.create({
      data: { code: `dt-${suffixe()}`, libelle: 'Direction du témoin', actif: true, site_id: site.id },
      select: { id: true },
    })
    crees.directions.push(temoin.id)

    // Elle n'est citée QUE comme direction du déclarant.
    await prisma.dossiers.update({
      where: { id: dossier.id },
      data: { direction_declarant_id: temoin.id },
    })

    try {
      await expect(supprimerDirection(await acteur(), temoin.id)).rejects.toThrow(/déclarant/)
    } finally {
      await prisma.dossiers.update({
        where: { id: dossier.id },
        data: { direction_declarant_id: null },
      })
    }
  })

  it('refuse un niveau de gravité porté par des dossiers', async () => {
    const gravite = await prisma.niveaux_gravite.findFirst({
      where: { dossiers: { some: {} } },
      select: { id: true },
    })

    if (!gravite) return // aucun dossier qualifié : le cas ne prouverait rien

    await expect(supprimerNiveauGravite(await acteur(), gravite.id)).rejects.toThrow(ErreurWorkflow)
  })
})

describe('Les comptes : supprimables tant qu’ils n’ont rien fait', () => {
  async function compteNeuf(): Promise<bigint> {
    const u = await prisma.users.create({
      data: {
        name: 'Compte sans trace',
        email: `sans-trace-${suffixe()}@example.test`,
        password: null,
        actif: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      select: { id: true },
    })
    crees.users.push(u.id)
    return u.id
  }

  it('supprime un compte créé par erreur', async () => {
    const id = await compteNeuf()

    await supprimerCompte(await acteur(), id)

    expect(await prisma.users.findUnique({ where: { id } })).toBeNull()
  })

  it('emporte ses rôles, qui n’appartiennent qu’à lui', async () => {
    // Sans ce nettoyage, l'association survivrait au compte et serait réattribuée au prochain
    // identifiant réutilisant ce numéro.
    const id = await compteNeuf()
    const role = await prisma.roles.findFirstOrThrow({ select: { id: true } })

    await prisma.model_has_roles.create({
      data: { role_id: role.id, model_type: MODEL_TYPE_USER, model_id: id },
    })

    await supprimerCompte(await acteur(), id)

    expect(
      await prisma.model_has_roles.count({ where: { model_id: id } }),
      'le rôle survit au compte'
    ).toBe(0)
  })

  it('⚠️ REFUSE dès qu’une trace existe', async () => {
    /*
      Le cas décisif. Un compte cité par le journal ne peut pas disparaître sans rendre l'audit
      incapable de dire qui a fait quoi — ce que la traçabilité d'un dispositif de signalement
      doit précisément garantir.
    */
    const id = await compteNeuf()

    await prisma.audit_logs.create({
      data: { user_id: id, action: 'auth.connexion', created_at: new Date() },
    })

    await expect(supprimerCompte(await acteur(), id)).rejects.toThrow(/journal/)
    await expect(supprimerCompte(await acteur(), id)).rejects.toThrow(/[Dd]ésactivez/)

    expect(await prisma.users.findUnique({ where: { id } }), 'le compte a été effacé').not.toBeNull()

    await prisma.audit_logs.deleteMany({ where: { user_id: id } })
  })

  it('⚠️ refuse qu’on supprime son PROPRE compte', async () => {
    // Un administrateur ne doit pas pouvoir se retirer du dispositif d'un clic — et surtout pas
    // s'il est le dernier à détenir la gestion des habilitations.
    const moi = await acteur()

    await expect(supprimerCompte(moi, moi.id)).rejects.toThrow(/votre propre compte/)
  })

  it('ne bute PAS sur un parcours confié', async () => {
    // `utilisateur_parcours` appartient au compte et ne documente rien : le compter interdirait
    // de supprimer un compte pour la seule raison qu'on lui a confié un parcours.
    const id = await compteNeuf()
    const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

    await prisma.utilisateur_parcours.create({ data: { user_id: id, parcours_id: parcours.id } })

    await expect(supprimerCompte(await acteur(), id)).resolves.toBeUndefined()
  })
})
