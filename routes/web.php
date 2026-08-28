<?php

use App\Http\Controllers\PieceJointeDownloadController;
use App\Http\Controllers\QrCodeRedirectController;
use App\Livewire\Declaration\EiEmployeForm;
use App\Livewire\Declaration\GriefCommunauteForm;
use App\Livewire\Declaration\GriefEmployeForm;
use App\Livewire\Declaration\GriefSousTraitantForm;
use App\Livewire\Dossiers\DossierDetailPage;
use App\Livewire\Dossiers\DossierListPage;
use App\Livewire\Investigations\InvestigationDetailPage;
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
});

// EX-DEC-10 : saisie relais, réservée aux agents authentifiés porteurs de dossiers.create.
Route::middleware(['auth', 'throttle:declaration'])->group(function () {
    Route::get('/relais/ei-employe', EiEmployeForm::class)->name('relais.ei-employe')->defaults('viaRelais', true);
    Route::get('/relais/grief-employe', GriefEmployeForm::class)->name('relais.grief-employe')->defaults('viaRelais', true);
    Route::get('/relais/grief-sous-traitant', GriefSousTraitantForm::class)->name('relais.grief-sous-traitant')->defaults('viaRelais', true);
    Route::get('/relais/grief-communaute', GriefCommunauteForm::class)->name('relais.grief-communaute')->defaults('viaRelais', true);
});
