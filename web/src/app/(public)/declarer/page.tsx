import type { Metadata } from 'next'
import { ChoixParcours } from './choix'

export const metadata: Metadata = {
  title: 'Déclarer',
  description: 'Signaler un évènement indésirable, une plainte ou un grief.',
}

/**
 * Point d'entrée UNIQUE de la déclaration (EX-DEC-01/02).
 *
 * Un seul QR code et un seul lien mènent ici : le déclarant choisit lui-même la nature de son
 * signalement, puis, s'il s'agit d'une plainte, à quel titre il la dépose. Les quatre routes
 * `/declarer/{parcours}` restent atteignables directement — un lien déjà diffusé continue de
 * fonctionner.
 */
export default function PageChoixDeclaration() {
  return <ChoixParcours />
}
