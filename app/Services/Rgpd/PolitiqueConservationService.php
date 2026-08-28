<?php

namespace App\Services\Rgpd;

use App\Models\Dossier;

/**
 * RG-11 : politique de conservation des données personnelles d'un dossier clôturé — 24 mois de
 * consultation active, puis archivage (5 à 10 ans), puis anonymisation, sauf contentieux actif.
 * cf. docs/decisions-techniques.md DT-32 pour les choix d'interprétation (bornes retenues,
 * périmètre limité aux dossiers réellement « clôturés », sémantique de l'archivage).
 *
 * Ne supprime jamais la ligne `dossiers` elle-même (RG-03, RG-12 : les statistiques agrégées
 * doivent rester calculables sans limitation de durée) — seule la donnée d'identité
 * (`declaration_identites`) est supprimée à l'anonymisation.
 */
class PolitiqueConservationService
{
    private const MOIS_ARCHIVAGE = 24;

    private const ANNEES_ANONYMISATION = 10;

    /** Marque "archivé" tout dossier clôturé depuis plus de 24 mois, pas encore marqué. */
    public function archiver(): int
    {
        return Dossier::query()
            ->whereNotNull('date_cloture')
            ->whereNull('archive_le')
            ->where('date_cloture', '<=', now()->subMonths(self::MOIS_ARCHIVAGE))
            ->update(['archive_le' => now()]);
    }

    /**
     * Supprime la donnée d'identité (si présente) des dossiers clôturés depuis plus de 10 ans et
     * non couverts par un contentieux actif ; marque `anonymise_le`. Retourne le nombre de
     * dossiers traités.
     */
    public function anonymiser(): int
    {
        $dossiers = Dossier::query()
            ->whereNotNull('date_cloture')
            ->whereNull('anonymise_le')
            ->where('contentieux', false)
            ->where('date_cloture', '<=', now()->subYears(self::ANNEES_ANONYMISATION))
            ->get();

        foreach ($dossiers as $dossier) {
            $dossier->identite?->delete();
            $dossier->update(['anonymise_le' => now()]);
        }

        return $dossiers->count();
    }

    /** Dossiers éligibles à l'anonymisation mais exclus pour contentieux actif — à des fins de suivi/rapport, pas d'action automatique. */
    public function compterExclusPourContentieux(): int
    {
        return Dossier::query()
            ->whereNotNull('date_cloture')
            ->whereNull('anonymise_le')
            ->where('contentieux', true)
            ->where('date_cloture', '<=', now()->subYears(self::ANNEES_ANONYMISATION))
            ->count();
    }
}
