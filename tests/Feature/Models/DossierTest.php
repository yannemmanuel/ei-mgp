<?php

use App\Models\DeclarationIdentite;
use App\Models\Dossier;
use Illuminate\Support\Str;

it('generates a ULID primary key rather than an auto-incrementing integer', function () {
    $dossier = Dossier::factory()->create();

    expect(Str::isUlid($dossier->id))->toBeTrue();
});

it('never persists a declaration_identites row for an anonymous dossier (RG-06)', function () {
    $dossier = Dossier::factory()->anonyme()->create();

    expect($dossier->is_anonymous)->toBeTrue();
    expect($dossier->declarant_user_id)->toBeNull();
    expect(DeclarationIdentite::where('dossier_id', $dossier->id)->exists())->toBeFalse();
    expect($dossier->identite)->toBeNull();
});

it('allows a declaration_identites row for a non-anonymous dossier', function () {
    $dossier = Dossier::factory()->create(['is_anonymous' => false]);
    DeclarationIdentite::factory()->create(['dossier_id' => $dossier->id]);

    expect($dossier->fresh()->identite)->not->toBeNull();
});

it('never exposes access_code_hash when the model is serialized', function () {
    $dossier = Dossier::factory()->anonyme()->create();

    expect($dossier->toArray())->not->toHaveKey('access_code_hash');
});

it('marks a level-4 gravity dossier as critical through its niveauGravite relation', function () {
    $dossier = Dossier::factory()->critique()->create();

    expect($dossier->niveauGravite->isCritique())->toBeTrue();
});

it('exposes the parcours, categorie, statut and canalCaptage relations', function () {
    $dossier = Dossier::factory()->create();

    expect($dossier->parcours)->not->toBeNull()
        ->and($dossier->categorie)->not->toBeNull()
        ->and($dossier->statut)->not->toBeNull()
        ->and($dossier->canalCaptage)->not->toBeNull();
});
