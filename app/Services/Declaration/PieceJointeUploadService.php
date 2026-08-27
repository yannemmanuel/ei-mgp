<?php

namespace App\Services\Declaration;

use App\Models\PieceJointe;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * EX-DEC-06 : 5 fichiers maximum, 50 Mo au total par déclaration. Le type réel de chaque
 * fichier est revérifié côté serveur via finfo (docs/exigences-securite.md §3) : le MIME
 * envoyé par le navigateur n'est jamais une preuve suffisante.
 */
class PieceJointeUploadService
{
    public const MAX_FICHIERS = 5;

    public const MAX_OCTETS_TOTAL = 50 * 1024 * 1024;

    /** @var array<string, string> extension attendue => MIME réel accepté */
    private const TYPES_AUTORISES = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        'mp4' => 'video/mp4',
        'mov' => 'video/quicktime',
        'pdf' => 'application/pdf',
    ];

    /**
     * @param  list<UploadedFile>  $fichiers
     */
    public function verifierLot(array $fichiers): void
    {
        if (count($fichiers) > self::MAX_FICHIERS) {
            throw new RuntimeException('Un maximum de '.self::MAX_FICHIERS.' fichiers est autorisé par déclaration.');
        }

        $tailleTotale = array_sum(array_map(fn (UploadedFile $f) => $f->getSize(), $fichiers));

        if ($tailleTotale > self::MAX_OCTETS_TOTAL) {
            throw new RuntimeException('La taille totale des pièces jointes dépasse 50 Mo.');
        }

        foreach ($fichiers as $fichier) {
            $this->verifierTypeReel($fichier);
        }
    }

    private function verifierTypeReel(UploadedFile $fichier): void
    {
        $extension = strtolower($fichier->getClientOriginalExtension());
        $mimeReel = finfo_file(finfo_open(FILEINFO_MIME_TYPE), $fichier->getRealPath());

        if (! isset(self::TYPES_AUTORISES[$extension]) || self::TYPES_AUTORISES[$extension] !== $mimeReel) {
            throw new RuntimeException("Le fichier « {$fichier->getClientOriginalName()} » n'est pas d'un type autorisé.");
        }
    }

    /**
     * @param  list<UploadedFile>  $fichiers
     */
    public function stocker(array $fichiers, Model $attachable, ?int $televersePar = null): void
    {
        $this->verifierLot($fichiers);

        foreach ($fichiers as $fichier) {
            $nomFichier = Str::ulid().'.'.strtolower($fichier->getClientOriginalExtension());
            $chemin = $fichier->storeAs(
                "pieces-jointes/{$attachable->getMorphClass()}/{$attachable->getKey()}",
                $nomFichier,
                ['disk' => 'local']
            );

            PieceJointe::create([
                'attachable_type' => $attachable::class,
                'attachable_id' => $attachable->getKey(),
                'disque' => 'local',
                'chemin' => $chemin,
                'nom_original' => $fichier->getClientOriginalName(),
                'mime_type' => self::TYPES_AUTORISES[strtolower($fichier->getClientOriginalExtension())],
                'taille_octets' => $fichier->getSize(),
                'checksum_sha256' => hash_file('sha256', $fichier->getRealPath()),
                'televerse_par' => $televersePar,
            ]);
        }
    }

    public function supprimerDuDisque(PieceJointe $pieceJointe): void
    {
        Storage::disk($pieceJointe->disque)->delete($pieceJointe->chemin);
    }
}
