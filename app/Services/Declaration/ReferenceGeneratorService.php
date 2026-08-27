<?php

namespace App\Services\Declaration;

use App\Enums\ParcoursCode;
use App\Models\Dossier;

/**
 * RG-01 : numéro de référence unique par parcours, format {PREFIXE}-{ANNEE}-{NNNNNN}.
 *
 * Doit être appelé à l'intérieur de la transaction DB de App\Services\Declaration\DeclarationService
 * (le verrouillage de ligne ci-dessous n'a d'effet que dans une transaction). La contrainte
 * UNIQUE sur dossiers.reference reste le filet de sécurité final en cas de course improbable
 * sur la toute première référence d'une nouvelle combinaison parcours/année.
 */
class ReferenceGeneratorService
{
    /** @var array<string, string> */
    private const PREFIXES = [
        'ei_employe' => 'EI',
        'grief_employe' => 'GEM',
        'grief_sous_traitant' => 'GST',
        'grief_communaute' => 'GCO',
    ];

    public function suivante(ParcoursCode $parcours): string
    {
        $prefixe = self::PREFIXES[$parcours->value];
        $racine = $prefixe.'-'.now()->year.'-';

        $dernier = Dossier::query()
            ->where('reference', 'like', $racine.'%')
            ->lockForUpdate()
            ->orderByDesc('reference')
            ->value('reference');

        $prochainNumero = $dernier ? ((int) substr($dernier, -6)) + 1 : 1;

        return $racine.str_pad((string) $prochainNumero, 6, '0', STR_PAD_LEFT);
    }
}
