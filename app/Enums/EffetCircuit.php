<?php

namespace App\Enums;

/**
 * Effet d'un niveau de gravité sur le circuit de traitement (CDC §11.1).
 */
enum EffetCircuit: string
{
    case Standard = 'standard';
    case Priorisation = 'priorisation';
    case Accelere = 'accelere';
}
