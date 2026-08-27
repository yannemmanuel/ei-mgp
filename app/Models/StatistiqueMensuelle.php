<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Données agrégées et anonymisées (RG-12) : jamais de référence à un dossier individuel.
 * Alimentée par un job planifié (Phase 12), jamais modifiée après coup.
 */
class StatistiqueMensuelle extends Model
{
    use HasFactory;

    const UPDATED_AT = null;

    protected $table = 'statistiques_mensuelles';

    protected $fillable = [
        'periode',
        'parcours_id',
        'categorie_id',
        'niveau_gravite_id',
        'nb_declarations',
        'nb_resolues',
        'nb_cloturees',
        'delai_moyen_jours',
        'taux_resolution',
        'taux_cloture',
    ];

    protected function casts(): array
    {
        return [
            'periode' => 'date',
            'delai_moyen_jours' => 'decimal:2',
            'taux_resolution' => 'decimal:2',
            'taux_cloture' => 'decimal:2',
        ];
    }

    public function parcours(): BelongsTo
    {
        return $this->belongsTo(Parcours::class);
    }

    public function categorie(): BelongsTo
    {
        return $this->belongsTo(Categorie::class);
    }

    public function niveauGravite(): BelongsTo
    {
        return $this->belongsTo(NiveauGravite::class);
    }
}
