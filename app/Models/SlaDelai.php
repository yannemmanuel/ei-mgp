<?php

namespace App\Models;

use App\Enums\UniteDelai;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * cf. docs/decisions-techniques.md DT-04 : "est_valide_metier" conditionne l'activation des
 * alertes de dépassement (EX-NOT-04) pour cette étape.
 *
 * @property UniteDelai $unite cf. docs/decisions-techniques.md DT-19 (annotation explicite requise
 *                             pour que Larastan reconnaisse le cast enum au travers des appels inter-fichiers).
 */
class SlaDelai extends Model
{
    use HasFactory;

    protected $table = 'sla_delais';

    protected $fillable = [
        'parcours_id',
        'etape_code',
        'valeur',
        'unite',
        'est_valide_metier',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'unite' => UniteDelai::class,
            'est_valide_metier' => 'boolean',
        ];
    }

    public function scopeValide(Builder $query): Builder
    {
        return $query->where('est_valide_metier', true);
    }

    public function parcours(): BelongsTo
    {
        return $this->belongsTo(Parcours::class);
    }
}
