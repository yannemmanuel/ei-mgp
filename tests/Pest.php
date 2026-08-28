<?php

use App\Enums\StatutDossierCode;
use App\Models\CanalCaptage;
use App\Models\Categorie;
use App\Models\Dossier;
use App\Models\NiveauGravite;
use App\Models\Parcours;
use App\Models\StatutDossier;
use App\Models\User;
use App\Services\Dossier\AffectationService;
use App\Services\Workflow\DossierWorkflowService;
use Database\Seeders\CanalCaptageSeeder;
use Database\Seeders\CategorieSeeder;
use Database\Seeders\DirectionSeeder;
use Database\Seeders\NiveauGraviteSeeder;
use Database\Seeders\NotificationTemplateSeeder;
use Database\Seeders\ParcoursSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SiteSeeder;
use Database\Seeders\SlaDelaiSeeder;
use Database\Seeders\StatutDossierSeeder;
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

/**
 * Sème l'ensemble des référentiels fonctionnels (Phase 2) nécessaires aux tests du Module
 * Déclaration (Phase 4) : parcours, catégories, niveaux de gravité, statuts, canaux, sites,
 * directions, rôles/permissions.
 */
function seedReferentiels(): void
{
    (new DirectionSeeder)->run();
    (new SiteSeeder)->run();
    (new ParcoursSeeder)->run();
    (new CanalCaptageSeeder)->run();
    (new NiveauGraviteSeeder)->run();
    (new StatutDossierSeeder)->run();
    (new CategorieSeeder)->run();
    (new SlaDelaiSeeder)->run();
    (new NotificationTemplateSeeder)->run();
    (new RolePermissionSeeder)->run();
}

/**
 * Amène un dossier jusqu'au statut "En investigation" via de vraies transitions du workflow
 * (Recu -> Affecté -> En analyse -> En investigation), afin que historique_statuts contienne une
 * entrée exploitable par DelaiService::dateDebutEtape (RGI-05, Phase 6/7).
 */
function amenerDossierEnInvestigation(string $parcoursCode, User $acteur): Dossier
{
    $dossier = createTestDossierForParcours($parcoursCode);
    app(AffectationService::class)->reaffecter($dossier, $acteur, $acteur, 'Prise en charge.');

    $workflow = app(DossierWorkflowService::class);
    $workflow->changerStatut($dossier->fresh(), StatutDossierCode::EnAnalyse, $acteur);
    $workflow->changerStatut($dossier->fresh(), StatutDossierCode::EnInvestigation, $acteur);

    return $dossier->fresh();
}

/**
 * Amène un dossier jusqu'au statut "Action corrective en cours" via de vraies transitions du
 * workflow (Recu -> ... -> En investigation -> Action corrective en cours), pour les tests du
 * module Actions correctives (Phase 8).
 */
function amenerDossierEnActionCorrective(string $parcoursCode, User $acteur): Dossier
{
    $dossier = amenerDossierEnInvestigation($parcoursCode, $acteur);

    app(DossierWorkflowService::class)->changerStatut($dossier->fresh(), StatutDossierCode::ActionCorrectiveEnCours, $acteur);

    return $dossier->fresh();
}

/**
 * Retourne une catégorie active quelconque du parcours donné, hors "Autre" (référentiels déjà
 * semés). Exclure "Autre" explicitement : sans ORDER BY, Postgres ne garantit aucun ordre de
 * retour et peut renvoyer cette catégorie en premier (tri d'index sur son "code" alphabétique),
 * ce qui déclencherait à tort la validation de categorieAutrePrecision dans les tests qui ne
 * testent pas spécifiquement ce cas.
 */
function categorieDe(string $parcoursCode): Categorie
{
    return Categorie::whereHas('parcours', fn ($q) => $q->where('code', $parcoursCode))
        ->where('is_autre', false)
        ->firstOrFail();
}
