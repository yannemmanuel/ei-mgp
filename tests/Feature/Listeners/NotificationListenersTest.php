<?php

use App\Enums\CanalCaptageCode;
use App\Enums\ParcoursCode;
use App\Enums\StatutDossierCode;
use App\Models\NiveauGravite;
use App\Models\StatutDossier;
use App\Models\User;
use App\Notifications\DossierEvenementNotification;
use App\Services\Declaration\DeclarationService;
use App\Services\Dossier\AffectationService;
use App\Services\Workflow\DossierWorkflowService;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    seedReferentiels();
    Storage::fake('local');
});

it('notifies the newly assigned user when a dossier is manually reassigned (EX-NOT-01)', function () {
    Notification::fake();

    $chef = User::factory()->create();
    $nouveau = User::factory()->create();
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    app(AffectationService::class)->reaffecter($dossier, $nouveau, $chef, 'Prise en charge.');

    Notification::assertSentTo($nouveau, DossierEvenementNotification::class);
});

it('notifies the automatically assigned users at declaration time (EX-NOT-01)', function () {
    Notification::fake();

    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');
    $categorie = categorieDe(ParcoursCode::EiEmploye->value);

    app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: true,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 1)->first()->id,
            'description' => str_repeat('a', 25),
        ],
        donneesIdentite: [],
    );

    Notification::assertSentTo($rqse, DossierEvenementNotification::class);
});

it('notifies the identified declarant only when the DISPLAYED status actually changes (EX-NOT-02, RGI-10)', function () {
    Notification::fake();

    $declarant = User::factory()->create();
    $acteur = User::factory()->create();
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $dossier->update(['declarant_user_id' => $declarant->id]);

    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');
    // Affecté -> En analyse : "Reçu" -> "En cours d'analyse" (libellé affiché change).
    app(DossierWorkflowService::class)->changerStatut($dossier->fresh(), StatutDossierCode::EnAnalyse, $acteur);

    Notification::assertSentTo($declarant, DossierEvenementNotification::class);

    Notification::fake();
    app(DossierWorkflowService::class)->changerStatut($dossier->fresh(), StatutDossierCode::EnInvestigation, $acteur);
    // En analyse -> En investigation : "En cours d'analyse" -> "En traitement" (change bien).
    Notification::assertSentTo($declarant, DossierEvenementNotification::class);

    Notification::fake();
    app(DossierWorkflowService::class)->changerStatut($dossier->fresh(), StatutDossierCode::EnAttenteInformation, $acteur);
    // En investigation -> En attente d'information : les deux affichent "En traitement".
    Notification::assertNothingSent();
});

it('never notifies for an anonymous dossier (no declarant_user_id) on status change (RG-06)', function () {
    $acteur = User::factory()->create();
    $dossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    // declarant_user_id reste null (comportement par défaut de la factory).
    $dossier->update(['statut_id' => StatutDossier::where('code', StatutDossierCode::Affecte->value)->first()->id]);

    // Notification::fake() activé seulement ici : évite de capter la notification (non liée)
    // d'affectation qu'un vrai appel à AffectationService::reaffecter aurait déclenchée.
    Notification::fake();
    app(DossierWorkflowService::class)->changerStatut($dossier->fresh(), StatutDossierCode::EnAnalyse, $acteur);

    Notification::assertNothingSent();
});

it('dispatches the circuit accéléré synchronously, never via the queue (RG-08, EX-NOT-05)', function () {
    Queue::fake();

    $categorie = categorieDe(ParcoursCode::EiEmploye->value);

    app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: true,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 4)->first()->id,
            'description' => str_repeat('a', 25),
        ],
        donneesIdentite: [],
    );

    Queue::assertNothingPushed();
});

it('reaches the exact circuit accéléré destinataire matrix for EI Employé (§6.5)', function () {
    Notification::fake();

    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');
    $secretaire = User::factory()->create();
    $secretaire->assignRole('secretaire_csst');
    $president = User::factory()->create(['poste' => 'Directeur de structure']);
    $horsPerimetre = User::factory()->create();
    $horsPerimetre->assignRole('correspondant_mgp');

    $categorie = categorieDe(ParcoursCode::EiEmploye->value);

    app(DeclarationService::class)->creer(
        parcoursCode: ParcoursCode::EiEmploye,
        canalCaptageCode: CanalCaptageCode::QrCode->value,
        anonyme: true,
        donneesDossier: [
            'categorie_id' => $categorie->id,
            'niveau_gravite_id' => NiveauGravite::where('niveau', 4)->first()->id,
            'description' => str_repeat('a', 25),
        ],
        donneesIdentite: [],
    );

    Notification::assertSentTo($rqse, DossierEvenementNotification::class);
    Notification::assertSentTo($secretaire, DossierEvenementNotification::class);
    Notification::assertSentTo($president, DossierEvenementNotification::class);
    Notification::assertNotSentTo($horsPerimetre, DossierEvenementNotification::class);

    Notification::assertSentOnDemand(DossierEvenementNotification::class, function ($notification, $channels, $notifiable) {
        return ($notifiable->routes['mail'] ?? null) === 'prevention@example.test';
    });
});
