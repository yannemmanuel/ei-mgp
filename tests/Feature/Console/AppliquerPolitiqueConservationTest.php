<?php

use App\Enums\ParcoursCode;
use App\Models\DeclarationIdentite;

beforeEach(fn () => seedReferentiels());

it('archive, anonymise et rapporte les exclusions pour contentieux en une seule commande (RG-11)', function () {
    $aArchiver = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $aArchiver->update(['date_cloture' => now()->subMonths(25)]);

    $aAnonymiser = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $aAnonymiser->update(['is_anonymous' => false, 'date_cloture' => now()->subYears(11)]);
    DeclarationIdentite::factory()->create(['dossier_id' => $aAnonymiser->id]);

    $exclu = createTestDossierForParcours(ParcoursCode::EiEmploye->value);
    $exclu->update(['is_anonymous' => false, 'date_cloture' => now()->subYears(11), 'contentieux' => true]);
    DeclarationIdentite::factory()->create(['dossier_id' => $exclu->id]);

    // Les 3 dossiers ont tous une date_cloture antérieure au seuil d'archivage (24 mois) : les
    // dossiers déjà éligibles à l'anonymisation (aAnonymiser, exclu) sont aussi comptés ici,
    // l'archivage n'étant pas conditionné à l'absence d'anonymisation ultérieure. Une seule
    // assertion de contenu (et non plusieurs expectsOutputToContain) : le message est écrit en un
    // seul appel doWrite, et seule la première expectation correspondante serait consommée.
    $this->artisan('dossiers:appliquer-politique-conservation')
        ->assertSuccessful()
        ->expectsOutputToContain('3 dossier(s) archivé(s), 1 anonymisé(s), 1 exclu(s) pour contentieux actif');

    expect($aArchiver->fresh()->archive_le)->not->toBeNull()
        ->and($aAnonymiser->fresh()->anonymise_le)->not->toBeNull()
        ->and(DeclarationIdentite::where('dossier_id', $exclu->id)->exists())->toBeTrue();
});
