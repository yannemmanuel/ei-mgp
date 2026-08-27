<?php

namespace App\Enums;

/**
 * Les 4 parcours du CDC (§2.1). Le nombre de parcours est fixe (aucune création libre par
 * l'administrateur, cf. docs/decisions-techniques.md) ; seuls les libellés de la table
 * "parcours" restent administrables.
 */
enum ParcoursCode: string
{
    case EiEmploye = 'ei_employe';
    case GriefEmploye = 'grief_employe';
    case GriefSousTraitant = 'grief_sous_traitant';
    case GriefCommunaute = 'grief_communaute';
}
