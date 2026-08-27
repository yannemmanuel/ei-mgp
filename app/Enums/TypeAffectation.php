<?php

namespace App\Enums;

/**
 * Nature d'une affectation de dossier (CDC §8 EX-GES-02/03).
 */
enum TypeAffectation: string
{
    case Automatique = 'automatique';
    case Manuelle = 'manuelle';
    case Reaffectation = 'reaffectation';
}
