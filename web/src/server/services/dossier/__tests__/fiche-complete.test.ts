import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { PARCOURS, CODES_PARCOURS } from '../../declaration/parcours-config'

/**
 * Rien de ce qu'on demande au déclarant ne doit rester invisible dans la fiche.
 *
 * ⚠️ Treize colonnes ont été collectées puis jamais affichées — la ville d'un riverain, pourtant
 * OBLIGATOIRE, l'entreprise d'un sous-traitant, le poste, la solution souhaitée. Le formulaire les
 * demandait, la base les gardait, et l'écran de traitement n'en montrait rien. Une information
 * qu'on exige de quelqu'un sans jamais la relire n'aurait pas dû être demandée.
 *
 * Le contrôle est fait sur la SOURCE : la fiche est un composant serveur, et le rendre hors
 * requête exigerait un décor qui ne prouverait rien de plus.
 */
const BASE = 'src/app/(app)/dossiers/[id]/'

function sourceDeLaFiche(): string {
  return readdirSync(BASE)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => readFileSync(BASE + f, 'utf8'))
    .join('\n')
}

/**
 * Ce qu'il faut trouver dans la fiche pour qu'un champ soit considéré comme affiché.
 *
 * Le plus souvent la colonne, telle que `creerDeclaration` l'écrit. Les deux directions font
 * exception : ce sont des clés étrangères, et la fiche montre le LIBELLÉ via la relation —
 * chercher `direction_id` n'y prouverait rien.
 */
const COLONNE: Record<string, string> = {
  lieu: 'lieu',
  lieuSite: 'lieu',
  dateSurvenance: 'date_survenance',
  dateHeureFaits: 'date_survenance',
  caractereRepetitif: 'caractere_repetitif',
  propositionMesureCorrective: 'proposition_mesure_corrective',
  solutionSouhaitee: 'proposition_mesure_corrective',
  entreprise: 'entreprise',
  posteOccupe: 'poste',
  ville: 'ville',
  precisionLocalisation: 'precision_localisation',
  statutPlaignant: 'statut_plaignant',
  declarantEstVictime: 'declarant_est_victime',
  directionId: 'dossier.directions?.libelle',
  directionDeclarant: 'direction_declarant_idTodirections',
  posteDeclarant: 'poste_declarant',
}

describe('La fiche montre tout ce que la déclaration collecte', () => {
  it('⚠️ n’oublie aucun champ du formulaire', () => {
    const source = sourceDeLaFiche()
    const oublies = new Set<string>()

    for (const code of CODES_PARCOURS) {
      for (const champ of PARCOURS[code].champs) {
        // Les champs d'IDENTITÉ ont leur propre bloc, conditionné au droit de les voir.
        if (champ.identite) continue

        const colonne = COLONNE[champ.nom]
        // Un champ sans correspondance connue signale une colonne ajoutée sans que ce test suive.
        expect(colonne, `${code}/${champ.nom} : colonne cible inconnue de ce test`).toBeDefined()

        if (colonne && !source.includes(colonne)) oublies.add(`${code}/${champ.nom} → ${colonne}`)
      }
    }

    expect([...oublies], `collectés mais jamais affichés : ${[...oublies].join(', ')}`).toEqual([])
  })

  it('affiche aussi les précisions « Autre »', () => {
    // « Autre » sans sa précision ne dit rien à qui traite le dossier — c'est même toute la raison
    // pour laquelle la saisie libre existe.
    const source = sourceDeLaFiche()

    for (const colonne of ['poste_precision', 'statut_plaignant_precision', 'poste_declarant_precision', 'categorie_autre_precision']) {
      expect(source, `${colonne} n’est affichée nulle part`).toContain(colonne)
    }
  })

  it('traduit les valeurs codées plutôt que de les rendre brutes', () => {
    /*
      `caractere_repetitif` vaut « premiere_fois » en base, `statut_plaignant` vaut
      « chef_coutumier ». Ils s'affichaient tels quels : lisibles pour qui a écrit le formulaire,
      obscurs pour qui traite un dossier six mois plus tard.
    */
    const source = sourceDeLaFiche()

    expect(source, 'la traduction des valeurs codées a disparu').toContain('libelleValeur(')
    expect(source).toMatch(/libelleValeur\([\s\S]{0,120}'caractereRepetitif'/)
    expect(source).toMatch(/libelleValeur\([\s\S]{0,160}'statutPlaignant'/)
  })

  it('⚠️ lit les colonnes déplacées à leurs DEUX emplacements', () => {
    /*
      L'entreprise et la qualité du plaignant ont changé de table : elles vivaient dans
      `declaration_identites`, où une déclaration anonyme ne crée aucune ligne. Les déclarations
      antérieures les portent encore à l'ancien endroit — ne lire que le nouveau viderait leur
      fiche sans rien casser de visible.
    */
    const source = sourceDeLaFiche()

    expect(source).toMatch(/dossier\.entreprise \?\?[\s\S]{0,80}declaration_identites\?\.entreprise/)
    expect(source).toMatch(
      /dossier\.statut_plaignant \?\?[\s\S]{0,80}declaration_identites\?\.statut_plaignant/
    )
  })
})
