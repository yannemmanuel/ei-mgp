<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

/**
 * EX-REP-02 : filtres du Module 6 (Reporting), partagés entre le tableau de bord consolidé
 * (App\Livewire\Reporting\DashboardConsolide), le calcul des indicateurs
 * (App\Services\Reporting\IndicateurService) et les exports (App\Exports\DossiersExport) — un
 * seul et même filtre appliqué partout, jamais réimplémenté. Sur-ensemble des filtres du Module 2
 * (docs/exigences-fonctionnelles.md EX-GES-01) : ajoute site/direction, absents de
 * App\Livewire\Dossiers\DossierListPage.
 */
final class ReportingFilter
{
    public function __construct(
        public readonly ?string $parcoursId = null,
        public readonly ?string $categorieId = null,
        public readonly ?string $statutId = null,
        public readonly ?string $niveauGraviteId = null,
        public readonly ?string $siteId = null,
        public readonly ?string $directionId = null,
        public readonly ?string $periodeDebut = null,
        public readonly ?string $periodeFin = null,
    ) {}

    /**
     * Colonnes systématiquement qualifiées `dossiers.*` : App\Services\Reporting\IndicateurService
     * applique ce filtre à des requêtes déjà `join()`ées (parcours/statuts_dossier/niveaux_gravite,
     * qui portent elles aussi `created_at`) — un nom de colonne non qualifié y serait ambigu.
     */
    public function appliquer(Builder $query): Builder
    {
        return $query
            ->when($this->parcoursId, fn (Builder $q, string $v) => $q->where('dossiers.parcours_id', $v))
            ->when($this->categorieId, fn (Builder $q, string $v) => $q->where('dossiers.categorie_id', $v))
            ->when($this->statutId, fn (Builder $q, string $v) => $q->where('dossiers.statut_id', $v))
            ->when($this->niveauGraviteId, fn (Builder $q, string $v) => $q->where('dossiers.niveau_gravite_id', $v))
            ->when($this->siteId, fn (Builder $q, string $v) => $q->where('dossiers.site_id', $v))
            ->when($this->directionId, fn (Builder $q, string $v) => $q->where('dossiers.direction_id', $v))
            ->when($this->periodeDebut, fn (Builder $q, string $v) => $q->whereDate('dossiers.created_at', '>=', $v))
            ->when($this->periodeFin, fn (Builder $q, string $v) => $q->whereDate('dossiers.created_at', '<=', $v));
    }
}
