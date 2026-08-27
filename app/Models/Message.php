<?php

namespace App\Models;

use App\Enums\ExpediteurType;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Messagerie sécurisée (EX-NOT-07). expediteur_user_id reste NULL côté déclarant, y compris
 * anonyme (RG-06) : ne jamais l'alimenter depuis le contexte "déclarant".
 */
class Message extends Model
{
    use HasFactory, HasUlids;

    public $incrementing = false;

    protected $keyType = 'string';

    const UPDATED_AT = null;

    protected $fillable = [
        'dossier_id',
        'expediteur_type',
        'expediteur_user_id',
        'corps',
        'lu_le',
    ];

    protected function casts(): array
    {
        return [
            'expediteur_type' => ExpediteurType::class,
            'lu_le' => 'datetime',
        ];
    }

    public function dossier(): BelongsTo
    {
        return $this->belongsTo(Dossier::class);
    }

    public function expediteur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'expediteur_user_id');
    }
}
