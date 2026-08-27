<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Polymorphe : Dossier | Investigation | ActionCorrective. Le contrôle d'accès au fichier se
 * fait via la Policy du modèle "attachable", jamais par une URL de stockage publique directe
 * (docs/exigences-securite.md §3).
 */
class PieceJointe extends Model
{
    use HasFactory, HasUlids;

    public $incrementing = false;

    protected $keyType = 'string';

    /** Pas de colonne updated_at : une pièce jointe n'est jamais modifiée après téléversement. */
    const UPDATED_AT = null;

    protected $table = 'pieces_jointes';

    protected $fillable = [
        'attachable_type',
        'attachable_id',
        'disque',
        'chemin',
        'nom_original',
        'mime_type',
        'taille_octets',
        'checksum_sha256',
        'televerse_par',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'taille_octets' => 'integer',
        ];
    }

    public function attachable(): MorphTo
    {
        return $this->morphTo();
    }

    public function televerseur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'televerse_par');
    }
}
