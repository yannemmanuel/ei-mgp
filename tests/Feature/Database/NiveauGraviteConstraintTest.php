<?php

use App\Enums\NiveauGraviteCode;
use App\Models\NiveauGravite;
use Illuminate\Database\QueryException;

it('rejects a gravity level outside 1-4 via the database CHECK constraint (CDC §11.1)', function () {
    expect(fn () => NiveauGravite::create([
        'niveau' => 9,
        'code' => NiveauGraviteCode::Faible->value,
        'libelle' => 'Invalide',
        'effet_circuit' => 'standard',
        'actif' => true,
    ]))->toThrow(QueryException::class);
});

it('rejects a gravity level of zero via the database CHECK constraint', function () {
    expect(fn () => NiveauGravite::create([
        'niveau' => 0,
        'code' => NiveauGraviteCode::Faible->value,
        'libelle' => 'Invalide',
        'effet_circuit' => 'standard',
        'actif' => true,
    ]))->toThrow(QueryException::class);
});
