import { describe, expect, it } from 'vitest'
import { reponsePieceJointe } from '../reponse-piece-jointe'

/**
 * Les en-têtes qui servent une pièce jointe portent une exigence de sécurité
 * (`docs/exigences-securite.md` §3) : ils sont donc vérifiés, pas seulement commentés.
 */
const OCTETS = Buffer.from('%PDF-1.4 contenu')

const servir = (mime: string, apercu: boolean, nom = 'constat.pdf') =>
  reponsePieceJointe(OCTETS, { nom_original: nom, mime_type: mime, taille_octets: 16 }, { apercu })

describe('Réponse servant une pièce jointe', () => {
  describe('Téléchargement — le comportement par défaut, inchangé', () => {
    it('force l’enregistrement et n’autorise aucune réinterprétation du type', () => {
      const reponse = servir('application/pdf', false)

      expect(reponse.headers.get('Content-Disposition')).toMatch(/^attachment;/)
      expect(reponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(reponse.headers.get('Cache-Control')).toBe('no-store, private')
      expect(reponse.headers.get('Content-Type')).toBe('application/pdf')
    })
  })

  describe('Aperçu — afficher sans télécharger', () => {
    it('affiche la pièce au lieu de la faire enregistrer', () => {
      expect(servir('image/jpeg', true, 'photo.jpg').headers.get('Content-Disposition')).toMatch(
        /^inline;/
      )
    })

    it('isole le document dans une origine opaque', () => {
      // L'essentiel : `allow-same-origin` est ABSENT. Le fichier vient d'un tiers ; affiché, il ne
      // doit atteindre ni le DOM, ni les cookies, ni le stockage de l'application.
      const politique = servir('image/jpeg', true, 'photo.jpg').headers.get(
        'Content-Security-Policy'
      )

      expect(politique).toBe('sandbox')
      expect(politique).not.toContain('allow-same-origin')
    })

    it('laisse au PDF les scripts de son visualiseur, sans lui rendre l’origine', () => {
      // `sandbox` seul laisse un cadre vide dans Chrome : le lecteur intégré est une extension qui
      // a besoin de ses propres scripts (issue Chromium 40328564). L'origine, elle, reste opaque.
      const politique = servir('application/pdf', true).headers.get('Content-Security-Policy')

      expect(politique).toBe('sandbox allow-scripts')
      expect(politique).not.toContain('allow-same-origin')
    })

    it('REFUSE d’afficher un type non prévisualisable, même si l’aperçu est demandé', () => {
      // La demande d'aperçu est un paramètre d'URL : n'importe qui peut l'ajouter. Elle ne doit
      // pas pouvoir transformer en document affiché ce qui n'a pas été jugé inerte.
      const reponse = servir('text/html', true, 'piege.html')

      expect(reponse.headers.get('Content-Disposition')).toMatch(/^attachment;/)
      expect(reponse.headers.get('Content-Security-Policy')).toBeNull()
    })
  })

  describe('Nom de fichier — il vient de la personne qui a téléversé', () => {
    it('conserve les accents sans casser l’en-tête', () => {
      const disposition = servir('application/pdf', false, 'Constat de sécurité — août.pdf')
        .headers.get('Content-Disposition')!

      // `filename` reste en ASCII pour les clients anciens, `filename*` (RFC 5987) porte le nom
      // réel. Un en-tête n'accepte pas ces octets tels quels : sans cela, la réponse échouerait.
      expect(disposition).toContain("filename*=UTF-8''")
      expect(disposition).toContain(encodeURIComponent('Constat de sécurité — août.pdf'))
      expect(/filename="[\x20-\x7e]*"/.test(disposition)).toBe(true)
    })

    it('neutralise un nom qui tenterait d’injecter un en-tête', () => {
      const disposition = servir(
        'application/pdf',
        false,
        'facture".pdf\r\nSet-Cookie: session=vole'
      ).headers.get('Content-Disposition')!

      expect(disposition).not.toContain('\r')
      expect(disposition).not.toContain('\n')
      expect(disposition).toMatch(/^attachment; filename="[^"]*"; filename\*=UTF-8''/)
    })

    it('ne produit jamais un nom vide', () => {
      expect(servir('application/pdf', false, '   ').headers.get('Content-Disposition')).toContain(
        'filename="piece-jointe"'
      )
    })
  })
})
