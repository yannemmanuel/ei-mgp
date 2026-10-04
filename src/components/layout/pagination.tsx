import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({
  base,
  parametres,
  page,
  pages,
  total,
  unite,
}: {
  base: string;
  parametres: Record<string, string | string[] | undefined>;
  page: number;
  pages: number;
  total: number;
  unite: string;
}) {
  if (pages <= 1) return null;

  const query = (cible: number) => {
    const suivants: Record<string, string> = {};
    for (const [cle, valeur] of Object.entries(parametres)) {
      const brut = Array.isArray(valeur) ? valeur[0] : valeur;
      if (brut !== undefined && cle !== "page") suivants[cle] = brut;
    }
    return { pathname: base, query: { ...suivants, page: String(cible) } };
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/75 px-3 py-2.5 shadow-xs sm:px-4"
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Page <span className="font-semibold text-secondary-800">{page}</span>{" "}
        sur <span className="font-semibold text-secondary-800">{pages}</span>{" "}
        &bull; <span className="font-semibold text-secondary-800">{total}</span>{" "}
        {unite}
      </p>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          render={
            page <= 1 ? <span /> : <Link href={query(page - 1)} rel="prev" />
          }
          className="gap-1 rounded-xl border-border/80 h-9 px-3 text-xs font-medium"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Précédent
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          render={
            page >= pages ? (
              <span />
            ) : (
              <Link href={query(page + 1)} rel="next" />
            )
          }
          className="gap-1 rounded-xl border-border/80 h-9 px-3 text-xs font-medium"
        >
          Suivant
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
