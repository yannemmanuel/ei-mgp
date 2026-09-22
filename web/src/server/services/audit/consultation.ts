import { prisma } from '@/lib/prisma'

/**
 * Lecture du journal d'audit
 *
 * Ce module n'expose QUE de la lecture, et ne doit jamais exposer autre chose : `audit_logs` est
 * en ajout seul (docs/exigences-audit.md §3), sans exception, y compris pour un administrateur.
 */

const PAR_PAGE = 25

export type FiltreAudit = {
  readonly action?: string
  readonly dateDebut?: Date | null
  readonly dateFin?: Date | null
}

export type LigneAudit = {
  id: string
  action: string
  auditableType: string | null
  auditableId: string | null
  acteur: string | null
  anciennes: unknown
  nouvelles: unknown
  /** Non renseignés si le lecteur n'est pas DPO ou auditeur (§5). */
  adresseIp: string | null
  agent: string | null
  horodatage: string
}

function clause(filtre: FiltreAudit) {
  const conditions: Record<string, unknown> = {}

  if (filtre.action && filtre.action.trim() !== '') {
    conditions.action = { contains: filtre.action.trim(), mode: 'insensitive' }
  }

  if (filtre.dateDebut || filtre.dateFin) {
    const intervalle: { gte?: Date; lte?: Date } = {}

    if (filtre.dateDebut) {
      const debut = new Date(filtre.dateDebut)
      debut.setHours(0, 0, 0, 0)
      intervalle.gte = debut
    }

    if (filtre.dateFin) {
      // Borne de fin INCLUSIVE : sinon la journée entière
      // sélectionnée serait exclue.
      const fin = new Date(filtre.dateFin)
      fin.setHours(23, 59, 59, 999)
      intervalle.lte = fin
    }

    conditions.created_at = intervalle
  }

  return conditions
}

export type PageAudit = {
  lignes: LigneAudit[]
  total: number
  page: number
  pages: number
}

/**
 * @param voitAdresseIp Décidé par `peutVoirAdresseIpAudit()`, jamais par l'appelant lui-même.
 *   Quand il est faux, l'IP et le user-agent ne sont pas seulement masqués à l'affichage : ils
 *   ne sont pas lus. Un rôle de traitement ne doit disposer d'aucune trace permettant de
 *   réidentifier un déclarant anonyme (§5).
 */
export async function consulterJournal(
  filtre: FiltreAudit,
  page = 1,
  voitAdresseIp = false
): Promise<PageAudit> {
  const where = clause(filtre)
  const pageDemandee = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1

  const [total, lignes] = await Promise.all([
    prisma.audit_logs.count({ where }),
    prisma.audit_logs.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (pageDemandee - 1) * PAR_PAGE,
      take: PAR_PAGE,
      select: {
        id: true,
        action: true,
        auditable_type: true,
        auditable_id: true,
        old_values: true,
        new_values: true,
        created_at: true,
        users: { select: { name: true } },
        ip_address: voitAdresseIp,
        user_agent: voitAdresseIp,
      },
    }),
  ])

  return {
    total,
    page: pageDemandee,
    pages: Math.max(1, Math.ceil(total / PAR_PAGE)),
    lignes: lignes.map((l) => ({
      id: String(l.id),
      action: l.action,
      auditableType: l.auditable_type,
      auditableId: l.auditable_id,
      acteur: l.users?.name ?? null,
      anciennes: l.old_values,
      nouvelles: l.new_values,
      adresseIp: voitAdresseIp ? (l.ip_address ?? null) : null,
      agent: voitAdresseIp ? (l.user_agent ?? null) : null,
      horodatage: l.created_at.toISOString(),
    })),
  }
}

/** Actions distinctes présentes dans le journal, pour proposer un filtre qui a du sens. */
export async function actionsConnues(): Promise<string[]> {
  const lignes = await prisma.audit_logs.groupBy({ by: ['action'], orderBy: { action: 'asc' } })

  return lignes.map((l) => l.action)
}
