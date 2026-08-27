<?php

namespace App\Http\Controllers;

use App\Models\ActionCorrective;
use App\Models\Dossier;
use App\Models\Investigation;
use App\Models\PieceJointe;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * docs/exigences-securite.md §3 : aucune pièce jointe n'est jamais servie par une URL de
 * stockage publique directe. Ce contrôleur revérifie systématiquement la Policy du dossier
 * parent (que la pièce soit attachée au dossier lui-même, à une investigation ou à une action
 * corrective) avant de streamer le fichier.
 */
class PieceJointeDownloadController extends Controller
{
    public function __invoke(PieceJointe $pieceJointe): StreamedResponse
    {
        $dossier = match ($pieceJointe->attachable_type) {
            Dossier::class => $pieceJointe->attachable,
            Investigation::class, ActionCorrective::class => $pieceJointe->attachable->dossier,
            default => abort(404),
        };

        Gate::authorize('view', $dossier);

        return Storage::disk($pieceJointe->disque)->download($pieceJointe->chemin, $pieceJointe->nom_original);
    }
}
