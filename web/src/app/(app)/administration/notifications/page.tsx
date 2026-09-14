import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { exigerPermission } from '@/server/auth'
import { listerGabarits } from '@/server/services/administration/referentiels'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionSupprimerGabarit } from '../suppressions-actions'
import { actionEnregistrerGabarit } from '../actions'

export const metadata: Metadata = { title: 'Administration — Gabarits de notification' }
export const dynamic = 'force-dynamic'

/** Les adresses JSON sont stockées sans typage fort : lecture défensive. */
function adresses(valeur: unknown): string[] {
  return Array.isArray(valeur) ? valeur.filter((v): v is string => typeof v === 'string') : []
}

export default async function PageGabarits() {
  await exigerPermission('notifications.templates.manage')

  const [gabarits, parcours] = await Promise.all([
    listerGabarits(),
    prisma.parcours.findMany({ orderBy: { ordre: 'asc' }, select: { id: true, libelle: true } }),
  ])

  return (
    <EditeurReferentiel
      titre="Gabarits de notification"
      description="Les messages envoyés au déclarant. Un modèle sans type de déclaration sert à tous."
      colonnes={['Évènement', 'Parcours', 'Canal', 'Objet', 'Destinataires en copie', 'État']}
      lignes={gabarits.map((g) => ({
        id: String(g.id),
        cellules: [
          g.evenement_code,
          g.parcours?.libelle ?? 'Tous',
          g.canal,
          g.objet,
          adresses(g.destinataires_email_supplementaires).join(', ') || '—',
          { badge: g.actif ? 'Actif' : 'Inactif', variant: g.actif ? 'default' : 'secondary' },
        ],
        valeurs: {
          evenementCode: g.evenement_code,
          parcoursId: g.parcours_id === null ? '' : String(g.parcours_id),
          canal: g.canal,
          objet: g.objet,
          corps: g.corps,
          destinatairesSupplementaires: adresses(g.destinataires_email_supplementaires).join(', '),
          actif: g.actif,
        },
      }))}
      champs={[
        { type: 'texte', nom: 'evenementCode', libelle: 'Code évènement', requis: true, max: 100 },
        {
          type: 'liste',
          nom: 'parcoursId',
          libelle: 'Parcours',
          vide: 'Tous les parcours',
          options: parcours.map((p) => ({ valeur: String(p.id), libelle: p.libelle })),
        },
        {
          type: 'liste',
          nom: 'canal',
          libelle: 'Canal',
          requis: true,
          options: [
            { valeur: 'outil', libelle: 'Outil (boîte de réception)' },
            { valeur: 'email', libelle: 'E-mail' },
          ],
        },
        { type: 'texte', nom: 'objet', libelle: 'Objet', requis: true, max: 255 },
        {
          type: 'zone',
          nom: 'corps',
          libelle: 'Corps',
          requis: true,
          max: 5000,
          aide: 'Jetons disponibles : {reference}, {parcours}, {statut}, {jours_restants}.',
        },
        {
          type: 'zone',
          nom: 'destinatairesSupplementaires',
          libelle: 'Destinataires en copie',
          aide: 'Adresses séparées par des virgules, hors rôles (Service Prévention, Directions…).',
        },
        { type: 'booleen', nom: 'actif', libelle: 'Actif' },
      ]}
      action={actionEnregistrerGabarit}
      actionSupprimer={actionSupprimerGabarit}
      creationPossible
      libelleCreation="Ajouter un gabarit"
      messageVide="Aucun gabarit : aucune notification ne peut être émise tant que cette liste est vide."
    />
  )
}
