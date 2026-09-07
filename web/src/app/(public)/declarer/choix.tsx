'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Choix du parcours — premier écran du point d'entrée unique.
 *
 * Un seul QR code et un seul lien mènent ici ; c'est le déclarant qui oriente sa déclaration.
 * Deux conséquences voulues : un seul support à imprimer et à afficher partout, et plus aucun
 * risque qu'une affiche périmée envoie vers le mauvais parcours.
 *
 * Le vocabulaire est celui du déclarant, pas celui du système : « ce qui vous est arrivé »
 * plutôt que « parcours ». Quelqu'un qui hésite entre un incident et une plainte ne connaît pas
 * notre nomenclature.
 */
type Option = {
  readonly code: string
  readonly titre: string
  readonly description: string
}

const PLAINTES: Option[] = [
  {
    code: 'grief_employe',
    titre: 'Je suis employé de l’entreprise',
    description: 'Une situation professionnelle que vous jugez préjudiciable.',
  },
  {
    code: 'grief_sous_traitant',
    titre: 'Je travaille pour un sous-traitant',
    description: 'Conditions de travail, paiement, sécurité sur un chantier.',
  },
  {
    code: 'grief_communaute',
    titre: 'Je suis riverain ou membre de la communauté',
    description: 'Nuisance, dommage ou différend lié aux activités de l’entreprise.',
  },
]

export function ChoixParcours() {
  const [etape, setEtape] = useState<'nature' | 'plainte'>('nature')

  if (etape === 'plainte') {
    return (
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => setEtape('nature')}
          className="text-sm text-muted-foreground hover:text-secondary-900"
        >
          ← Revenir
        </button>

        <h1 className="mt-4 font-serif text-h1 text-secondary-900">À quel titre déposez-vous ?</h1>
        <p className="mt-2 text-sm text-secondary-600">
          Cette réponse détermine les questions qui vous seront posées, et l’équipe qui traitera
          votre dossier.
        </p>

        <div className="mt-8 space-y-3">
          {PLAINTES.map((option) => (
            <Carte key={option.code} option={option} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-h1 text-secondary-900">Que souhaitez-vous signaler ?</h1>
      <p className="mt-2 text-sm text-secondary-600">
        Vous pourrez rester anonyme à l’étape suivante, quel que soit votre choix.
      </p>

      <div className="mt-8 space-y-3">
        <Carte
          option={{
            code: 'ei_employe',
            titre: 'Un évènement indésirable',
            description:
              'Un incident, un presque-accident ou une situation dangereuse constatée sur le site.',
          }}
        />

        <button
          type="button"
          onClick={() => setEtape('plainte')}
          className="block w-full rounded-lg border border-border p-5 text-left transition-colors hover:border-primary-600 hover:bg-muted/40"
        >
          <span className="block text-h3 text-secondary-900">Une plainte ou un grief</span>
          <span className="mt-1 block text-sm text-secondary-600">
            Un désaccord, un préjudice ou un manquement que vous souhaitez porter à notre
            connaissance.
          </span>
          <span className="mt-3 block text-caption text-primary-700">Préciser →</span>
        </button>
      </div>

      <p className="mt-8 text-caption text-secondary-500">
        Vous ne savez pas où classer votre situation ? Choisissez ce qui vous semble le plus
        proche : le service compétent réorientera votre dossier si nécessaire, sans que vous ayez
        à le redéposer.
      </p>
    </div>
  )
}

function Carte({ option }: { option: Option }) {
  return (
    <Button
      variant="outline"
      className="block h-auto w-full whitespace-normal rounded-lg border-border p-5 text-left hover:border-primary-600 hover:bg-muted/40"
      render={<Link href={`/declarer/${option.code}`} />}
    >
      <span className="block text-h3 text-secondary-900">{option.titre}</span>
      <span className="mt-1 block text-sm font-normal text-secondary-600">
        {option.description}
      </span>
    </Button>
  )
}
