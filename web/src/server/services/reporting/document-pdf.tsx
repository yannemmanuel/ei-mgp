import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { cellules, colonnes, type LigneExport } from './export'

/**
 * EX-REP-04 : génération du rapport PDF — le document est composé en React.
 *
 * `@react-pdf/renderer` compose le document en React. La mise
 * en page reprend la structure du rapport attendu
 * (titre, ligne de contexte, tableau) sans chercher à en reproduire le pixel.
 */

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, color: '#1e293b' },
  titre: { fontSize: 14, marginBottom: 2 },
  meta: { fontSize: 8, color: '#64748b', marginBottom: 12 },
  ligne: { flexDirection: 'row' },
  enteteLigne: { flexDirection: 'row', backgroundColor: '#f1f5f9' },
  cellule: {
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  entete: { fontSize: 8 },
  pied: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    fontSize: 7,
    color: '#94a3b8',
    textAlign: 'center',
  },
})

/** Sans largeurs fixes, react-pdf répartit à égalité et les libellés longs débordent. */
const LARGEURS_BASE = [58, 74, 74, 46, 74, 34, 50, 50]
const LARGEURS_NOMINATIVES = [76, 90, 60]

function largeurs(inclureNominatif: boolean): number[] {
  return inclureNominatif ? [...LARGEURS_BASE, ...LARGEURS_NOMINATIVES] : LARGEURS_BASE
}

function RapportDossiers({
  lignes,
  inclureNominatif,
  genereLe,
}: {
  lignes: LigneExport[]
  inclureNominatif: boolean
  genereLe: Date
}) {
  const entetes = colonnes(inclureNominatif)
  const tailles = largeurs(inclureNominatif)

  const horodatage = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(genereLe)

  return (
    <Document title="Rapport des dossiers">
      {/* Paysage dès que les colonnes nominatives s'ajoutent : le portrait ne les tient pas. */}
      <Page size="A4" orientation={inclureNominatif ? 'landscape' : 'portrait'} style={styles.page}>
        <Text style={styles.titre}>Rapport des dossiers</Text>
        <Text style={styles.meta}>
          Généré le {horodatage} — {lignes.length} dossier(s)
        </Text>

        <View style={styles.enteteLigne} fixed>
          {entetes.map((entete, index) => (
            <View key={entete} style={[styles.cellule, { width: tailles[index] }]}>
              <Text style={styles.entete}>{entete}</Text>
            </View>
          ))}
        </View>

        {lignes.map((ligne) => (
          <View key={ligne.reference} style={styles.ligne} wrap={false}>
            {cellules(ligne, inclureNominatif).map((valeur, index) => (
              <View key={entetes[index]} style={[styles.cellule, { width: tailles[index] }]}>
                <Text>{valeur || '—'}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text
          style={styles.pied}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}

export async function rapportPdf(
  lignes: LigneExport[],
  inclureNominatif: boolean,
  genereLe: Date = new Date()
): Promise<Buffer> {
  return renderToBuffer(
    <RapportDossiers lignes={lignes} inclureNominatif={inclureNominatif} genereLe={genereLe} />
  )
}
