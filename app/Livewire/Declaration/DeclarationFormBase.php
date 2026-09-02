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
use Illuminate\Validation\ValidationException;
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

    /** Étapes affichées dans le panneau de contexte du layout guest — identiques pour les 4 parcours. */
    public const ETAPES = [
        ['titre' => 'Décrivez les faits', 'description' => 'Lieu, date, ce qui s\'est passé.'],
        ['titre' => 'Recevez une référence', 'description' => 'Un numéro de dossier vous est remis immédiatement.'],
        ['titre' => 'Suivez l\'avancement', 'description' => 'Consultez l\'état de votre dossier à tout moment.'],
    ];

    /**
     * Wizard du formulaire (docs/page-redesign-map.md §4) — pagination de PRÉSENTATION
     * uniquement. La validation réellement autoritaire reste `submit()` ci-dessous, exécutée en
     * une seule fois avec les mêmes `reglesCommunes()`/`reglesSpecifiques()` qu'avant l'ajout du
     * wizard : `etapeSuivante()` ne fait qu'anticiper un sous-ensemble de cette même validation
     * pour donner un retour immédiat, elle ne la remplace jamais et ne doit pas être le seul
     * rempart. Le honeypot et le délai anti-bot (`piegeAraignee`/`horodatageAffichage`) restent
     * vérifiés uniquement dans `submit()`, jamais ici.
     */
    public const NB_ETAPES = 4;

    public int $etapeActuelle = 1;

    /** @return list<string> Libellés des 4 étapes, pour l'indicateur de progression. */
    public function libellesEtapes(): array
    {
        return ['Votre identité', 'Contexte', 'Nature de l\'évènement', 'Pièces jointes'];
    }

    public function etapeSuivante(): void
    {
        $champs = $this->champsEtape($this->etapeActuelle);

        if ($champs !== []) {
            $reglesEtape = array_intersect_key(
                [...$this->reglesCommunes(), ...$this->reglesSpecifiques()],
                array_flip($champs)
            );

            if ($reglesEtape !== []) {
                $this->validate($reglesEtape, [...$this->messagesCommunes(), ...$this->messagesSpecifiques()]);
            }

            if ($this->etapeActuelle === 3 && $this->categorieEstAutre && blank($this->categorieAutrePrecision)) {
                $this->addError('categorieAutrePrecision', 'Merci de préciser la catégorie « Autre ».');

                return;
            }
        }

        $this->etapeActuelle = min($this->etapeActuelle + 1, self::NB_ETAPES);
        $this->dispatch('wizard-progression', etapeActuelle: $this->etapeActuelle, soumis: $this->soumis);
    }

    public function etapePrecedente(): void
    {
        $this->etapeActuelle = max(1, $this->etapeActuelle - 1);
        $this->resetErrorBag();
        $this->dispatch('wizard-progression', etapeActuelle: $this->etapeActuelle, soumis: $this->soumis);
    }

    /**
     * Valeurs INITIALES uniquement — à fusionner dans le tableau `->layout(...)` de chaque
     * sous-classe pour amorcer le panneau de contexte public au bon état dès le premier chargement
     * (docs/audit-frontend-2026-08-29.md, point 4). `->layout()` rend le gabarit UNE SEULE FOIS
     * autour du composant Livewire : les mises à jour suivantes (etapeSuivante/etapePrecedente/
     * submit) ne re-rendent que la racine du composant, jamais le panneau qui vit en dehors —
     * un premier essai purement Blade laissait donc le panneau figé après le premier clic
     * "Continuer" (bug constaté et corrigé). La réactivité en cours de session passe par
     * l'évènement `wizard-progression` (dispatché ici et dans submit()), écouté côté Alpine dans
     * guest.blade.php — même mécanisme déjà utilisé pour les graphiques du dashboard
     * (`graphiques-actualises`, resources/js/charts.js).
     *
     * @return array{soumis: bool, etapeActuelle: int, nbEtapes: int}
     */
    protected function donneesProgressionLayout(): array
    {
        return [
            'soumis' => $this->soumis,
            'etapeActuelle' => $this->etapeActuelle,
            'nbEtapes' => self::NB_ETAPES,
        ];
    }

    /**
     * @return list<string> Noms des propriétés publiques appartenant à cette étape — sert
     *                      uniquement à `etapeSuivante()` (validation progressive) et à retrouver l'étape à
     *                      rouvrir si `submit()` échoue sur un champ d'une étape déjà "passée".
     */
    protected function champsEtape(int $etape): array
    {
        return match ($etape) {
            1 => ['canalRelaisChoisi', ...($this->anonymat ? [] : $this->champsIdentiteSpecifiques())],
            2 => $this->champsContexteSpecifiques(),
            3 => ['categorieId', 'categorieAutrePrecision', 'niveauGraviteId', 'description', ...$this->champsNatureSpecifiques()],
            4 => ['fichiers'],
            default => [],
        };
    }

    /** @return list<string> Champs spécifiques au parcours affichés à l'étape 1 (masqués si anonymat). */
    abstract protected function champsIdentiteSpecifiques(): array;

    /** @return list<string> Champs spécifiques au parcours affichés à l'étape 2 (toujours visibles, même anonyme). */
    abstract protected function champsContexteSpecifiques(): array;

    /** @return list<string> Champs spécifiques au parcours affichés à l'étape 3, en plus du socle commun. */
    protected function champsNatureSpecifiques(): array
    {
        return [];
    }

    /** Étape contenant un champ donné — utilisé pour rouvrir la bonne étape si submit() échoue. */
    protected function etapeDuChamp(string $champ): int
    {
        for ($etape = 1; $etape <= self::NB_ETAPES; $etape++) {
            if (in_array($champ, $this->champsEtape($etape), true)) {
                return $etape;
            }
        }

        return $this->etapeActuelle;
    }

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
            'fichiers.*' => ['file', 'max:10240'],
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
            'fichiers.*.max' => 'Chaque fichier ne doit pas dépasser 10 Mo (50 Mo au total pour 5 fichiers).',
            'canalRelaisChoisi.required' => 'Merci d\'indiquer le canal d\'origine de cette déclaration.',
        ];
    }

    public function submit(DeclarationService $service): void
    {
        // Anti-spam silencieux : un bot qui remplit le champ piège reçoit un faux succès sans
        // qu'aucune écriture n'ait lieu (ne pas lui signaler que le formulaire l'a détecté).
        if ($this->piegeAraignee !== '') {
            $this->soumis = true;
            $this->dispatch('wizard-progression', etapeActuelle: $this->etapeActuelle, soumis: true);

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

        try {
            $this->validate(
                [...$this->reglesCommunes(), ...$this->reglesSpecifiques()],
                [...$this->messagesCommunes(), ...$this->messagesSpecifiques()],
            );
        } catch (ValidationException $e) {
            $premierChamp = array_key_first($e->validator->errors()->toArray());
            if ($premierChamp !== null) {
                $this->etapeActuelle = $this->etapeDuChamp($premierChamp);
            }

            throw $e;
        }

        if ($this->categorieEstAutre && blank($this->categorieAutrePrecision)) {
            $this->etapeActuelle = 3;
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
        $this->dispatch('wizard-progression', etapeActuelle: $this->etapeActuelle, soumis: true);
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
