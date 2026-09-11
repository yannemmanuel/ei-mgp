import { describe, expect, it } from 'vitest'
import { formatApercu } from '../apercu-pieces-jointes'
import { TYPES_AUTORISES } from '@/server/services/declaration/pieces-jointes'

describe('Ce qui est prévisualisable dans le tableau de bord', () => {
  it('classe chaque type accepté dans la forme sous laquelle il s’affiche', () => {
    expect(formatApercu('image/jpeg')).toBe('image')
    expect(formatApercu('video/mp4')).toBe('video')
    expect(formatApercu('application/pdf')).toBe('pdf')
  })

  it('n’affiche rien d’autre que ces types', () => {
    // `text/html` est le cas qui compte : rendu dans le contexte de l'application, il exécuterait
    // ce qu'il contient. Il n'est pas acceptable au téléversement, et ne doit pas non plus
    // devenir affichable si une pièce ancienne en portait le type.
    expect(formatApercu('text/html')).toBeNull()
    expect(formatApercu('image/svg+xml')).toBeNull()
    expect(formatApercu('application/octet-stream')).toBeNull()
    expect(formatApercu('')).toBeNull()
  })

  it('tolère la casse et les espaces, tels que la base peut les avoir gardés', () => {
    expect(formatApercu('IMAGE/JPEG')).toBe('image')
    expect(formatApercu(' application/pdf ')).toBe('pdf')
  })

  it('couvre TOUS les types acceptés au téléversement', () => {
    // L'anti-dérive. Les deux listes vivent dans deux modules — l'une décide ce qui entre, l'autre
    // ce qui s'affiche. Un type accepté mais non classé produirait une pièce déposée sans erreur,
    // puis consultable seulement en la téléchargeant : exactement ce que l'aperçu doit supprimer.
    for (const mime of Object.values(TYPES_AUTORISES)) {
      expect(formatApercu(mime), `type accepté mais non affichable : ${mime}`).not.toBeNull()
    }
  })
})
