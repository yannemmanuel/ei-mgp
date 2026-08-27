<?php

use App\Models\ActionCorrective;
use App\Models\Dossier;
use App\Models\Investigation;
use App\Models\PieceJointe;

it('attaches a piece jointe to a dossier', function () {
    $dossier = Dossier::factory()->create();
    $piece = PieceJointe::factory()->create([
        'attachable_type' => Dossier::class,
        'attachable_id' => $dossier->id,
    ]);

    expect($dossier->piecesJointes)->toHaveCount(1);
    expect($piece->attachable->is($dossier))->toBeTrue();
});

it('attaches a piece jointe to an investigation', function () {
    $investigation = Investigation::factory()->create();
    PieceJointe::factory()->create([
        'attachable_type' => Investigation::class,
        'attachable_id' => $investigation->id,
    ]);

    expect($investigation->piecesJointes)->toHaveCount(1);
});

it('attaches a piece jointe to an action corrective', function () {
    $action = ActionCorrective::factory()->create();
    PieceJointe::factory()->create([
        'attachable_type' => ActionCorrective::class,
        'attachable_id' => $action->id,
    ]);

    expect($action->piecesJointes)->toHaveCount(1);
});

it('has no updated_at column tracked by Eloquent for pieces jointes (append-only uploads)', function () {
    expect(PieceJointe::UPDATED_AT)->toBeNull();
});
