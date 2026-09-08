export type SectionDossier = {
  readonly id: string
  readonly libelle: string
  /** Volumétrie de la section, quand elle en a une. `null` = section sans décompte. */
  readonly nombre?: number | null
}

/**
 * Sommaire des sections du dossier.
 *
 * La fiche empile jusqu'à sept cartes — description, identité, pièces jointes, investigations,
 * actions correctives, messagerie, historique. Sur un dossier vivant, cela représente deux à
 * trois écrans de défilement, sans moyen de savoir avant d'y arriver s'il y a des messages en
 * attente ou une investigation en cours.
 *
 * Le sommaire répond aux deux questions d'un coup : ce que contient ce dossier, et comment y
 * aller directement. Les décomptes en sont la partie utile — « Messagerie 3 » se lit sans
 * défiler.
 *
 * Ce sont de simples ancres : aucun JavaScript, et l'adresse reste partageable — c'est ce qui
 * permet aux listes transverses de pointer vers `#investigations`.
 */
export function SommaireDossier({ sections }: { sections: readonly SectionDossier[] }) {
  return (
    <nav
      aria-label="Sections du dossier"
      className="sticky top-14 z-20 -mx-4 border-b border-border bg-background/95 px-4 backdrop-blur lg:-mx-6 lg:px-6"
    >
      <ul className="flex gap-1 overflow-x-auto py-2">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium text-secondary-600 transition-colors hover:bg-muted hover:text-secondary-900"
            >
              {section.libelle}
              {typeof section.nombre === 'number' && section.nombre > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-secondary-600">
                  {section.nombre}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
