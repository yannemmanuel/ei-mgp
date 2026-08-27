<?php

namespace App\Enums;

/**
 * Origine d'un message de la messagerie sécurisée (CDC EX-NOT-07).
 */
enum ExpediteurType: string
{
    case Declarant = 'declarant';
    case Agent = 'agent';
}
