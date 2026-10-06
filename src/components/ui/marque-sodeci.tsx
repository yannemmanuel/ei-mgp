import Image from 'next/image'
import { cn } from '@/lib/utils'

/** Ce à quoi sert la plateforme, dit en une ligne sous le logo. */
export const SOUS_TITRE_PLATEFORME = 'Déclaration des plaintes et évènements indésirables'

/**
 * Logo officiel SODECI, suivi du sous-titre de la plateforme.
 *
 * Le logo seul ne dit pas à quoi sert le site : quelqu'un qui arrive par un QR code doit
 * comprendre d'un coup d'œil qu'il peut y déclarer une plainte ou un évènement indésirable.
 *
 * Fichier recadré et à fond transparent (`public/logo-sodeci.png`, 698 × 200) : il se pose sur
 * les fonds teintés des panneaux comme sur le blanc des cartes.
 */
export function MarqueSodeci({
  sousTitre = SOUS_TITRE_PLATEFORME,
  className,
  tailleLogo = 'h-9',
  prioritaire = false,
}: {
  /** `null` pour n'afficher que le logo. */
  sousTitre?: string | null
  className?: string
  /** Hauteur Tailwind du logo ; la largeur suit. */
  tailleLogo?: string
  /** À activer pour un logo visible dès l'ouverture (au-dessus de la ligne de flottaison). */
  prioritaire?: boolean
}) {
  return (
    <span className={cn('flex min-w-0 flex-col gap-1', className)}>
      <Image
        src="/logo-sodeci.png"
        alt="SODECI"
        width={698}
        height={200}
        priority={prioritaire}
        className={cn('w-auto max-w-full self-start', tailleLogo)}
      />
      {sousTitre && (
        <span className="text-[11px] font-semibold leading-snug text-secondary-600">
          {sousTitre}
        </span>
      )}
    </span>
  )
}
