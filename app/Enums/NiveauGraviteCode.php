<?php

namespace App\Enums;

/**
 * Échelle unique à 4 niveaux (CDC §11.1), verrouillée par un CHECK en base
 * (niveaux_gravite.niveau BETWEEN 1 AND 4).
 */
enum NiveauGraviteCode: string
{
    case Faible = 'faible';
    case Modere = 'modere';
    case Eleve = 'eleve';
    case Critique = 'critique';
}
