import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { exigerPermission, utilisateurCourant } from '@/server/auth'
import { peutVoirAdresseIpAudit } from '@/server/authz'
import { actionsConnues, consulterJournal } from '@/server/services/audit/consultation'
import { FiltresAudit } from './filtres'

export const metadata: Metadata = { title: 'Journal d’audit' }
export const dynamic = 'force-dynamic'

/**
 * Consultation du journal d'audit (docs/exigences-audit.md §4) — port de
 * `App\Livewire\Audit\AuditLogViewer`.
 *
 * **Lecture seule, sans exception.** Aucune action d'écriture n'est exposée ici, et aucune ne
 * doit l'être : le journal est en ajout seul, y compris pour un administrateur (§3).
 */
export default async function PageAudit({ searchParams }: PageProps<'/audit'>) {
  await exigerPermission('audit.view')

  // Rechargé après le contrôle de permission : la restriction §5 porte sur les RÔLES, pas sur la
  // permission `audit.view` — `service_mgp` la détient sans pour autant voir les adresses IP.
  const utilisateur = await utilisateurCourant()
  const voitAdresseIp = utilisateur !== null && peutVoirAdresseIpAudit(utilisateur)

  const parametres = await searchParams
  const seule = (valeur: string | string[] | undefined) =>
    (Array.isArray(valeur) ? valeur[0] : valeur) ?? ''

  const action = seule(parametres.action)
  const dateDebut = seule(parametres.dateDebut)
  const dateFin = seule(parametres.dateFin)
  const page = Number(seule(parametres.page) || '1')

  const [journal, actions] = await Promise.all([
    consulterJournal(
      {
        action,
        dateDebut: dateDebut === '' ? null : new Date(dateDebut),
        dateFin: dateFin === '' ? null : new Date(dateFin),
      },
      page,
      voitAdresseIp
    ),
    actionsConnues(),
  ])

  const lien = (numero: number) => {
    const suivants = new URLSearchParams()
    if (action !== '') suivants.set('action', action)
    if (dateDebut !== '') suivants.set('dateDebut', dateDebut)
    if (dateFin !== '') suivants.set('dateFin', dateFin)
    suivants.set('page', String(numero))

    return `/audit?${suivants.toString()}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 text-secondary-900">Journal d’audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {journal.total} entrée(s). Ce journal est en ajout seul : aucune ligne ne peut être
          modifiée ni supprimée, par aucun rôle.
        </p>
      </div>

      <FiltresAudit actions={actions} valeurs={{ action, dateDebut, dateFin }} />

      {!voitAdresseIp && (
        <Alert>
          <AlertDescription>
            L’adresse IP et le navigateur d’origine ne sont pas affichés pour votre rôle. Ces
            données ne sont consultables que par le DPO et l’auditeur, en cas d’enquête sur un
            abus : elles pourraient permettre de réidentifier un déclarant anonyme.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {journal.lignes.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Aucune entrée sur ce périmètre.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2 font-medium text-muted-foreground">Horodatage</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">Action</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">Acteur</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">Objet</th>
                    <th className="px-4 py-2 font-medium text-muted-foreground">Changement</th>
                    {voitAdresseIp && (
                      <th className="px-4 py-2 font-medium text-muted-foreground">Origine</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {journal.lignes.map((ligne) => (
                    <tr key={ligne.id} className="border-b border-border/50 align-top">
                      <td className="whitespace-nowrap px-4 py-2 text-secondary-800">
                        {horodatage(ligne.horodatage)}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary" className="font-normal">
                          {ligne.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-secondary-800">{ligne.acteur ?? 'Système'}</td>
                      <td className="px-4 py-2 text-caption text-muted-foreground">
                        {ligne.auditableType ? nomCourt(ligne.auditableType) : '—'}
                        {ligne.auditableId && (
                          <span className="block font-mono">{ligne.auditableId}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Changement anciennes={ligne.anciennes} nouvelles={ligne.nouvelles} />
                      </td>
                      {voitAdresseIp && (
                        <td className="px-4 py-2 text-caption text-muted-foreground">
                          {ligne.adresseIp ?? '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {journal.pages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={journal.page <= 1}
            render={journal.page > 1 ? <Link href={lien(journal.page - 1)} /> : <button />}
          >
            Précédent
          </Button>

          <span className="text-caption text-muted-foreground">
            Page {journal.page} sur {journal.pages}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={journal.page >= journal.pages}
            render={journal.page < journal.pages ? <Link href={lien(journal.page + 1)} /> : <button />}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  )
}

const horodatage = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso))

/** `App\Models\Dossier` → `Dossier` : le préfixe de namespace n'apprend rien au lecteur. */
const nomCourt = (type: string) => type.split('\\').pop() ?? type

function Changement({ anciennes, nouvelles }: { anciennes: unknown; nouvelles: unknown }) {
  const avant = objet(anciennes)
  const apres = objet(nouvelles)

  if (apres === null) return <span className="text-muted-foreground">—</span>

  return (
    <dl className="space-y-0.5 text-caption">
      {Object.entries(apres).map(([cle, valeur]) => (
        <div key={cle}>
          <dt className="inline text-muted-foreground">{cle} : </dt>
          <dd className="inline text-secondary-800">
            {avant && cle in avant && (
              <>
                <span className="line-through opacity-60">{affichable(avant[cle])}</span>{' '}
                <span aria-hidden="true">→</span>{' '}
              </>
            )}
            {affichable(valeur)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function objet(valeur: unknown): Record<string, unknown> | null {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Record<string, unknown>)
    : null
}

/** Une valeur d'audit peut être n'importe quel JSON : elle est rendue lisible, jamais brute. */
function affichable(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '∅'
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non'
  if (typeof valeur === 'object') return JSON.stringify(valeur)

  const texte = String(valeur)
  return texte.length > 120 ? `${texte.slice(0, 120)}…` : texte
}
