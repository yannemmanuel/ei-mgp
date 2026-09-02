<?php

use App\Http\Controllers\PieceJointeDownloadController;
use App\Http\Controllers\QrCodeRedirectController;
use App\Livewire\ActionsCorrectives\ActionCorrectiveListPage;
use App\Livewire\Administration\CanauxAdmin;
use App\Livewire\Administration\CategoriesAdmin;
use App\Livewire\Administration\NotificationTemplatesAdmin;
use App\Livewire\Administration\QrCodesAdmin;
use App\Livewire\Administration\SitesAdmin;
use App\Livewire\Administration\StatutsAdmin;
use App\Livewire\Administration\UtilisateursAdmin;
use App\Livewire\Audit\AuditLogViewer;
use App\Livewire\Declaration\EiEmployeForm;
use App\Livewire\Declaration\GriefCommunauteForm;
use App\Livewire\Declaration\GriefEmployeForm;
use App\Livewire\Declaration\GriefSousTraitantForm;
use App\Livewire\Dossiers\DossierDetailPage;
use App\Livewire\Dossiers\DossierListPage;
use App\Livewire\Investigations\InvestigationDetailPage;
use App\Livewire\Investigations\InvestigationListPage;
use App\Livewire\Reporting\DashboardConsolide;
use App\Livewire\Suivi\SuiviDossier;
use App\Models\CanalCaptage;
use App\Models\Categorie;
use App\Models\NotificationTemplate;
use App\Models\QrCode;
use App\Models\Site;
use App\Models\StatutDossier;
use App\Models\User;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return redirect(auth()->check() ? '/dashboard' : '/login');
});

// Module 6 — Reporting (EX-REP-01/02) : page d'atterrissage post-connexion pour TOUS les
// utilisateurs authentifiés — le contenu (tableau de bord consolidé ou résumé personnel) se
// ramifie selon reporting.view à l'intérieur du composant, jamais un 403 ici (docs/decisions-
// techniques.md DT-31).
Route::get('/dashboard', DashboardConsolide::class)->middleware('auth')->name('dashboard');

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
    Route::get('/investigations', InvestigationListPage::class)->name('investigations.index');
});

// Vue transverse des actions correctives (toutes dossiers confondus) — gestion au jour le jour
// restant sur le panneau ActionCorrectivePanel embarqué dans la fiche dossier.
Route::middleware('auth')->group(function () {
    Route::get('/actions-correctives', ActionCorrectiveListPage::class)->name('actions-correctives.index');
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
    // Compteurs du centre d'administration (docs/page-redesign-map.md §5) — count() triviaux sur
    // une page peu visitée, pas besoin d'un composant Livewire dédié pour ça.
    Route::get('/', function () {
        return view('administration.index', [
            'nbUtilisateurs' => User::query()->where('actif', true)->count(),
            'nbCategories' => Categorie::query()->actif()->count(),
            'nbStatuts' => StatutDossier::query()->count(),
            'nbSites' => Site::query()->actif()->count(),
            'nbCanaux' => CanalCaptage::query()->actif()->count(),
            'nbNotifications' => NotificationTemplate::query()->count(),
            'nbQrCodes' => QrCode::query()->count(),
        ]);
    })->name('index');

    Route::middleware('permission:users.manage')->get('/utilisateurs', UtilisateursAdmin::class)->name('utilisateurs');
    Route::middleware('permission:referentiels.categories.manage')->get('/categories', CategoriesAdmin::class)->name('categories');
    Route::middleware('permission:referentiels.statuts.manage')->get('/statuts', StatutsAdmin::class)->name('statuts');
    Route::middleware('permission:referentiels.sites.manage')->get('/sites', SitesAdmin::class)->name('sites');
    Route::middleware('permission:canaux.manage')->get('/canaux', CanauxAdmin::class)->name('canaux');
    Route::middleware('permission:notifications.templates.manage')->get('/notifications', NotificationTemplatesAdmin::class)->name('notifications');
    Route::middleware('permission:qrcodes.manage')->get('/qr-codes', QrCodesAdmin::class)->name('qr-codes');
});

// Audit (Phase 11, docs/exigences-audit.md §4) : lecture seule, réservée à auditeur/dpo/service_mgp.
Route::middleware(['auth', 'permission:audit.view'])->get('/audit', AuditLogViewer::class)->name('audit.index');

// EX-DEC-10 : saisie relais, réservée aux agents authentifiés porteurs de dossiers.create.
Route::middleware(['auth', 'throttle:declaration'])->group(function () {
    Route::get('/relais/ei-employe', EiEmployeForm::class)->name('relais.ei-employe')->defaults('viaRelais', true);
    Route::get('/relais/grief-employe', GriefEmployeForm::class)->name('relais.grief-employe')->defaults('viaRelais', true);
    Route::get('/relais/grief-sous-traitant', GriefSousTraitantForm::class)->name('relais.grief-sous-traitant')->defaults('viaRelais', true);
    Route::get('/relais/grief-communaute', GriefCommunauteForm::class)->name('relais.grief-communaute')->defaults('viaRelais', true);
});
