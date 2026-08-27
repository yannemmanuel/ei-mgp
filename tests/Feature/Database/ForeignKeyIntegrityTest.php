<?php

use App\Models\Categorie;
use App\Models\Dossier;
use App\Models\DossierAffectation;
use App\Models\Parcours;
use Illuminate\Database\QueryException;

it('prevents deleting a parcours referenced by categories (RESTRICT, docs/modele-donnees.md §1)', function () {
    $parcours = Parcours::factory()->create();
    Categorie::factory()->create(['parcours_id' => $parcours->id]);

    expect(fn () => $parcours->delete())->toThrow(QueryException::class);
});

it('prevents deleting a dossier referenced by an affectation (RESTRICT, RG-03 : no dossier is ever deleted)', function () {
    $dossier = Dossier::factory()->create();
    DossierAffectation::factory()->create(['dossier_id' => $dossier->id]);

    expect(fn () => $dossier->delete())->toThrow(QueryException::class);
});
