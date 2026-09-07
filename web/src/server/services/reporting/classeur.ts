import ExcelJS from 'exceljs'
import { cellules, colonnes, type LigneExport } from './export'

/**
 * EX-REP-04 : génération du classeur Excel — remplace `maatwebsite/excel`.
 *
 * Produit un vrai fichier `.xlsx` (et non un CSV renommé) : les utilisateurs ouvrent ces
 * rapports dans Excel, et un CSV y perd l'encodage des accents et le typage des colonnes.
 */
export async function classeurDossiers(
  lignes: LigneExport[],
  inclureNominatif: boolean
): Promise<Buffer> {
  const classeur = new ExcelJS.Workbook()
  classeur.created = new Date()

  const feuille = classeur.addWorksheet('Dossiers')
  const entetes = colonnes(inclureNominatif)

  feuille.addRow(entetes)
  feuille.getRow(1).font = { bold: true }
  feuille.views = [{ state: 'frozen', ySplit: 1 }]

  for (const ligne of lignes) {
    feuille.addRow(cellules(ligne, inclureNominatif))
  }

  // Largeurs approchées d'après le contenu : un classeur dont toutes les colonnes affichent
  // « #### » est inutilisable, et ExcelJS ne calcule pas l'ajustement automatique.
  feuille.columns.forEach((colonne, index) => {
    const contenus = lignes.map((l) => cellules(l, inclureNominatif)[index] ?? '')
    const plusLong = Math.max(entetes[index]?.length ?? 0, ...contenus.map((c) => c.length))
    colonne.width = Math.min(Math.max(plusLong + 2, 12), 50)
  })

  const tampon = await classeur.xlsx.writeBuffer()
  return Buffer.from(tampon)
}
