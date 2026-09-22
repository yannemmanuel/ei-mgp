import { beforeAll, describe, expect, it } from 'vitest'
import { signerHorodatage, verifierHorodatage } from '../horodatage-signe'

/**
 * ⚠️ LE DÉFAUT QUE CE FICHIER PROTÈGE (S2, audit du 2026-09-22).
 *
 * Le délai minimal de remplissage du formulaire public (DT-14) se calculait sur une valeur posée
 * par le NAVIGATEUR au montage. Le code l'assumait — « un robot peut forger cette valeur » — et
 * s'appuyait sur les deux autres remparts. Le contrôle le plus visible du dispositif n'en était
 * donc pas un : poster « maintenant − 10 » suffisait à franchir les trois secondes.
 *
 * Ces cas exercent la signature, mais surtout les trois façons de la contourner sans la casser :
 * forger la valeur, rejouer un jeton récolté, et postdater.
 */
beforeAll(() => {
  // Le module exige `AUTH_SECRET` et échoue fermé sans elle — voir le cas dédié plus bas.
  process.env.AUTH_SECRET ??= 'secret-de-test-suffisamment-long-pour-hmac'
})

const SECONDE = 1000

describe('⚠️ Ce que la signature empêche', () => {
  it('⚠️ refuse un horodatage FORGÉ — le contournement d’origine', () => {
    /*
      Le geste exact du robot : prétendre que le formulaire est affiché depuis dix secondes.
      Sans signature, la valeur passait telle quelle dans `Number()` et le délai était franchi.
    */
    const forge = String(Math.floor(Date.now() / 1000) - 10)

    expect(verifierHorodatage(forge)).toEqual({ ok: false, raison: 'malforme' })
    expect(verifierHorodatage(`${forge}.signature-inventee`)).toEqual({
      ok: false,
      raison: 'signature',
    })
  })

  it('⚠️ refuse un jeton REJOUÉ au-delà de sa fenêtre', () => {
    /*
      ⚠️ SANS BORNE DE VALIDITÉ, LA SIGNATURE NE SERVIRAIT À RIEN. Un robot chargerait le
      formulaire UNE fois, garderait le jeton et le rejouerait indéfiniment — la signature
      resterait valide, et le délai minimal serait franchi dès la deuxième seconde.
    */
    const maintenant = Date.now()
    const jeton = signerHorodatage(maintenant)

    // Onze heures plus tard : encore bon, un formulaire peut rester ouvert une matinée.
    expect(verifierHorodatage(jeton, maintenant + 11 * 3600 * SECONDE).ok).toBe(true)

    // Treize heures plus tard : refusé.
    expect(verifierHorodatage(jeton, maintenant + 13 * 3600 * SECONDE)).toEqual({
      ok: false,
      raison: 'expire',
    })
  })

  it('⚠️ refuse un horodatage POSTDATÉ', () => {
    /*
      Un horodatage dans le futur ne peut pas venir de nous — l'horloge du serveur est la seule
      source. L'accepter rendrait le délai minimal négatif, donc toujours satisfait : le
      contournement reviendrait par la porte opposée.
    */
    const maintenant = Date.now()
    const futur = signerHorodatage(maintenant + 60 * SECONDE)

    expect(verifierHorodatage(futur, maintenant)).toEqual({ ok: false, raison: 'futur' })
  })

  it('refuse le vide, le malformé et la signature d’un AUTRE horodatage', () => {
    const maintenant = Date.now()

    expect(verifierHorodatage('')).toEqual({ ok: false, raison: 'absent' })
    expect(verifierHorodatage('sans-separateur')).toEqual({ ok: false, raison: 'malforme' })
    expect(verifierHorodatage('.signature-seule')).toEqual({ ok: false, raison: 'malforme' })

    // « 12abc » doit être refusé, pas tronqué à 12 — d'où `Number()` plutôt que `parseInt`.
    const vraie = signerHorodatage(maintenant).split('.')[1]
    expect(verifierHorodatage(`12abc.${vraie}`)).toEqual({ ok: false, raison: 'malforme' })

    // La signature d'un horodatage voisin ne vaut pas pour celui-ci.
    const autre = signerHorodatage(maintenant - 5 * SECONDE)
    const cible = Math.floor(maintenant / 1000)
    expect(verifierHorodatage(`${cible}.${autre.split('.')[1]}`)).toEqual({
      ok: false,
      raison: 'signature',
    })
  })
})

describe('Ce que la signature doit laisser passer', () => {
  it('accepte l’aller-retour d’un formulaire ordinaire', () => {
    const maintenant = Date.now()
    const jeton = signerHorodatage(maintenant)

    // Quarante secondes de remplissage : le cas normal.
    const resultat = verifierHorodatage(jeton, maintenant + 40 * SECONDE)

    expect(resultat.ok).toBe(true)
    expect(resultat.ok && resultat.secondes).toBe(Math.floor(maintenant / 1000))
  })

  it('⚠️ ne juge PAS du délai de remplissage', () => {
    /*
      Les deux questions sont séparées à dessein : « cette valeur vient-elle de nous ? » et « le
      formulaire a-t-il été rempli assez lentement ? » n'ont ni la même réponse ni le même
      message. Les confondre donnerait au robot le même retour qu'à l'humain pressé, et à
      l'humain pressé un message qui l'accuse.

      Une soumission instantanée avec un jeton VALIDE passe donc ici — c'est
      `controlesAntiRobot()` qui applique ensuite les trois secondes.
    */
    const maintenant = Date.now()

    expect(verifierHorodatage(signerHorodatage(maintenant), maintenant).ok).toBe(true)
  })

  it('tolère une seconde d’arrondi entre la signature et la vérification', () => {
    // La signature arrondit à la seconde ; la vérification peut tomber juste avant le tic
    // suivant. Sans tolérance, une soumission sur mille serait refusée « postdatée ».
    const maintenant = Date.now()

    expect(verifierHorodatage(signerHorodatage(maintenant), maintenant - 900).ok).toBe(true)
  })
})

describe('⚠️ Sans secret, le module échoue FERMÉ', () => {
  it('lève plutôt que d’accepter l’horodatage faute de mieux', () => {
    /*
      Accepter « faute de mieux » rétablirait exactement le défaut qu'on ferme, en silence et sur
      toutes les installations mal configurées. `AUTH_SECRET` est déjà exigée par Auth.js : une
      installation sans elle ne permet pas de se connecter, donc aucune configuration valide ne
      peut tomber ici.
    */
    const garde = process.env.AUTH_SECRET
    delete process.env.AUTH_SECRET

    try {
      expect(() => signerHorodatage()).toThrow(/AUTH_SECRET/)
    } finally {
      process.env.AUTH_SECRET = garde
    }
  })
})
