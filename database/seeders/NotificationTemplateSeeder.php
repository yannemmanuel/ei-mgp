<?php

namespace Database\Seeders;

use App\Enums\CanalNotification;
use App\Enums\ParcoursCode;
use App\Models\NotificationTemplate;
use App\Models\Parcours;
use Illuminate\Database\Seeder;

/**
 * Gabarits de notification (Module 5, EX-NOT-01 à 05). Un gabarit `parcours_id = null` s'applique
 * à tous les parcours ; un gabarit spécifique à un parcours prime sur le global pour le même
 * couple (evenement_code, canal) — cf. App\Services\Notification\NotificationService.
 *
 * Les adresses `destinataires_email_supplementaires` (Service Prévention, toutes les Directions)
 * sont des valeurs INDICATIVES de développement (cf. docs/decisions-techniques.md DT-07/DT-28) —
 * à remplacer par les véritables adresses de diffusion de l'organisation avant mise en production.
 */
class NotificationTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $this->global('dossier_affecte', CanalNotification::Outil, 'Dossier {reference} affecté', 'Le dossier {reference} ({parcours}) vous a été affecté. Merci de le prendre en charge.');
        $this->global('dossier_affecte', CanalNotification::Email, 'Dossier {reference} affecté', 'Le dossier {reference} ({parcours}) vous a été affecté. Merci de le prendre en charge.');

        $this->global('statut_change', CanalNotification::Outil, 'Mise à jour de votre déclaration {reference}', 'Le statut de votre déclaration {reference} a évolué : {statut}.');
        $this->global('statut_change', CanalNotification::Email, 'Mise à jour de votre déclaration {reference}', 'Le statut de votre déclaration {reference} a évolué : {statut}. Vous pouvez suivre son avancement via la page de suivi.');

        $this->global('relance_echeance', CanalNotification::Outil, 'Échéance proche : dossier {reference}', 'Le dossier {reference} ({parcours}) arrive à échéance dans {jours_restants} jour(s). Merci de le traiter avant cette date.');
        $this->global('relance_echeance', CanalNotification::Email, 'Échéance proche : dossier {reference}', 'Le dossier {reference} ({parcours}) arrive à échéance dans {jours_restants} jour(s). Merci de le traiter avant cette date.');

        $this->global('alerte_retard_n1', CanalNotification::Outil, 'Retard signalé : dossier {reference}', 'Le dossier {reference} ({parcours}), sous la responsabilité d\'un de vos collaborateurs, a dépassé son délai de traitement.');
        $this->global('alerte_retard_n1', CanalNotification::Email, 'Retard signalé : dossier {reference}', 'Le dossier {reference} ({parcours}), sous la responsabilité d\'un de vos collaborateurs, a dépassé son délai de traitement.');

        $this->global('alerte_retard_service_mgp', CanalNotification::Outil, 'Alerte retard : dossier {reference}', 'Le dossier {reference} ({parcours}) a dépassé son délai de traitement. Une action est requise.');
        $this->global('alerte_retard_service_mgp', CanalNotification::Email, 'Alerte retard : dossier {reference}', 'Le dossier {reference} ({parcours}) a dépassé son délai de traitement. Une action est requise.');

        $this->global('alerte_retard_direction', CanalNotification::Outil, 'Alerte direction : dossier {reference} très en retard', 'Le dossier {reference} ({parcours}) dépasse son délai de traitement de plus de 50 %. Votre attention est requise.');
        $this->global('alerte_retard_direction', CanalNotification::Email, 'Alerte direction : dossier {reference} très en retard', 'Le dossier {reference} ({parcours}) dépasse son délai de traitement de plus de 50 %. Votre attention est requise.');

        $this->global('circuit_critique', CanalNotification::Outil, '🚨 Déclaration critique — {reference}', 'Une déclaration classée « Critique » vient d\'être soumise ({reference}, {parcours}). Premières mesures conservatoires attendues sous 24h. Information continue de la Direction Générale jusqu\'à clôture.');

        $this->critique(ParcoursCode::EiEmploye, 'EI Employé', ['prevention@example.test']);
        $this->critique(ParcoursCode::GriefEmploye, 'Grief Employé', []);
        $this->critique(ParcoursCode::GriefSousTraitant, 'Grief Sous-traitant', []);
        $this->critique(ParcoursCode::GriefCommunaute, 'Grief Communauté', ['directions@example.test']);
    }

    private function global(string $evenementCode, CanalNotification $canal, string $objet, string $corps): void
    {
        NotificationTemplate::query()->updateOrCreate(
            ['evenement_code' => $evenementCode, 'parcours_id' => null, 'canal' => $canal->value],
            ['objet' => $objet, 'corps' => $corps, 'actif' => true],
        );
    }

    /** @param  list<string>  $destinatairesSupplementaires */
    private function critique(ParcoursCode $parcoursCode, string $libelleParcours, array $destinatairesSupplementaires): void
    {
        $parcours = Parcours::query()->where('code', $parcoursCode->value)->first();

        if ($parcours === null) {
            return;
        }

        NotificationTemplate::query()->updateOrCreate(
            ['evenement_code' => 'circuit_critique', 'parcours_id' => $parcours->id, 'canal' => CanalNotification::Email->value],
            [
                'objet' => "🚨 Déclaration critique {$libelleParcours} — {reference}",
                'corps' => "Une déclaration classée « Critique » vient d'être soumise ({reference}, {$libelleParcours}). Premières mesures conservatoires attendues sous 24h. Information continue de la Direction Générale jusqu'à clôture.",
                'destinataires_email_supplementaires' => $destinatairesSupplementaires === [] ? null : $destinatairesSupplementaires,
                'actif' => true,
            ],
        );
    }
}
