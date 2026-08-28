<?php

namespace App\Services\Reporting;

use App\Enums\StatutDossierCode;
use App\Models\Dossier;
use App\Support\ReportingFilter;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;

/**
 * EX-REP-03 : indicateurs calculés par requête SQL agrégée (`count()`, `avg` en `selectRaw`),
 * jamais en chargeant les dossiers en collection PHP pour les compter/moyenner côté application —
 * seule approche qui reste praticable quel que soit le volume de dossiers.
 *
 * cf. docs/decisions-techniques.md DT-31 pour la définition retenue de « taux de résolution » et
 * « taux de clôture », que le CDC ne formule pas sous forme de calcul.
 */
class IndicateurService
{
    public function nbDeclarations(ReportingFilter $filtre): int
    {
        return $filtre->appliquer(Dossier::query())->count();
    }

    /** % de dossiers ayant atteint "Résolu" ou "Clôturé" — la résolution effective du problème, indépendamment de la clôture administrative. Null si aucun dossier. */
    public function tauxResolution(ReportingFilter $filtre): ?float
    {
        $total = $this->nbDeclarations($filtre);

        if ($total === 0) {
            return null;
        }

        $resolus = $filtre->appliquer(Dossier::query())
            ->whereHas('statut', fn ($q) => $q->whereIn('code', [StatutDossierCode::Resolu->value, StatutDossierCode::Cloture->value]))
            ->count();

        return round($resolus / $total * 100, 2);
    }

    /** % de dossiers dans un statut terminal (Clôturé ou Rejeté, RGI-11) — l'avancement administratif, indépendamment de l'issue. Null si aucun dossier. */
    public function tauxCloture(ReportingFilter $filtre): ?float
    {
        $total = $this->nbDeclarations($filtre);

        if ($total === 0) {
            return null;
        }

        $clotures = $filtre->appliquer(Dossier::query())
            ->whereHas('statut', fn ($q) => $q->where('is_terminal', true))
            ->count();

        return round($clotures / $total * 100, 2);
    }

    /** Délai moyen (jours) entre soumission et clôture effective, dossiers clôturés uniquement. Null si aucun dossier clôturé. */
    public function delaiMoyenJours(ReportingFilter $filtre): ?float
    {
        $moyenne = $filtre->appliquer(Dossier::query())
            ->whereNotNull('date_cloture')
            ->selectRaw('AVG(EXTRACT(EPOCH FROM (date_cloture - created_at)) / 86400) as moyenne')
            ->value('moyenne');

        return $moyenne !== null ? round((float) $moyenne, 2) : null;
    }

    /** @return Collection<int, Model> Pseudo-attributs de chaque ligne : libelle, total. */
    public function repartitionParParcours(ReportingFilter $filtre): Collection
    {
        return $filtre->appliquer(Dossier::query())
            ->join('parcours', 'parcours.id', '=', 'dossiers.parcours_id')
            ->selectRaw('parcours.libelle as libelle, count(*) as total')
            ->groupBy('parcours.libelle')
            ->orderBy('parcours.libelle')
            ->get();
    }

    /** @return Collection<int, Model> Pseudo-attributs de chaque ligne : libelle, ordre, total. */
    public function repartitionParStatut(ReportingFilter $filtre): Collection
    {
        return $filtre->appliquer(Dossier::query())
            ->join('statuts_dossier', 'statuts_dossier.id', '=', 'dossiers.statut_id')
            ->selectRaw('statuts_dossier.libelle_interne as libelle, statuts_dossier.ordre as ordre, count(*) as total')
            ->groupBy('statuts_dossier.libelle_interne', 'statuts_dossier.ordre')
            ->orderBy('statuts_dossier.ordre')
            ->get();
    }

    /** @return Collection<int, Model> Pseudo-attributs de chaque ligne : libelle, couleur, niveau, total. */
    public function repartitionParGravite(ReportingFilter $filtre): Collection
    {
        return $filtre->appliquer(Dossier::query())
            ->join('niveaux_gravite', 'niveaux_gravite.id', '=', 'dossiers.niveau_gravite_id')
            ->selectRaw('niveaux_gravite.libelle as libelle, niveaux_gravite.couleur as couleur, niveaux_gravite.niveau as niveau, count(*) as total')
            ->groupBy('niveaux_gravite.libelle', 'niveaux_gravite.couleur', 'niveaux_gravite.niveau')
            ->orderBy('niveaux_gravite.niveau')
            ->get();
    }
}
