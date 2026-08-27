<?php

namespace App\Models;

use App\Enums\StatutDossierCode;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Statuts internes (CDC §7.1). "libelle_affiche" est la source unique de vérité pour la
 * projection vers le statut simplifié montré au déclarant (CDC §7.2, RGI-10) : ne jamais
 * recalculer ce libellé ailleurs dans le code.
 */
class StatutDossier extends Model
{
    use HasFactory;

    protected $table = 'statuts_dossier';

    protected $fillable = [
        'code',
        'libelle_interne',
        'libelle_affiche',
        'is_terminal',
        'ordre',
    ];

    protected function casts(): array
    {
        return [
            'code' => StatutDossierCode::class,
            'is_terminal' => 'boolean',
        ];
    }

    public function dossiers(): HasMany
    {
        return $this->hasMany(Dossier::class, 'statut_id');
    }
}
