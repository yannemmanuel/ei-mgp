<?php

namespace App\Models;

use App\Enums\ParcoursCode;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Les 4 parcours du CDC (§2.1). Table de référence figée : les 4 lignes sont seedées une fois
 * (cf. database/seeders/ParcoursSeeder.php) et ne sont pas destinées à être créées librement
 * depuis la console d'administration (docs/decisions-techniques.md).
 */
class Parcours extends Model
{
    use HasFactory;

    protected $table = 'parcours';

    protected $fillable = [
        'code',
        'libelle',
        'actif',
        'ordre',
    ];

    protected function casts(): array
    {
        return [
            'code' => ParcoursCode::class,
            'actif' => 'boolean',
        ];
    }

    public function scopeActif(Builder $query): Builder
    {
        return $query->where('actif', true);
    }

    public function categories(): HasMany
    {
        return $this->hasMany(Categorie::class);
    }

    public function dossiers(): HasMany
    {
        return $this->hasMany(Dossier::class);
    }

    public function qrCodes(): HasMany
    {
        return $this->hasMany(QrCode::class);
    }

    public function slaDelais(): HasMany
    {
        return $this->hasMany(SlaDelai::class);
    }

    public function notificationTemplates(): HasMany
    {
        return $this->hasMany(NotificationTemplate::class);
    }
}
