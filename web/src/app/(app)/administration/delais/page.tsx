import type { Metadata } from 'next'
import { exigerPermission } from '@/server/auth'
import { prisma } from '@/lib/prisma'
import {
  ETAPES_DELAI,
  LIBELLES_ETAPE,
  LIBELLES_UNITE,
  UNITES_DELAI,
  etapeProduitUneEcheance,
  listerDelais,
} from '@/server/services/administration/delais'
import type { EtapeDelai } from '@/server/services/dossier/delais'
import { EditeurReferentiel } from '../editeur-referentiel'
import { actionModifierDelai } from '../actions'

export const metadata: Metadata = { title: 'Administration — Délais' }
export const dynamic = 'force-dynamic'

export default async function PageDelais() {
  await exigerPermission('referentiels.delais.manage')

  const [delais, parcours] = await Promise.all([
    listerDelais(),
    prisma.parcours.findMany({ orderBy: { ordre: 'asc' }, select: { id: true, libelle: true } }),
  ])

  return (
    <EditeurReferentiel
      titre="Délais de traitement"
      description="Délais maximaux par étape et par parcours (CDC §11.2). Tant qu’un délai n’est pas validé, AUCUNE échéance n’est calculée pour cette étape : ni relance à J-3, ni escalade."
      colonnes={['Parcours', 'Étape', 'Délai', 'Suivi', 'Note']}
      lignes={delais.map((d) => ({
        id: String(d.id),
        cellules: [
          d.parcours.libelle,
          LIBELLES_ETAPE[d.etape_code as EtapeDelai] ?? d.etape_code,
          `${d.valeur} ${LIBELLES_UNITE[d.unite as keyof typeof LIBELLES_UNITE] ?? d.unite}`,
          etatSuivi(d.etape_code, d.est_valide_metier),
          d.notes ?? '—',
        ],
        valeurs: {
          parcoursId: '',
          etapeCode: '',
          valeur: String(d.valeur),
          unite: d.unite,
          estValideMetier: d.est_valide_metier,
          notes: d.notes ?? '',
        },
      }))}
      champs={[
        {
          type: 'liste',
          nom: 'parcoursId',
          libelle: 'Parcours (création seulement)',
          options: parcours.map((p) => ({ valeur: String(p.id), libelle: p.libelle })),
        },
        {
          type: 'liste',
          nom: 'etapeCode',
          libelle: 'Étape (création seulement)',
          options: ETAPES_DELAI.map((e) => ({
            valeur: e,
            libelle: etapeProduitUneEcheance(e)
              ? LIBELLES_ETAPE[e]
              : `${LIBELLES_ETAPE[e]} — sans effet`,
          })),
        },
        { type: 'nombre', nom: 'valeur', libelle: 'Valeur', requis: true, min: 1 },
        {
          type: 'liste',
          nom: 'unite',
          libelle: 'Unité',
          requis: true,
          options: UNITES_DELAI.map((u) => ({ valeur: u, libelle: LIBELLES_UNITE[u] })),
        },
        {
          type: 'booleen',
          nom: 'estValideMetier',
          libelle: 'Validé par le métier — active le suivi d’échéance',
        },
        {
          type: 'zone',
          nom: 'notes',
          libelle: 'Note',
          aide: 'Contexte de la valeur retenue, à l’usage des personnes qui la reliront.',
        },
      ]}
      action={actionModifierDelai}
      creationPossible
      libelleCreation="Ajouter un délai"
    />
  )
}

/**
 * Deux conditions doivent être réunies pour qu'un délai déclenche quoi que ce soit : être validé
 * par le métier (DT-04), et porter sur une étape rattachée à un statut.
 *
 * Deux étapes ne le sont pas — « Retour d'information », qu'aucun statut ne déclenche, et
 * « Clôture », qui porte le délai global qu'aucun traitement n'évalue aujourd'hui. Les afficher
 * comme réglables sans le dire laisserait croire à un suivi qui n'existe pas.
 */
function etatSuivi(etape: string, valide: boolean) {
  if (!etapeProduitUneEcheance(etape)) {
    return { badge: 'Sans effet', variant: 'secondary' as const }
  }

  return valide
    ? { badge: 'Suivi actif', variant: 'default' as const }
    : { badge: 'Provisoire', variant: 'destructive' as const }
}
