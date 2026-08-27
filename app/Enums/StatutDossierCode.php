<?php

namespace App\Enums;

/**
 * Statuts internes du cycle de vie d'un dossier (CDC §7.1). Le graphe de transitions est
 * appliqué par App\Services\Workflow\DossierWorkflowService (Phase 6) ; cette énumération ne
 * fait qu'identifier les codes de façon typée. "Brouillon" et "Soumis" ne sont volontairement
 * pas persistés (cf. docs/decisions-techniques.md DT-05, docs/workflows.md §1).
 */
enum StatutDossierCode: string
{
    case Recu = 'recu';
    case Affecte = 'affecte';
    case EnAnalyse = 'en_analyse';
    case EnInvestigation = 'en_investigation';
    case EnAttenteInformation = 'en_attente_information';
    case ActionCorrectiveEnCours = 'action_corrective_en_cours';
    case Resolu = 'resolu';
    case Cloture = 'cloture';
    case Reouvert = 'reouvert';
    case Rejete = 'rejete';
}
