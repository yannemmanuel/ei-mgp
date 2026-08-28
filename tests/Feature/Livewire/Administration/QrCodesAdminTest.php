<?php

use App\Enums\ParcoursCode;
use App\Livewire\Administration\QrCodesAdmin;
use App\Models\Parcours;
use App\Models\QrCode;
use App\Models\User;
use Livewire\Livewire;

beforeEach(fn () => seedReferentiels());

it('forbids access without qrcodes.manage', function () {
    $gestionnaire = User::factory()->create();
    $gestionnaire->assignRole('service_mgp');

    $this->actingAs($gestionnaire)->get(route('administration.qr-codes'))->assertForbidden();
});

it('generates a QR code pointing at the declaration route for the chosen parcours (EX-DEC-01)', function () {
    $admin = User::factory()->create();
    $admin->assignRole('administrateur_digital');
    $parcours = Parcours::where('code', ParcoursCode::EiEmploye->value)->firstOrFail();

    Livewire::actingAs($admin)->test(QrCodesAdmin::class)
        ->set('parcoursId', (string) $parcours->id)
        ->call('generer')
        ->assertHasNoErrors();

    $qrCode = QrCode::where('parcours_id', $parcours->id)->firstOrFail();
    expect($qrCode->url_cible)->toBe(route('declarer.ei-employe'))
        ->and($qrCode->actif)->toBeTrue()
        ->and($qrCode->genere_par)->toBe($admin->id);
});

it('toggles a QR code active/inactive and lets its target URL be edited', function () {
    $admin = User::factory()->create();
    $admin->assignRole('administrateur_digital');
    $parcours = Parcours::where('code', ParcoursCode::EiEmploye->value)->firstOrFail();
    $qrCode = QrCode::factory()->create(['parcours_id' => $parcours->id, 'actif' => true]);

    Livewire::actingAs($admin)->test(QrCodesAdmin::class)
        ->call('basculerActif', $qrCode->id)
        ->assertHasNoErrors();
    expect($qrCode->fresh()->actif)->toBeFalse();

    Livewire::actingAs($admin)->test(QrCodesAdmin::class)
        ->call('modifier', $qrCode->id)
        ->set('urlCible', 'https://example.test/nouvelle-cible')
        ->call('enregistrerUrl')
        ->assertHasNoErrors();
    expect($qrCode->fresh()->url_cible)->toBe('https://example.test/nouvelle-cible');
});
