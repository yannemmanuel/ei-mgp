<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use JsonSerializable;

/**
 * EX-REP-05 : une ligne de l'historique mensuel agrégé du tableau de bord.
 *
 * Ces lignes proviennent d'un `selectRaw(...)->groupBy('periode')` sur `statistiques_mensuelles` :
 * ce ne sont PAS des modèles App\Models\StatistiqueMensuelle complets, mais des lignes de valeurs
 * dont les colonnes (`total`, `cloturees`, `delai_moyen`, `taux_resolution`) n'existent sur aucun
 * modèle. Les typer explicitement ici plutôt que de les laisser en pseudo-attributs magiques
 * (cf. DT-31 point 5) : la vue Blade, la sérialisation `@js()` vers Chart.js et
 * App\Livewire\Reporting\DashboardConsolide::updated() consomment tous les trois cette même forme,
 * qui doit donc être vérifiable statiquement plutôt que reconstituée de mémoire à chaque usage.
 */
final class LigneHistoriqueMensuel implements JsonSerializable
{
    public function __construct(
        public readonly string $periode,
        public readonly int $total,
        public readonly int $cloturees,
        public readonly ?float $delai_moyen,
        public readonly ?float $taux_resolution,
    ) {}

    /** Construit la ligne depuis un enregistrement agrégé brut renvoyé par Eloquent. */
    public static function depuisAgregat(Model $ligne): self
    {
        return new self(
            periode: (string) $ligne->getAttribute('periode'),
            total: (int) $ligne->getAttribute('total'),
            cloturees: (int) $ligne->getAttribute('cloturees'),
            delai_moyen: self::flottantOuNull($ligne->getAttribute('delai_moyen')),
            taux_resolution: self::flottantOuNull($ligne->getAttribute('taux_resolution')),
        );
    }

    private static function flottantOuNull(mixed $valeur): ?float
    {
        return $valeur === null ? null : round((float) $valeur, 2);
    }

    /**
     * Forme consommée à l'identique par Chart.js (resources/js/charts.js) et par le payload de
     * l'évènement `graphiques-actualises`.
     *
     * @return array<string, string|int|float|null>
     */
    public function jsonSerialize(): array
    {
        return [
            'periode' => $this->periode,
            'total' => $this->total,
            'cloturees' => $this->cloturees,
            'delai_moyen' => $this->delai_moyen,
            'taux_resolution' => $this->taux_resolution,
        ];
    }
}
