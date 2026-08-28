<?php

use App\Http\Controllers\PieceJointeDownloadController;
use App\Http\Controllers\QrCodeRedirectController;
use App\Livewire\Administration\CanauxAdmin;
use App\Livewire\Administration\CategoriesAdmin;
use App\Livewire\Administration\NotificationTemplatesAdmin;
use App\Livewire\Administration\QrCodesAdmin;
use App\Livewire\Administration\SitesAdmin;
use App\Livewire\Administration\StatutsAdmin;
use App\Livewire\Administration\UtilisateursAdmin;
use App\Livewire\Declaration\EiEmployeForm;
use App\Livewire\Declaration\GriefCommunauteForm;
use App\Livewire\Declaration\GriefEmployeForm;
use App\Livewire\Declaration\GriefSousTraitantForm;
use App\Livewire\Dossiers\DossierDetailPage;
use App\Livewire\Dossiers\DossierListPage;
use App\Livewire\Investigations\InvestigationDetailPage;
use App\Livewire\Suivi\SuiviDossier;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return redirect(auth()->check() ? '/dashboard' : '/login');
});

Route::get('/dashboard', function () {
    return view('dashboard');
})->middleware('auth')->name('dashboard');

// Module 2 — Gestion des dossiers (EX-GES-01 à 06).
Route::middleware('auth')->group(function () {
    Route::get('/dossiers', DossierListPage::class)->name('dossiers.index');
    Route::get('/dossiers/{dossier}', DossierDetailPage::class)->name('dossiers.show');
    Route::get('/pieces-jointes/{pieceJointe}/telecharger', PieceJointeDownloadController::class)->name('pieces-jointes.telecharger');
});

// Module 3 — Investigations (EX-INV-01 à 05). {investigation} scopée à {dossier} via la relation
// Investigation::dossier() (convention Laravel de scoping implicite des bindings imbriqués),
// revérifiée explicitement dans InvestigationDetailPage::mount() par défense en profondeur.
Route::middleware('auth')->group(function () {
    Route::get('/dossiers/{dossier}/investigations/{investigation}', InvestigationDetailPage::class)->name('dossiers.investigations.show');
});

// Module 1 — Déclaration (EX-DEC-01/02/05) : accès public, sans compte, par QR code ou lien direct.
Route::middleware('throttle:declaration')->group(function () {
    Route::get('/declarer/ei-employe', EiEmployeForm::class)->name('declarer.ei-employe');
    Route::get('/declarer/grief-employe', GriefEmployeForm::class)->name('declarer.grief-employe');
    Route::get('/declarer/grief-sous-traitant', GriefSousTraitantForm::class)->name('declarer.grief-sous-traitant');
    Route::get('/declarer/grief-communaute', GriefCommunauteForm::class)->name('declarer.grief-communaute');

    Route::get('/q/{token}', QrCodeRedirectController::class)->name('qr.redirect');

    // EX-NOT-06 : page de suivi publique (référence + code d'accès). Le débit réel de la
    // recherche est contrôlé dans SuiviDossier::rechercher() (cf. DT-14) : ce middleware ne
    // couvre que le chargement initial de la page.
    Route::get('/suivi', SuiviDossier::class)->name('suivi.index');
});

// Administration (Phase 10, DT-02) : pas d'exigence EX-* dédiée dans le CDC (répartie entre
// service_mgp — référentiels métier — et administrateur_digital — paramétrage technique).
// docs/exigences-securite.md §2 : middleware permission: sur toutes les routes back-office, ces
// écrans n'ayant pas de cloisonnement par parcours contrairement aux dossiers/investigations.
Route::middleware('auth')->prefix('administration')->name('administration.')->group(function () {
    Route::get('/', function () {
        return view('administration.index');
    })->name('index');

    Route::middleware('permission:users.manage')->get('/utilisateurs', UtilisateursAdmin::class)->name('utilisateurs');
    Route::middleware('permission:referentiels.categories.manage')->get('/categories', CategoriesAdmin::class)->name('categories');
    Route::middleware('permission:referentiels.statuts.manage')->get('/statuts', StatutsAdmin::class)->name('statuts');
    Route::middleware('permission:referentiels.sites.manage')->get('/sites', SitesAdmin::class)->name('sites');
    Route::middleware('permission:canaux.manage')->get('/canaux', CanauxAdmin::class)->name('canaux');
    Route::middleware('permission:notifications.templates.manage')->get('/notifications', NotificationTemplatesAdmin::class)->name('notifications');
    Route::middleware('permission:qrcodes.manage')->get('/qr-codes', QrCodesAdmin::class)->name('qr-codes');
});

// EX-DEC-10 : saisie relais, réservée aux agents authentifiés porteurs de dossiers.create.
Route::middleware(['auth', 'throttle:declaration'])->group(function () {
    Route::get('/relais/ei-employe', EiEmployeForm::class)->name('relais.ei-employe')->defaults('viaRelais', true);
    Route::get('/relais/grief-employe', GriefEmployeForm::class)->name('relais.grief-employe')->defaults('viaRelais', true);
    Route::get('/relais/grief-sous-traitant', GriefSousTraitantForm::class)->name('relais.grief-sous-traitant')->defaults('viaRelais', true);
    Route::get('/relais/grief-communaute', GriefCommunauteForm::class)->name('relais.grief-communaute')->defaults('viaRelais', true);
});
