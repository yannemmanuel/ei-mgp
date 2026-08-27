<?php

namespace App\Http\Controllers;

use App\Models\QrCode;

/**
 * EX-DEC-01 : point d'entrée scanné depuis un QR code. Résout le token vers le parcours cible
 * et redirige — permet de changer l'URL cible d'un QR physique sans réimprimer le support.
 */
class QrCodeRedirectController extends Controller
{
    public function __invoke(string $token)
    {
        $qrCode = QrCode::query()
            ->where('token', $token)
            ->where('actif', true)
            ->with('parcours')
            ->firstOrFail();

        return redirect()->route('declarer.'.str_replace('_', '-', $qrCode->parcours->code->value));
    }
}
