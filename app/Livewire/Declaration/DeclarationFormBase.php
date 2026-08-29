<?php

namespace App\Livewire\Declaration;

use App\Enums\CanalCaptageCode;
use App\Enums\ParcoursCode;
use App\Models\CanalCaptage;
use App\Models\Categorie;
use App\Models\NiveauGravite;
use App\Services\Declaration\DeclarationService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Livewire\Component;
use Livewire\Features\SupportFileUploads\TemporaryUploadedFile;
use Livewire\WithFileUploads;
use RuntimeException;

/**
 * Socle commun aux 4 formulaires de déclaration (CDC §9). Chaque parcours a des champs propres
 * (déclinés dans les sous-classes) mais partage : anonymat (EX-DEC-03), catégorie/gravité,
 * pièces jointes (EX-DEC-06), anti-spam (DT-14), et l'appel unique à DeclarationService.
 *
 * Ne jamais dupliquer cette logique dans une sous-classe : ajouter ici tout comportement commun
 * aux 4 parcours, dans la sous-classe uniquement ce qui est vraiment spécifique à un parcours.
 *
 * @property-read Collection<int, Categorie> $categoriesDisponibles
 * @property-read Collection<int, NiveauGravite> $niveauxGraviteDisponibles
 * @property-read bool $categorieEstAutre
 * @property-read Collection<int, CanalCaptage> $canauxRelais
 */
abstract class DeclarationFormBase extends Component
{
    use WithFileUploads;

    public bool $anonymat = false;

    public string $categorieId = '';

    public string $categorieAutrePrecision = '';

    public string $niveauGraviteId = '';

    public string $description = '';

    /** @var array<int, TemporaryUploadedFile> */
    public array $fichiers = [];

    public bool $viaRelais = false;

    public string $canalRelaisChoisi = '';

    // Anti-spam (DT-14) : champ invisible (CSS) qu'un humain ne remplit jamais, et délai
    // minimum entre l'affichage et la soumission.
    public string $piegeAraignee = '';

    public int $horodatageAffichage = 0;

    public bool $soumis = false;

    public ?string $referenceGeneree = null;

    public ?string $codeAccesGenere = null;

    abstract protected function parcoursCode(): ParcoursCode;

    /** @return array<string, array<int, mixed>> */
    abstract protected function reglesSpecifiques(): array;

    /** @return array<string, string> */
    abstract protected function messagesSpecifiques(): array;

    /** @return array<string, mixed> */
    abstract protected function donneesDossierSpecifiques(): array;

    /** @return array<string, mixed> */
    abstract protected function donneesIdentiteSpecifiques(): array;

    /**
     * $viaRelais est fourni explicitement par la route (Route::defaults('viaRelais', true) sur
     * le groupe /relais/*, cf. routes/web.php) plutôt que déduit du nom de la route courante :
     * plus robuste, et testable directement via Livewire::test(Component::class, ['viaRelais' => true]).
     */
    public function mount(bool $viaRelais = false): void
    {
        $this->horodatageAffichage = now()->timestamp;
        $this->viaRelais = $viaRelais;

        if ($this->viaRelais) {
            abort_unless(Auth::check() && Auth::user()->can('dossiers.create'), 403);
        }
    }

    protected function estParcoursEmploye(): bool
    {
        return in_array($this->parcoursCode(), [ParcoursCode::EiEmploye, ParcoursCode::GriefEmploye], true);
    }

    /**
     * Mis en cache (DT-34) : le formulaire de déclaration est la page la plus exposée de
     * l'application (publique, sans authentification, potentiellement à fort trafic — CDC §9),
     * et ces référentiels ne changent qu'au rythme de l'administration (Phase 10), jamais en
     * cours de session. Fenêtre de 5 minutes : compromis délibéré plutôt qu'une invalidation
     * explicite câblée dans chaque action d'administration — un ajout/retrait de catégorie met au
     * plus 5 minutes à apparaître sur le formulaire public, jugé largement acceptable pour des
     * référentiels qui changent rarement.
     */
    public function getCategoriesDisponiblesProperty(): Collection
    {
        return Cache::remember(
            "declaration.categories-actives.{$this->parcoursCode()->value}",
            300,
            fn () => Categorie::query()
                ->whereHas('parcours', fn ($q) => $q->where('code', $this->parcoursCode()->value))
                ->actif()
                ->orderBy('ordre')
                ->get()
        );
    }

    public function getNiveauxGraviteDisponiblesProperty(): Collection
    {
        return Cache::remember(
            'declaration.niveaux-gravite-actifs',
            300,
            fn () => NiveauGravite::query()->actif()->orderBy('niveau')->get()
        );
    }

    public function getCategorieEstAutreProperty(): bool
    {
        return $this->categorieId !== ''
            && optional($this->categoriesDisponibles->firstWhere('id', (int) $this->categorieId))->is_autre === true;
    }

    protected function reglesCommunes(): array
    {
        $regles = [
            'categorieId' => ['required', 'integer', 'exists:categories,id'],
            'categorieAutrePrecision' => ['nullable', 'string', 'max:500'],
            'niveauGraviteId' => ['required', 'integer', 'exists:niveaux_gravite,id'],
            'description' => ['required', 'string', 'min:20'],
            'fichiers' => ['array', 'max:5'],
            'fichiers.*' => ['file', 'max:51200'],
        ];

        if ($this->viaRelais) {
            $regles['canalRelaisChoisi'] = ['required', 'in:ligne_verte,boite_suggestions,agent_local'];
        }

        return $regles;
    }

    protected function messagesCommunes(): array
    {
        return [
            'categorieId.required' => 'Merci de sélectionner une catégorie.',
            'niveauGraviteId.required' => 'Merci de sélectionner un niveau de gravité.',
            'description.required' => 'Merci de décrire les faits.',
            'description.min' => 'La description doit contenir au moins 20 caractères.',
            'fichiers.max' => 'Vous ne pouvez joindre que 5 fichiers maximum.',
            'fichiers.*.max' => 'Chaque fichier ne doit pas dépasser 50 Mo.',
            'canalRelaisChoisi.required' => 'Merci d\'indiquer le canal d\'origine de cette déclaration.',
        ];
    }

    public function submit(DeclarationService $service): void
    {
        // Anti-spam silencieux : un bot qui remplit le champ piège reçoit un faux succès sans
        // qu'aucune écriture n'ait lieu (ne pas lui signaler que le formulaire l'a détecté).
        if ($this->piegeAraignee !== '') {
            $this->soumis = true;

            return;
        }

        if ((now()->timestamp - $this->horodatageAffichage) < 3) {
            $this->addError('description', 'Le formulaire a été soumis trop rapidement. Merci de réessayer.');

            return;
        }

        // Le débit de soumission (action sensible) est contrôlé ici plutôt que par un
        // middleware de route : les interactions Livewire transitent par un unique endpoint
        // partagé (/livewire/update), un throttle de route ne cible donc pas spécifiquement
        // cette action (docs/exigences-securite.md §4).
        $cle = 'declaration-submit:'.request()->ip();
        if (RateLimiter::tooManyAttempts($cle, 5)) {
            $this->addError('description', 'Trop de déclarations envoyées depuis cette connexion. Merci de réessayer plus tard.');

            return;
        }
        RateLimiter::hit($cle, 600);

        if (! $this->anonymat && $this->estParcoursEmploye() && ! Auth::check()) {
            $this->addError(
                'anonymat',
                'Une déclaration identifiée nécessite une connexion avec votre compte professionnel. '
                .'Cochez « Je souhaite rester anonyme » pour continuer sans connexion.'
            );

            return;
        }

        $this->validate(
            [...$this->reglesCommunes(), ...$this->reglesSpecifiques()],
            [...$this->messagesCommunes(), ...$this->messagesSpecifiques()],
        );

        if ($this->categorieEstAutre && blank($this->categorieAutrePrecision)) {
            $this->addError('categorieAutrePrecision', 'Merci de préciser la catégorie « Autre ».');

            return;
        }

        $canal = $this->viaRelais ? $this->canalRelaisChoisi : CanalCaptageCode::QrCode->value;

        $declarantUserId = (! $this->anonymat && $this->estParcoursEmploye() && Auth::check() && ! $this->viaRelais)
            ? Auth::id()
            : null;

        try {
            $resultat = $service->creer(
                parcoursCode: $this->parcoursCode(),
                canalCaptageCode: $canal,
                anonyme: $this->anonymat,
                donneesDossier: [
                    'categorie_id' => (int) $this->categorieId,
                    'categorie_autre_precision' => $this->categorieAutrePrecision ?: null,
                    'niveau_gravite_id' => (int) $this->niveauGraviteId,
                    'description' => $this->description,
                    'declarant_user_id' => $declarantUserId,
                    ...$this->donneesDossierSpecifiques(),
                ],
                donneesIdentite: $this->anonymat ? [] : $this->donneesIdentiteSpecifiques(),
                fichiers: $this->fichiers,
                televersePar: $this->viaRelais ? Auth::id() : null,
            );
        } catch (RuntimeException $e) {
            $this->addError('fichiers', $e->getMessage());

            return;
        }

        $this->referenceGeneree = $resultat['dossier']->reference;
        $this->codeAccesGenere = $resultat['code_acces'];
        $this->soumis = true;
    }

    /** Utilisé par les vues pour lister les canaux disponibles en mode saisie relais (EX-DEC-10). */
    public function getCanauxRelaisProperty(): Collection
    {
        return CanalCaptage::query()
            ->whereIn('code', ['ligne_verte', 'boite_suggestions', 'agent_local'])
            ->actif()
            ->get();
    }
}
