<?php

namespace App\Models;

use App\Enums\StatutInvestigation;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * @property Dossier $dossier
 * @property StatutInvestigation $statut cf. docs/decisions-techniques.md DT-19/DT-25 (annotation
 *                                       explicite requise pour que Larastan reconnaisse le cast enum au travers des appels
 *                                       inter-fichiers, ex. App\Services\Investigation\InvestigationService).
 */
class Investigation extends Model
{
    use HasFactory, HasUlids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'dossier_id',
        'enqueteur_id',
        'date_ouverture',
        'faits_constates',
        'personnes_rencontrees',
        'cause_immediate',
        'causes_racines',
        'recommandations',
        'statut',
        'valide_par',
        'valide_le',
    ];

    protected function casts(): array
    {
        return [
            'statut' => StatutInvestigation::class,
            'date_ouverture' => 'date',
            'valide_le' => 'datetime',
        ];
    }

    public function dossier(): BelongsTo
    {
        return $this->belongsTo(Dossier::class);
    }

    public function enqueteur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'enqueteur_id');
    }

    /** RGI-06 : ne doit jamais être égal à enqueteur_id — vérifié en Policy (Phase 7). */
    public function validateur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'valide_par');
    }

    public function actionsCorrectives(): HasMany
    {
        return $this->hasMany(ActionCorrective::class);
    }

    public function piecesJointes(): MorphMany
    {
        return $this->morphMany(PieceJointe::class, 'attachable');
    }
}
