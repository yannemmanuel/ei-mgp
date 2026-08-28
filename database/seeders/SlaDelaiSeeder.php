<?php

namespace Database\Seeders;

use App\Enums\EtapeDelai;
use App\Enums\ParcoursCode;
use App\Enums\UniteDelai;
use App\Models\Parcours;
use App\Models\SlaDelai;
use Illuminate\Database\Seeder;

/**
 * Délais maximaux par étape et par parcours (CDC §11.2). Les lignes marquées
 * est_valide_metier=false correspondent aux cellules « à valider » du CDC (point d'arbitrage
 * §1.8 n°4, docs/decisions-techniques.md DT-04) : une valeur indicative est tout de même
 * enregistrée pour que le moteur de délais (Phase 6) reste exploitable dès que le métier
 * confirmera la valeur définitive, sans nécessiter de déploiement.
 *
 * "Captage" n'a pas de ligne (accusé de réception synchrone, cf. App\Enums\EtapeDelai). Pour EI
 * Employé, "Retour d'information" et "Retour après résolution" sont marqués "automatique" dans
 * le CDC : aucune ligne n'est créée pour ces deux étapes sur ce parcours (rien à surveiller).
 * Pour "Clôture, suivi et évaluation", le CDC donne une plage (ex. "3 à 6 mois") : la borne
 * maximale est retenue, cohérente avec le titre de la section 11.2 ("délais maximaux").
 */
class SlaDelaiSeeder extends Seeder
{
    /**
     * @var array<string, array<string, array{0: int, 1: UniteDelai, 2: bool}>>
     */
    private const DELAIS = [
        ParcoursCode::EiEmploye->value => [
            EtapeDelai::AnalysePreliminaire->value => [3, UniteDelai::JoursOuvres, false],
            EtapeDelai::TraitementEnquete->value => [15, UniteDelai::JoursOuvres, false],
            EtapeDelai::MiseEnOeuvreMesures->value => [30, UniteDelai::JoursOuvres, false],
            EtapeDelai::Cloture->value => [6, UniteDelai::Mois, true],
        ],
        ParcoursCode::GriefEmploye->value => [
            EtapeDelai::AnalysePreliminaire->value => [3, UniteDelai::JoursOuvres, true],
            EtapeDelai::TraitementEnquete->value => [1, UniteDelai::Mois, true],
            EtapeDelai::RetourInformation->value => [3, UniteDelai::JoursOuvres, true],
            EtapeDelai::MiseEnOeuvreMesures->value => [30, UniteDelai::JoursOuvres, false],
            EtapeDelai::RetourResolution->value => [2, UniteDelai::JoursOuvres, true],
            EtapeDelai::Cloture->value => [6, UniteDelai::Mois, true],
        ],
        ParcoursCode::GriefSousTraitant->value => [
            EtapeDelai::AnalysePreliminaire->value => [3, UniteDelai::JoursOuvres, true],
            EtapeDelai::TraitementEnquete->value => [2, UniteDelai::Semaines, true],
            EtapeDelai::RetourInformation->value => [3, UniteDelai::JoursOuvres, true],
            EtapeDelai::MiseEnOeuvreMesures->value => [30, UniteDelai::JoursOuvres, false],
            EtapeDelai::RetourResolution->value => [2, UniteDelai::JoursOuvres, true],
            EtapeDelai::Cloture->value => [6, UniteDelai::Mois, true],
        ],
        ParcoursCode::GriefCommunaute->value => [
            EtapeDelai::AnalysePreliminaire->value => [3, UniteDelai::JoursOuvres, true],
            EtapeDelai::TraitementEnquete->value => [2, UniteDelai::Semaines, true],
            EtapeDelai::RetourInformation->value => [3, UniteDelai::JoursOuvres, true],
            EtapeDelai::MiseEnOeuvreMesures->value => [30, UniteDelai::JoursOuvres, false],
            EtapeDelai::RetourResolution->value => [2, UniteDelai::JoursOuvres, true],
            EtapeDelai::Cloture->value => [6, UniteDelai::Mois, true],
        ],
    ];

    public function run(): void
    {
        foreach (self::DELAIS as $parcoursCode => $etapes) {
            $parcours = Parcours::query()->where('code', $parcoursCode)->firstOrFail();

            foreach ($etapes as $etapeCode => [$valeur, $unite, $valide]) {
                SlaDelai::query()->updateOrCreate(
                    ['parcours_id' => $parcours->id, 'etape_code' => $etapeCode],
                    [
                        'valeur' => $valeur,
                        'unite' => $unite->value,
                        'est_valide_metier' => $valide,
                        'notes' => $valide ? null : 'Valeur indicative en attente de validation métier (CDC §1.8 point 4).',
                    ]
                );
            }
        }
    }
}
