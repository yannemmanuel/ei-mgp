<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Historique append-only des transitions de statut (RG-04). Ne jamais mettre à jour une ligne
 * existante : chaque transition crée une nouvelle ligne.
 */
class HistoriqueStatut extends Model
{
    use HasFactory;

    const UPDATED_AT = null;

    protected $fillable = [
        'dossier_id',
        'statut_precedent_id',
        'statut_suivant_id',
        'commentaire',
        'effectue_par',
    ];

    public function dossier(): BelongsTo
    {
        return $this->belongsTo(Dossier::class);
    }

    public function statutPrecedent(): BelongsTo
    {
        return $this->belongsTo(StatutDossier::class, 'statut_precedent_id');
    }

    public function statutSuivant(): BelongsTo
    {
        return $this->belongsTo(StatutDossier::class, 'statut_suivant_id');
    }

    public function effectuePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'effectue_par');
    }
}
