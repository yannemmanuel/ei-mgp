<?php

use App\Enums\ParcoursCode;
use App\Livewire\Dossiers\DossierListPage;
use App\Models\StatutDossier;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('forbids a user with no dossiers.view* permission (agent_relais)', function () {
    $agent = User::factory()->create();
    $agent->assignRole('agent_relais');

    $this->actingAs($agent)->get(route('dossiers.index'))->assertForbidden();
});

it('lets rqse see only EI dossiers, not other parcours', function () {
    $rqse = User::factory()->create();
    $rqse->assignRole('rqse');

    $ei = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $communaute = createTestDossierForParcours(ParcoursCode::GriefCommunaute->value);

    $component = Livewire::actingAs($rqse)->test(DossierListPage::class);

    expect($component->get('dossiers')->pluck('id')->all())->toContain($ei->id);
    expect($component->get('dossiers')->pluck('id')->all())->not->toContain($communaute->id);
});

it('lets an employe_declarant see only their own, non-anonymous dossiers', function () {
    $employe = User::factory()->create();
    $employe->assignRole('employe_declarant');

    $sonDossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $sonDossier->update(['declarant_user_id' => $employe->id, 'is_anonymous' => false]);

    $autreDossier = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    $component = Livewire::actingAs($employe)->test(DossierListPage::class);

    expect($component->get('dossiers')->pluck('id')->all())->toBe([$sonDossier->id]);
    expect($component->get('dossiers')->pluck('id')->all())->not->toContain($autreDossier->id);
});

it('lets service_mgp see dossiers from all 4 parcours', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    foreach (ParcoursCode::cases() as $parcours) {
        createTestDossierForParcours($parcours->value);
    }

    $component = Livewire::actingAs($gestionnaire)->test(DossierListPage::class);

    expect($component->get('dossiers'))->toHaveCount(4);
});

it('filters by parcours (EX-GES-01)', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $ei = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    createTestDossierForParcours(ParcoursCode::GriefCommunaute->value);

    $component = Livewire::actingAs($gestionnaire)->test(DossierListPage::class)
        ->set('parcoursId', (string) $ei->parcours_id);

    expect($component->get('dossiers')->pluck('id')->all())->toBe([$ei->id]);
});

it('filters by statut (EX-GES-01)', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $ei = createTestDossierForParcours(ParcoursCode::EiEmploye->value);

    $memeStatut = Livewire::actingAs($gestionnaire)->test(DossierListPage::class)
        ->set('statutId', (string) $ei->statut_id);
    expect($memeStatut->get('dossiers')->pluck('id')->contains($ei->id))->toBeTrue();

    $autreStatut = Livewire::actingAs($gestionnaire)->test(DossierListPage::class)
        ->set('statutId', (string) StatutDossier::where('code', 'cloture')->first()->id);
    expect($autreStatut->get('dossiers')->pluck('id')->contains($ei->id))->toBeFalse();
});
