<?php

namespace App\Services\Declaration;

use Illuminate\Support\Facades\Hash;

/**
 * RG-02 : code d'accès secondaire (4-6 chiffres) pour toute déclaration anonyme — avec la
 * référence, seule clé de consultation du dossier (RGI-12). Jamais stocké en clair (RG-02) :
 * seul le hash est persisté sur dossiers.access_code_hash.
 */
class AccessCodeService
{
    private const LONGUEUR = 6;

    public function generer(): string
    {
        return str_pad((string) random_int(0, 10 ** self::LONGUEUR - 1), self::LONGUEUR, '0', STR_PAD_LEFT);
    }

    public function hacher(string $code): string
    {
        return Hash::make($code);
    }

    public function verifier(string $code, string $hash): bool
    {
        return Hash::check($code, $hash);
    }
}
