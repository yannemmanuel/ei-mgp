<?php

namespace App\Enums;

/**
 * Qualité du plaignant, parcours Grief Communauté (CDC §9.4).
 */
enum StatutPlaignant: string
{
    case Riverain = 'riverain';
    case ChefCoutumier = 'chef_coutumier';
    case Association = 'association';
    case Ong = 'ong';
    case Autre = 'autre';
}
