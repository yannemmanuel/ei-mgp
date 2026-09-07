'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * EX-REP-04 : téléchargement du rapport, au périmètre exactement égal à celui affiché.
 *
 * Les liens recopient les paramètres de filtre de l'URL courante : l'écran et le fichier ne
 * peuvent pas diverger.
 *
 * La case « données nominatives » n'est proposée qu'aux rôles qui la détiennent, mais ce n'est
 * qu'une commodité d'interface — la route revérifie la permission et ignore le paramètre si elle
 * fait défaut (RG-14).
 */
export function BoutonsExport({ peutNominatif }: { peutNominatif: boolean }) {
  const params = useSearchParams()
  const [nominatif, setNominatif] = useState(false)

  function lien(format: 'xlsx' | 'pdf'): string {
    const suivants = new URLSearchParams(params.toString())
    suivants.set('format', format)

    if (nominatif && peutNominatif) suivants.set('nominatif', '1')

    return `/api/exports/dossiers?${suivants.toString()}`
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {peutNominatif && (
        <label className="flex items-center gap-2 text-sm text-secondary-700">
          <input
            type="checkbox"
            checked={nominatif}
            onChange={(e) => setNominatif(e.target.checked)}
          />
          Inclure les données nominatives
        </label>
      )}

      <Button variant="outline" size="sm" render={<a href={lien('xlsx')} download />}>
        Export Excel
      </Button>

      <Button variant="outline" size="sm" render={<a href={lien('pdf')} download />}>
        Export PDF
      </Button>
    </div>
  )
}
