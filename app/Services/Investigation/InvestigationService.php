<?php

namespace App\Services\Investigation;

use App\Enums\StatutDossierCode;
use App\Enums\StatutInvestigation;
use App\Models\Dossier;
use App\Models\Investigation;
use App\Models\User;
use App\Services\Workflow\DelaiService;
use Illuminate\Support\Carbon;
use RuntimeException;

/**
 * Point d'entrée unique du cycle de vie d'une fiche d'investigation (CDC §9.5, EX-INV-01 à 05) :
 * ouverture, mise à jour des constats/causes/recommandations, soumission puis validation
 * hiérarchique. Chaque règle métier citée est revérifiée ici, pas seulement côté formulaire ou
 * Policy — même principe que AffectationService/DossierWorkflowService (Phases 5/6).
 */
class InvestigationService
{
    public function __construct(private readonly DelaiService $delaiService) {}

    /**
     * @param  array{date_ouverture: string, faits_constates: string, personnes_rencontrees: ?string, cause_immediate: ?string, causes_racines: ?string, recommandations: string}  $donnees
     */
    public function ouvrir(Dossier $dossier, User $enqueteur, array $donnees): Investigation
    {
        if ($dossier->statut->code !== StatutDossierCode::EnInvestigation) {
            throw new RuntimeException('Une fiche d\'investigation ne peut être ouverte que sur un dossier "En investigation".');
        }

        // RGI-05 : la date de recevabilité correspond à l'entrée la plus récente du dossier dans
        // le statut "En investigation" — même calcul que DelaiService::dateDebutEtape (Phase 6),
        // volontairement réutilisé plutôt que réimplémenté (cf. docs/decisions-techniques.md DT-23).
        $dateRecevabilite = $this->delaiService->dateDebutEtape($dossier);

        if ($dateRecevabilite === null) {
            throw new RuntimeException('Impossible de déterminer la date de recevabilité du dossier : historique de statut incomplet.');
        }

        $dateOuverture = Carbon::parse($donnees['date_ouverture']);

        if ($dateOuverture->startOfDay()->lt($dateRecevabilite->startOfDay())) {
            throw new RuntimeException('La date d\'ouverture ne peut être antérieure à la date de recevabilité du dossier (RGI-05).');
        }

        return Investigation::create([
            'dossier_id' => $dossier->id,
            'enqueteur_id' => $enqueteur->id,
            'date_ouverture' => $dateOuverture->toDateString(),
            'faits_constates' => $donnees['faits_constates'],
            'personnes_rencontrees' => $donnees['personnes_rencontrees'] ?: null,
            'cause_immediate' => $donnees['cause_immediate'] ?: null,
            'causes_racines' => $donnees['causes_racines'] ?: null,
            'recommandations' => $donnees['recommandations'],
            'statut' => StatutInvestigation::EnCours,
        ]);
    }

    /**
     * @param  array{faits_constates: string, personnes_rencontrees: ?string, cause_immediate: ?string, causes_racines: ?string, recommandations: string}  $donnees
     */
    public function mettreAJour(Investigation $investigation, array $donnees): void
    {
        if ($investigation->statut !== StatutInvestigation::EnCours) {
            throw new RuntimeException('Une investigation soumise pour validation ou déjà validée ne peut plus être modifiée.');
        }

        $investigation->update([
            'faits_constates' => $donnees['faits_constates'],
            'personnes_rencontrees' => $donnees['personnes_rencontrees'] ?: null,
            'cause_immediate' => $donnees['cause_immediate'] ?: null,
            'causes_racines' => $donnees['causes_racines'] ?: null,
            'recommandations' => $donnees['recommandations'],
        ]);
    }

    /** EX-INV-04 : les recommandations sont la source des actions correctives (Phase 8) — obligatoires avant soumission. */
    public function soumettrePourValidation(Investigation $investigation): void
    {
        if ($investigation->statut !== StatutInvestigation::EnCours) {
            throw new RuntimeException('Seule une investigation "en cours" peut être soumise pour validation.');
        }

        if (trim($investigation->recommandations) === '') {
            throw new RuntimeException('Les recommandations sont obligatoires avant soumission pour validation (EX-INV-04).');
        }

        $investigation->update(['statut' => StatutInvestigation::EnAttenteValidation]);
    }

    /** RGI-06 : revérifié ici, en plus de InvestigationPolicy::validateInvestigation. */
    public function valider(Investigation $investigation, User $validateur): void
    {
        if ($investigation->statut !== StatutInvestigation::EnAttenteValidation) {
            throw new RuntimeException('Seule une investigation "en attente de validation" peut être validée.');
        }

        if ($investigation->enqueteur_id === $validateur->id) {
            throw new RuntimeException('La validation hiérarchique ne peut être effectuée par l\'enquêteur lui-même (RGI-06).');
        }

        $investigation->update([
            'statut' => StatutInvestigation::Validee,
            'valide_par' => $validateur->id,
            'valide_le' => now(),
        ]);
    }
}
