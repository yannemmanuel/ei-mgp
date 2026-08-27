<?php

namespace App\Enums;

/**
 * Unité d'un délai SLA (CDC §11.2).
 */
enum UniteDelai: string
{
    case Heures = 'heures';
    case JoursOuvres = 'jours_ouvres';
    case Mois = 'mois';
}
