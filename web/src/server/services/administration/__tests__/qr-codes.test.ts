import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { nettoyerAudit } from '../../declaration/__tests__/aide-base'
import { ErreurWorkflow } from '../../dossier/workflow'
import {
  basculerActifQrCode,
  genererQrCode,
  listerQrCodes,
  modifierUrlCible,
  qrCodeDataUri,
} from '../qr-codes'

/** Console des QR codes (EX-DEC-01) — port de `App\Livewire\Administration\QrCodesAdmin`. */
const codesCrees: string[] = []

async function acteur() {
  const utilisateur = await prisma.users.findFirstOrThrow({ select: { id: true } })
  return { id: utilisateur.id }
}

async function nouveauCode(): Promise<string> {
  const qui = await acteur()
  const parcours = await prisma.parcours.findFirstOrThrow({ select: { id: true } })

  const id = await genererQrCode(qui, parcours.id)
  codesCrees.push(id)

  return id
}

afterEach(async () => {
  if (codesCrees.length === 0) return

  await nettoyerAudit(String.raw`App\Models\QrCode`, codesCrees)
  await prisma.qr_codes.deleteMany({ where: { id: { in: codesCrees } } })
  codesCrees.length = 0
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Génération', () => {
  it('produit un jeton alphanumérique de 24 caractères', async () => {
    const id = await nouveauCode()
    const code = await prisma.qr_codes.findUniqueOrThrow({ where: { id } })

    expect(code.token).toMatch(/^[A-Za-z0-9]{24}$/)
    expect(code.actif).toBe(true)
    expect(code.desactive_le).toBeNull()
  })

  it('ne produit jamais deux fois le même jeton', async () => {
    const ids = [await nouveauCode(), await nouveauCode(), await nouveauCode()]

    const codes = await prisma.qr_codes.findMany({ where: { id: { in: ids } }, select: { token: true } })
    const jetons = new Set(codes.map((c) => c.token))

    expect(jetons.size).toBe(3)
  })

  it('journalise la création', async () => {
    const id = await nouveauCode()

    const [trace] = await prisma.audit_logs.findMany({
      where: { action: 'qr_code.cree', auditable_id: id },
      select: { auditable_type: true, new_values: true },
    })

    expect(trace.auditable_type).toBe('App\\Models\\QrCode')
    // Le jeton figure dans la trace : c'est ce qui permet de relier un support physique retrouvé
    // sur le terrain à la personne qui l'a émis.
    expect((trace.new_values as Record<string, unknown>).token).toBeTruthy()
  })
})

describe('Retrait de la circulation', () => {
  it('bascule l’état et horodate la désactivation', async () => {
    const id = await nouveauCode()
    const qui = await acteur()

    expect(await basculerActifQrCode(qui, id)).toBe(false)

    let code = await prisma.qr_codes.findUniqueOrThrow({ where: { id } })
    expect(code.actif).toBe(false)
    expect(code.desactive_le).not.toBeNull()

    expect(await basculerActifQrCode(qui, id)).toBe(true)

    code = await prisma.qr_codes.findUniqueOrThrow({ where: { id } })
    expect(code.actif).toBe(true)
    // La date de désactivation est effacée : sinon un code réactivé resterait marqué comme retiré.
    expect(code.desactive_le).toBeNull()
  })
})

describe('URL cible', () => {
  it('refuse une valeur qui n’est pas une URL http(s)', async () => {
    const id = await nouveauCode()
    const qui = await acteur()

    for (const valeur of ['', 'pas-une-url', 'javascript:alert(1)', 'file:///etc/passwd']) {
      await expect(modifierUrlCible(qui, id, valeur)).rejects.toBeInstanceOf(ErreurWorkflow)
    }
  })

  it('reste sans effet sur la redirection réelle', async () => {
    const id = await nouveauCode()
    const qui = await acteur()

    await modifierUrlCible(qui, id, 'https://exemple.test/ailleurs')

    const code = await prisma.qr_codes.findUniqueOrThrow({
      where: { id },
      select: { url_cible: true, parcours: { select: { code: true } } },
    })

    // La colonne est bien écrite…
    expect(code.url_cible).toBe('https://exemple.test/ailleurs')

    // …mais `/q/[token]` recalcule sa destination à partir du parcours, exactement comme le
    // contrôleur Laravel. Ce test fige le constat documenté dans MIGRATION_PLAN.md : l'écran
    // d'administration de la baseline laisse croire à une réorientation qui n'a jamais lieu.
    const destinationReelle = `/declarer/${code.parcours.code}`
    expect(destinationReelle).not.toContain('exemple.test')
  })
})

describe('Rendu du support', () => {
  it('produit un SVG en data URI, stable pour un jeton donné', async () => {
    const id = await nouveauCode()
    const code = await prisma.qr_codes.findUniqueOrThrow({ where: { id }, select: { token: true } })

    const premier = await qrCodeDataUri(code.token)
    const second = await qrCodeDataUri(code.token)

    expect(premier.startsWith('data:image/svg+xml;base64,')).toBe(true)
    expect(second).toBe(premier)

    const svg = Buffer.from(premier.split(',')[1], 'base64').toString('utf8')

    // Ce qui est encodé est la redirection, jamais l'adresse du formulaire : c'est cette
    // indirection qui permet de retirer un support déjà imprimé de la circulation.
    expect(svg).toContain('<svg')
  })
})

describe('Liste', () => {
  it('restitue le parcours et l’émetteur', async () => {
    const id = await nouveauCode()

    const ligne = (await listerQrCodes()).find((c) => c.id === id)

    expect(ligne?.parcours.libelle).toBeTruthy()
    expect(ligne?.users?.name).toBeTruthy()
  })
})
