import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Pagination commune aux listes.
 *
 * Les paramètres courants sont recopiés dans chaque lien : changer de page ne doit jamais
 * réinitialiser les filtres en vigueur — c'est le défaut le plus courant des listes filtrées, et
 * il se remarque tard, quand on croit lire la page 2 d'un résultat qu'on a en fait quitté.
 */
export function Pagination({
  base,
  parametres,
  page,
  pages,
  total,
  unite,
}: {
  base: string
  parametres: Record<string, string | string[] | undefined>
  page: number
  pages: number
  /** Volumétrie totale, pour situer la page courante dans l'ensemble. */
  total: number
  unite: string
}) {
  if (pages <= 1) return null

  const query = (cible: number) => {
    const suivants: Record<string, string> = {}
    for (const [cle, valeur] of Object.entries(parametres)) {
      const brut = Array.isArray(valeur) ? valeur[0] : valeur
      if (brut !== undefined && cle !== 'page') suivants[cle] = brut
    }

    return { pathname: base, query: { ...suivants, page: String(cible) } }
  }

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-caption text-muted-foreground">
        Page {page} sur {pages} — {total} {unite}
      </p>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          render={page <= 1 ? <span /> : <Link href={query(page - 1)} rel="prev" />}
          className="gap-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Précédent
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          render={page >= pages ? <span /> : <Link href={query(page + 1)} rel="next" />}
          className="gap-1"
        >
          Suivant
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </nav>
  )
}
