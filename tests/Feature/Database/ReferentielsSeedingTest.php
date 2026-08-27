<?php

use App\Enums\ParcoursCode;
use App\Models\CanalCaptage;
use App\Models\Categorie;
use App\Models\Direction;
use App\Models\NiveauGravite;
use App\Models\Parcours;
use App\Models\Site;
use App\Models\StatutDossier;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\QueryException;

it('seeds exactly the 4 parcours defined by the CDC (§2.1)', function () {
    $this->seed(DatabaseSeeder::class);

    expect(Parcours::count())->toBe(4);

    $codes = Parcours::pluck('code')->map(fn (ParcoursCode $c) => $c->value)->sort()->values()->all();

    expect($codes)->toBe([
        'ei_employe',
        'grief_communaute',
        'grief_employe',
        'grief_sous_traitant',
    ]);
});

it('seeds the exact category counts per parcours defined in CDC §9', function () {
    $this->seed(DatabaseSeeder::class);

    $attendus = [
        ParcoursCode::EiEmploye->value => 6,
        ParcoursCode::GriefEmploye->value => 9,
        ParcoursCode::GriefSousTraitant->value => 8,
        ParcoursCode::GriefCommunaute->value => 9,
    ];

    foreach ($attendus as $code => $nombre) {
        $parcours = Parcours::where('code', $code)->firstOrFail();
        expect($parcours->categories()->count())->toBe($nombre, "Le parcours {$code} devrait avoir {$nombre} catégories.");
    }
});

it('marks exactly one "Autre" category per parcours, per RG-09', function () {
    $this->seed(DatabaseSeeder::class);

    foreach (Parcours::all() as $parcours) {
        expect($parcours->categories()->where('is_autre', true)->count())->toBe(1);
    }
});

it('seeds the unique 4-level gravity scale defined in CDC §11.1', function () {
    $this->seed(DatabaseSeeder::class);

    expect(NiveauGravite::count())->toBe(4);
    expect(NiveauGravite::where('niveau', 4)->firstOrFail()->isCritique())->toBeTrue();
    expect(NiveauGravite::where('niveau', 1)->firstOrFail()->isCritique())->toBeFalse();
});

it('seeds the 10 internal dossier statuses defined in CDC §7.1', function () {
    $this->seed(DatabaseSeeder::class);

    expect(StatutDossier::count())->toBe(10);
    expect(StatutDossier::where('is_terminal', true)->count())->toBe(2); // Clôturé, Rejeté
});

it('seeds the 4 capture channels defined in CDC §6.7', function () {
    $this->seed(DatabaseSeeder::class);

    expect(CanalCaptage::count())->toBe(4);
});

it('seeds sites and directions referentials', function () {
    $this->seed(DatabaseSeeder::class);

    expect(Site::count())->toBeGreaterThan(0);
    expect(Direction::count())->toBeGreaterThan(0);
});

it('is idempotent: running the referential seeders twice does not duplicate rows', function () {
    $this->seed(DatabaseSeeder::class);
    $this->seed(DatabaseSeeder::class);

    expect(Parcours::count())->toBe(4);
    expect(Categorie::count())->toBe(32);
    expect(NiveauGravite::count())->toBe(4);
    expect(StatutDossier::count())->toBe(10);
});

it('rejects a category code duplicated within the same parcours', function () {
    $this->seed(DatabaseSeeder::class);

    $parcours = Parcours::where('code', ParcoursCode::EiEmploye->value)->firstOrFail();
    $existing = $parcours->categories()->first();

    expect(fn () => Categorie::create([
        'parcours_id' => $parcours->id,
        'code' => $existing->code,
        'libelle' => 'Doublon',
    ]))->toThrow(QueryException::class);
});
