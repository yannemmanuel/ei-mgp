<?php

namespace App\Services\Workflow;

use App\Enums\EtapeDelai;
use App\Enums\StatutDossierCode;
use App\Enums\UniteDelai;
use App\Models\Dossier;
use App\Models\HistoriqueStatut;
use App\Models\SlaDelai;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

/**
 * Suivi des délais maximaux par étape (CDC §11.2). Sert de socle commun à l'affichage d'échéance
 * dans le Module 2 (Phase 6) et aux relances/alertes du Module 5 (Phase 9, EX-NOT-03/04) : les
 * deux s'appuient sur le même calcul, jamais deux implémentations séparées du même délai.
 *
 * cf. docs/decisions-techniques.md — le CDC §6 (processus par parcours) et §7.1 (statuts
 * internes) ne partagent pas exactement la même granularité : "Retour d'information au
 * plaignant" (§6, étape 4) n'a pas de statut interne dédié dans §7.1 (il se produit pendant
 * "En investigation" sans transition propre). Cette étape n'est donc volontairement pas suivie
 * ici comme une échéance autonome, même si sa valeur reste enregistrée dans sla_delais à titre
 * de référence. "Clôture, suivi et évaluation" est traitée comme un délai global (création →
 * clôture), pas comme une sous-étape déclenchée par un statut particulier.
 */
class DelaiService
{
    /** @var array<string, EtapeDelai> Statut interne -> étape suivie dont il fait partie. */
    private const STATUT_VERS_ETAPE = [
        'affecte' => EtapeDelai::AnalysePreliminaire,
        'en_analyse' => EtapeDelai::AnalysePreliminaire,
        'en_investigation' => EtapeDelai::TraitementEnquete,
        'en_attente_information' => EtapeDelai::TraitementEnquete,
        'action_corrective_en_cours' => EtapeDelai::MiseEnOeuvreMesures,
        'resolu' => EtapeDelai::RetourResolution,
    ];

    /** Statut interne dont l'entrée démarre le chronomètre de chaque étape suivie. */
    private const ETAPE_VERS_STATUT_DE_DEPART = [
        'analyse_preliminaire' => 'affecte',
        'traitement_enquete' => 'en_investigation',
        'mise_en_oeuvre_mesures' => 'action_corrective_en_cours',
        'retour_resolution' => 'resolu',
    ];

    /**
     * `sla_delais` n'est modifiable par aucune UI (seedée une fois, jamais via l'administration —
     * cf. docs/decisions-techniques.md DT-34) : une table de quelques lignes, figée pour la durée
     * du process. La mettre en cache mémoire pour la durée de vie du service (singleton, cf.
     * AppServiceProvider) évite une requête `sla_delais` par dossier lorsque `joursRestants()` est
     * appelé en boucle sur une page de liste (DossierListPage, jusqu'à 20 dossiers/page).
     *
     * @var Collection<int, SlaDelai>|null
     */
    private ?Collection $slaDelaisCache = null;

    public function etapeActuelle(Dossier $dossier): ?EtapeDelai
    {
        return self::STATUT_VERS_ETAPE[$dossier->statut->code->value] ?? null;
    }

    public function dateDebutEtape(Dossier $dossier): ?CarbonImmutable
    {
        $etape = $this->etapeActuelle($dossier);

        if ($etape === null) {
            return null;
        }

        $statutDeDepart = self::ETAPE_VERS_STATUT_DE_DEPART[$etape->value];

        $entree = HistoriqueStatut::query()
            ->where('dossier_id', $dossier->id)
            ->whereHas('statutSuivant', fn ($q) => $q->where('code', $statutDeDepart))
            ->latest('created_at')
            ->first();

        return $entree ? CarbonImmutable::parse($entree->created_at) : null;
    }

    public function delaiConfigure(Dossier $dossier, ?EtapeDelai $etape = null): ?SlaDelai
    {
        $etape ??= $this->etapeActuelle($dossier);

        if ($etape === null) {
            return null;
        }

        $this->slaDelaisCache ??= SlaDelai::query()->valide()->get();

        return $this->slaDelaisCache
            ->first(fn (SlaDelai $d) => $d->parcours_id === $dossier->parcours_id && $d->etape_code === $etape->value);
    }

    public function dateLimite(Dossier $dossier): ?CarbonImmutable
    {
        $debut = $this->dateDebutEtape($dossier);
        $delai = $this->delaiConfigure($dossier);

        if ($debut === null || $delai === null) {
            return null;
        }

        return $this->ajouter($debut, $delai->valeur, $delai->unite);
    }

    public function estEnRetard(Dossier $dossier): bool
    {
        $limite = $this->dateLimite($dossier);

        return $limite !== null && CarbonImmutable::now()->greaterThan($limite);
    }

    /** Jours restants avant l'échéance (négatif si dépassée). Null si aucun délai n'est suivi. */
    public function joursRestants(Dossier $dossier): ?int
    {
        $limite = $this->dateLimite($dossier);

        if ($limite === null) {
            return null;
        }

        return (int) CarbonImmutable::now()->startOfDay()->diffInDays($limite->startOfDay(), false);
    }

    /**
     * Délai global de traitement (§11.2 "Clôture, suivi et évaluation"), mesuré depuis la
     * création du dossier, indépendamment de son statut courant.
     */
    public function dateLimiteGlobale(Dossier $dossier): ?CarbonImmutable
    {
        $delai = $this->delaiConfigure($dossier, EtapeDelai::Cloture);

        if ($delai === null) {
            return null;
        }

        return $this->ajouter(CarbonImmutable::parse($dossier->created_at), $delai->valeur, $delai->unite);
    }

    public function estEnRetardGlobalement(Dossier $dossier): bool
    {
        if (in_array($dossier->statut->code, [StatutDossierCode::Cloture, StatutDossierCode::Rejete], true)) {
            return false;
        }

        $limite = $this->dateLimiteGlobale($dossier);

        return $limite !== null && CarbonImmutable::now()->greaterThan($limite);
    }

    /**
     * EX-NOT-04 : pourcentage de dépassement du délai alloué à l'étape courante, utilisé pour le
     * palier d'escalade "+50 %" (alerte Direction). Négatif ou nul tant que l'échéance n'est pas
     * dépassée. Null si aucun délai n'est suivi pour ce dossier (cf. DT-04).
     */
    public function pourcentageDepassement(Dossier $dossier): ?float
    {
        $debut = $this->dateDebutEtape($dossier);
        $limite = $this->dateLimite($dossier);

        if ($debut === null || $limite === null) {
            return null;
        }

        $dureeAllouee = $debut->diffInSeconds($limite);

        if ($dureeAllouee <= 0) {
            return null;
        }

        $ecoulement = $debut->diffInSeconds(CarbonImmutable::now());

        return (($ecoulement - $dureeAllouee) / $dureeAllouee) * 100;
    }

    /** EX-NOT-04 : vrai si le dépassement atteint (ou dépasse) le seuil donné, en pourcentage du délai alloué. */
    public function estEnRetardDe(Dossier $dossier, float $pourcentageSeuil): bool
    {
        $pourcentage = $this->pourcentageDepassement($dossier);

        return $pourcentage !== null && $pourcentage >= $pourcentageSeuil;
    }

    private function ajouter(CarbonImmutable $depart, int $valeur, UniteDelai $unite): CarbonImmutable
    {
        return match ($unite) {
            UniteDelai::Heures => $depart->addHours($valeur),
            UniteDelai::JoursOuvres => $this->ajouterJoursOuvres($depart, $valeur),
            UniteDelai::Semaines => $depart->addWeeks($valeur),
            UniteDelai::Mois => $depart->addMonths($valeur),
        };
    }

    /**
     * Ajoute des jours ouvrés (lundi-vendredi). Le CDC ne fournit pas de calendrier des jours
     * fériés locaux : seuls les week-ends sont exclus (docs/decisions-techniques.md).
     */
    private function ajouterJoursOuvres(CarbonImmutable $depart, int $jours): CarbonImmutable
    {
        $date = $depart;
        $restants = $jours;

        while ($restants > 0) {
            $date = $date->addDay();

            if (! $date->isWeekend()) {
                $restants--;
            }
        }

        return $date;
    }
}
