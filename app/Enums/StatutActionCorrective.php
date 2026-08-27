<?php

namespace App\Enums;

/**
 * Avancement d'une action corrective (CDC §9.6, EX-ACT-03).
 */
enum StatutActionCorrective: string
{
    case NonDemarree = 'non_demarree';
    case EnCours = 'en_cours';
    case Realisee = 'realisee';
    case EnRetard = 'en_retard';
}
