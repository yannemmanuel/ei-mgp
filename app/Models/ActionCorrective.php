<?php

namespace App\Models;

use App\Enums\StatutActionCorrective;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * cf. RG-10 / EX-ACT-05 : un dossier ne peut être clôturé tant que ses actions correctives ne
 * sont pas elles-mêmes closes et leur efficacité vérifiée — règle appliquée par
 * App\Services\Workflow\DossierWorkflowService (Phase 6), pas ici.
 *
 * @property Dossier $dossier
 * @property StatutActionCorrective $statut cf. docs/decisions-techniques.md DT-19/DT-25 (annotation
 *                                          explicite requise pour que Larastan reconnaisse le cast enum au travers des appels
 *                                          inter-fichiers, ex. App\Services\ActionCorrective\ActionCorrectiveService).
 */
class ActionCorrective extends Model
{
    use HasFactory, HasUlids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'actions_correctives';

    protected $fillable = [
        'dossier_id',
        'investigation_id',
        'intitule',
        'description',
        'responsable_id',
        'echeance',
        'statut',
        'verification_efficacite',
        'verification_commentaire',
        'date_cloture',
    ];

    protected function casts(): array
    {
        return [
            'statut' => StatutActionCorrective::class,
            'echeance' => 'date',
            'verification_efficacite' => 'boolean',
            'date_cloture' => 'datetime',
        ];
    }

    public function dossier(): BelongsTo
    {
        return $this->belongsTo(Dossier::class);
    }

    public function investigation(): BelongsTo
    {
        return $this->belongsTo(Investigation::class);
    }

    public function responsable(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsable_id');
    }

    public function piecesJointes(): MorphMany
    {
        return $this->morphMany(PieceJointe::class, 'attachable');
    }

    public function estClosable(): bool
    {
        return $this->verification_efficacite === true;
    }
}
