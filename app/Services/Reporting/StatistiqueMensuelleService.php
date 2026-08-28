<?php

namespace App\Services\Reporting;

use App\Enums\StatutDossierCode;
use App\Models\Dossier;
use App\Models\StatistiqueMensuelle;
use Carbon\CarbonImmutable;

/**
 * EX-REP-05 : historisation mensuelle, agrégée et anonymisée (RG-12 : aucune colonne d'identité,
 * aucune référence à un dossier individuel — seulement des compteurs/moyennes par combinaison
 * parcours × catégorie × gravité). Alimentée par la commande planifiée
 * App\Console\Commands\CalculerStatistiquesMensuelles.
 *
 * N'utilise jamais `updateOrCreate()` : une ligne déjà calculée pour une période donnée n'est
 * plus jamais modifiée (cf. App\Models\StatistiqueMensuelle, "jamais modifiée après coup") — un
 * nouvel appel pour une période déjà traitée est un no-op silencieux signalé au niveau de la
 * commande, pas une correction implicite d'une valeur déjà publiée.
 */
class StatistiqueMensuelleService
{
    /** @return int Nombre de nouvelles lignes créées (0 si la période était déjà entièrement traitée). */
    public function calculerPour(CarbonImmutable $mois): int
    {
        $debut = $mois->startOfMonth();
        $fin = $mois->endOfMonth();

        $combinaisons = Dossier::query()
            ->whereBetween('created_at', [$debut, $fin])
            ->select('parcours_id', 'categorie_id', 'niveau_gravite_id')
            ->distinct()
            ->get();

        $creees = 0;

        foreach ($combinaisons as $combinaison) {
            $existe = StatistiqueMensuelle::query()
                ->where('periode', $debut->toDateString())
                ->where('parcours_id', $combinaison->parcours_id)
                ->where('categorie_id', $combinaison->categorie_id)
                ->where('niveau_gravite_id', $combinaison->niveau_gravite_id)
                ->exists();

            if ($existe) {
                continue;
            }

            $base = fn () => Dossier::query()
                ->whereBetween('created_at', [$debut, $fin])
                ->where('parcours_id', $combinaison->parcours_id)
                ->where('categorie_id', $combinaison->categorie_id)
                ->where('niveau_gravite_id', $combinaison->niveau_gravite_id);

            $total = $base()->count();
            $resolues = $base()->whereHas('statut', fn ($q) => $q->whereIn('code', [StatutDossierCode::Resolu->value, StatutDossierCode::Cloture->value]))->count();
            $cloturees = $base()->whereHas('statut', fn ($q) => $q->where('is_terminal', true))->count();
            $delaiMoyen = $base()->whereNotNull('date_cloture')
                ->selectRaw('AVG(EXTRACT(EPOCH FROM (date_cloture - created_at)) / 86400) as moyenne')
                ->value('moyenne');

            StatistiqueMensuelle::create([
                'periode' => $debut->toDateString(),
                'parcours_id' => $combinaison->parcours_id,
                'categorie_id' => $combinaison->categorie_id,
                'niveau_gravite_id' => $combinaison->niveau_gravite_id,
                'nb_declarations' => $total,
                'nb_resolues' => $resolues,
                'nb_cloturees' => $cloturees,
                'delai_moyen_jours' => $delaiMoyen !== null ? round((float) $delaiMoyen, 2) : null,
                'taux_resolution' => $total > 0 ? round($resolues / $total * 100, 2) : null,
                'taux_cloture' => $total > 0 ? round($cloturees / $total * 100, 2) : null,
            ]);

            $creees++;
        }

        return $creees;
    }
}
