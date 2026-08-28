<?php

use App\Livewire\Declaration\EiEmployeForm;
use App\Models\DeclarationIdentite;
use App\Models\Direction;
use App\Models\Dossier;
use App\Models\NiveauGravite;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;

beforeEach(function () {
    seedReferentiels();
    Storage::fake('local');
});

function champsValidesEiEmploye(): array
{
    return [
        'categorieId' => (string) categorieDe('ei_employe')->id,
        'niveauGraviteId' => (string) NiveauGravite::where('niveau', 1)->first()->id,
        'description' => str_repeat('a', 25),
        'dateSurvenance' => now()->subDay()->toDateString(),
        'lieu' => 'Atelier de concassage',
    ];
}

it('renders successfully on the public route (EX-DEC-02)', function () {
    $this->get(route('declarer.ei-employe'))->assertOk()->assertSeeLivewire(EiEmployeForm::class);
});

it('requires description, categorie, gravite, date and lieu (EX-DEC-07)', function () {
    Livewire::test(EiEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->call('submit')
        ->assertHasErrors(['categorieId', 'niveauGraviteId', 'description', 'dateSurvenance', 'lieu']);
});

it('requires direction when the declaration is not anonymous, but not nom/matricule (CDC §9.1)', function () {
    Livewire::actingAs(User::factory()->create())
        ->test(EiEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', false)
        ->set(champsValidesEiEmploye())
        ->call('submit')
        ->assertHasErrors(['directionId'])
        ->assertHasNoErrors(['nomPrenom', 'matricule']);
});

it('blocks a non-anonymous submission from an unauthenticated visitor (EX-DEC-04)', function () {
    Livewire::test(EiEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', false)
        ->set(champsValidesEiEmploye())
        ->set('directionId', (string) Direction::first()->id)
        ->call('submit')
        ->assertHasErrors(['anonymat']);

    expect(Dossier::count())->toBe(0);
});

it('creates an anonymous dossier without any identity row and shows the reference + access code (EX-DEC-03)', function () {
    Livewire::test(EiEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesEiEmploye())
        ->call('submit')
        ->assertHasNoErrors()
        ->assertSet('soumis', true);

    expect(Dossier::count())->toBe(1);
    $dossier = Dossier::first();
    expect($dossier->is_anonymous)->toBeTrue();
    expect($dossier->reference)->toStartWith('EI-');
    expect(DeclarationIdentite::count())->toBe(0);
});

it('creates an identified dossier linked to the authenticated employee', function () {
    $employe = User::factory()->create();
    $employe->assignRole('employe_declarant');

    Livewire::actingAs($employe)
        ->test(EiEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', false)
        ->set(champsValidesEiEmploye())
        ->set('directionId', (string) Direction::first()->id)
        ->set('nomPrenom', 'Awa Koffi')
        ->call('submit')
        ->assertHasNoErrors();

    $dossier = Dossier::first();
    expect($dossier->is_anonymous)->toBeFalse();
    expect($dossier->declarant_user_id)->toBe($employe->id);
    expect(DeclarationIdentite::where('dossier_id', $dossier->id)->first()->nom_prenom)->toBe('Awa Koffi');
});

it('rejects more than 5 attachments client-side', function () {
    $fichiers = collect(range(1, 6))->map(fn ($i) => UploadedFile::fake()->image("p{$i}.jpg"))->all();

    Livewire::test(EiEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesEiEmploye())
        ->set('fichiers', $fichiers)
        ->call('submit')
        ->assertHasErrors(['fichiers']);
});

it('silently pretends success for a bot filling the honeypot field, without creating a dossier', function () {
    Livewire::test(EiEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesEiEmploye())
        ->set('piegeAraignee', 'http://spam.example')
        ->call('submit')
        ->assertSet('soumis', true);

    expect(Dossier::count())->toBe(0);
});

it('rejects a submission made faster than the minimum fill time (DT-14)', function () {
    Livewire::test(EiEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesEiEmploye())
        ->set('horodatageAffichage', now()->timestamp)
        ->call('submit')
        ->assertHasErrors(['description']);

    expect(Dossier::count())->toBe(0);
});

it('rejects a date de survenance postérieure à aujourd\'hui (RGI-01)', function () {
    Livewire::test(EiEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesEiEmploye())
        ->set('dateSurvenance', now()->addDay()->toDateString())
        ->call('submit')
        ->assertHasErrors(['dateSurvenance']);

    expect(Dossier::count())->toBe(0);
});

it('accepts a date de survenance équal to today (RGI-01, boundary)', function () {
    Livewire::actingAs(User::factory()->create())
        ->test(EiEmployeForm::class)
        ->set('horodatageAffichage', now()->subSeconds(10)->timestamp)
        ->set('anonymat', true)
        ->set(champsValidesEiEmploye())
        ->set('dateSurvenance', now()->toDateString())
        ->call('submit')
        ->assertHasNoErrors();

    expect(Dossier::count())->toBe(1);
});
