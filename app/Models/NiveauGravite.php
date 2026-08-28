<?php

namespace App\Models;

use App\Enums\EffetCircuit;
use App\Enums\NiveauGraviteCode;
use App\Observers\AuditObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Échelle unique à 4 niveaux (CDC §11.1). Le niveau "Critique" déclenche le circuit accéléré
 * (RG-08) — vérifié via isCritique(), jamais par une comparaison de chaîne dispersée dans le code.
 *
 * cf. docs/exigences-audit.md §2 : modification des référentiels d'administration auditée.
 *
 * @property NiveauGraviteCode $code
 * @property EffetCircuit $effet_circuit
 */
#[ObservedBy(AuditObserver::class)]
class NiveauGravite extends Model
{
    use HasFactory;

    protected $table = 'niveaux_gravite';

    protected $fillable = [
        'niveau',
        'code',
        'libelle',
        'effet_circuit',
        'couleur',
        'actif',
    ];

    protected function casts(): array
    {
        return [
            'code' => NiveauGraviteCode::class,
            'effet_circuit' => EffetCircuit::class,
            'actif' => 'boolean',
        ];
    }

    public function scopeActif(Builder $query): Builder
    {
        return $query->where('actif', true);
    }

    public function isCritique(): bool
    {
        return $this->effet_circuit === EffetCircuit::Accelere;
    }

    public function dossiers(): HasMany
    {
        return $this->hasMany(Dossier::class, 'niveau_gravite_id');
    }
}
