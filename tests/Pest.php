<?php

use App\Models\CanalCaptage;
use App\Models\Categorie;
use App\Models\Dossier;
use App\Models\NiveauGravite;
use App\Models\Parcours;
use App\Models\StatutDossier;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

/**
 * Crée un dossier de test rattaché au parcours donné, avec une catégorie de ce même parcours
 * (requis par la contrainte d'intégrité categories.parcours_id -> parcours). Les référentiels
 * (ParcoursSeeder, CategorieSeeder, NiveauGraviteSeeder, StatutDossierSeeder, CanalCaptageSeeder)
 * doivent avoir été semés au préalable par le test appelant.
 */
function createTestDossierForParcours(string $parcoursCode): Model
{
    $parcours = Parcours::where('code', $parcoursCode)->firstOrFail();

    return Dossier::factory()->create([
        'parcours_id' => $parcours->id,
        'categorie_id' => Categorie::where('parcours_id', $parcours->id)->first()->id,
        'niveau_gravite_id' => NiveauGravite::first()->id,
        'statut_id' => StatutDossier::first()->id,
        'canal_captage_id' => CanalCaptage::first()->id,
    ]);
}
