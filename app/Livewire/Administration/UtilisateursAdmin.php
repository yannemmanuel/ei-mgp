<?php

namespace App\Livewire\Administration;

use App\Models\Direction;
use App\Models\Site;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Livewire\Component;
use Spatie\Permission\Models\Role;

/**
 * Console des comptes (`users.manage` / `roles.manage`, DT-02 : paramétrage technique réservé à
 * `administrateur_digital`). Un mot de passe initial est généré aléatoirement à la création,
 * affiché une seule fois — l'utilisateur le change ensuite via le parcours « mot de passe
 * oublié » de Fortify (Phase 3), aucun flux d'invitation par email n'étant demandé par le CDC.
 */
class UtilisateursAdmin extends Component
{
    public string $recherche = '';

    public ?string $utilisateurEnEditionId = null;

    public string $name = '';

    public string $email = '';

    public string $matricule = '';

    public string $poste = '';

    public string $directionId = '';

    public string $siteId = '';

    public string $responsableHierarchiqueId = '';

    public bool $actif = true;

    /** @var array<int, string> */
    public array $rolesSelectionnes = [];

    public ?string $motDePasseGenere = null;

    public function mount(): void
    {
        abort_unless(Auth::user()->can('users.manage'), 403);
    }

    public function modifier(string $userId): void
    {
        $utilisateur = User::findOrFail($userId);

        $this->utilisateurEnEditionId = (string) $utilisateur->id;
        $this->name = $utilisateur->name;
        $this->email = $utilisateur->email;
        $this->matricule = (string) $utilisateur->matricule;
        $this->poste = (string) $utilisateur->poste;
        $this->directionId = (string) ($utilisateur->direction_id ?? '');
        $this->siteId = (string) ($utilisateur->site_id ?? '');
        $this->responsableHierarchiqueId = (string) ($utilisateur->responsable_hierarchique_id ?? '');
        $this->actif = $utilisateur->actif;
        $this->rolesSelectionnes = $utilisateur->getRoleNames()->toArray();
        $this->motDePasseGenere = null;
        $this->dispatch('open-modal', name: 'utilisateur-form');
    }

    public function annulerEdition(): void
    {
        $this->reset([
            'utilisateurEnEditionId', 'name', 'email', 'matricule', 'poste',
            'directionId', 'siteId', 'responsableHierarchiqueId', 'rolesSelectionnes',
        ]);
        $this->actif = true;
        $this->motDePasseGenere = null;
        $this->dispatch('close-modal', name: 'utilisateur-form');
    }

    public function enregistrer(): void
    {
        $this->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($this->utilisateurEnEditionId)],
            'matricule' => ['nullable', 'string', 'max:50'],
            'poste' => ['nullable', 'string', 'max:255'],
            'directionId' => ['nullable', 'exists:directions,id'],
            'siteId' => ['nullable', 'exists:sites,id'],
            'responsableHierarchiqueId' => ['nullable', 'exists:users,id'],
            'rolesSelectionnes' => ['array'],
            'rolesSelectionnes.*' => ['string', Rule::exists('roles', 'name')],
        ], [], ['name' => 'nom', 'email' => 'email', 'directionId' => 'direction', 'siteId' => 'site']);

        // Garde-fou de sécurité (pas une règle du CDC) : un administrateur ne doit pas pouvoir se
        // verrouiller lui-même hors de la console en désactivant son propre compte par erreur.
        if ($this->utilisateurEnEditionId === (string) Auth::id() && ! $this->actif) {
            $this->addError('actif', 'Vous ne pouvez pas désactiver votre propre compte.');

            return;
        }

        $donnees = [
            'name' => $this->name,
            'email' => $this->email,
            'matricule' => $this->matricule ?: null,
            'poste' => $this->poste ?: null,
            'direction_id' => $this->directionId ?: null,
            'site_id' => $this->siteId ?: null,
            'responsable_hierarchique_id' => $this->responsableHierarchiqueId ?: null,
            'actif' => $this->actif,
        ];

        if ($this->utilisateurEnEditionId !== null) {
            $utilisateur = User::findOrFail($this->utilisateurEnEditionId);
            $rolesAvant = $utilisateur->getRoleNames()->all();
            $utilisateur->update($donnees);
            $this->dispatch('toast', message: 'Utilisateur mis à jour.', type: 'success');
        } else {
            $motDePasse = Str::password(12);
            $utilisateur = User::create([
                ...$donnees,
                'password' => $motDePasse,
                'email_verified_at' => now(),
            ]);
            $rolesAvant = [];
            $this->motDePasseGenere = $motDePasse;
            $this->dispatch('toast', message: 'Utilisateur créé.', type: 'success');
        }

        $utilisateur->syncRoles($this->rolesSelectionnes);

        // cf. docs/exigences-audit.md §2 : la table pivot model_has_roles échappe au diff
        // automatique de App\Observers\AuditObserver — audité explicitement ici.
        sort($rolesAvant);
        $rolesApres = $this->rolesSelectionnes;
        sort($rolesApres);
        if ($rolesAvant !== $rolesApres) {
            app(AuditLogger::class)->enregistrer(
                'user.roles_modifies',
                $utilisateur,
                ['roles' => $rolesAvant],
                ['roles' => $rolesApres],
            );
        }

        $motDePasseGenere = $this->motDePasseGenere;
        $this->annulerEdition();
        $this->motDePasseGenere = $motDePasseGenere;
    }

    /** @return Collection<int, User> */
    public function getUtilisateursProperty(): Collection
    {
        return User::query()
            ->with('roles')
            ->when($this->recherche !== '', function ($q) {
                $terme = '%'.$this->recherche.'%';
                $q->where(fn ($q2) => $q2->where('name', 'ilike', $terme)->orWhere('email', 'ilike', $terme));
            })
            ->orderBy('name')
            ->get();
    }

    /** @return Collection<int, Direction> */
    public function getDirectionsProperty(): Collection
    {
        return Direction::query()->orderBy('libelle')->get();
    }

    /** @return Collection<int, Site> */
    public function getSitesProperty(): Collection
    {
        return Site::query()->orderBy('libelle')->get();
    }

    /** @return Collection<int, User> */
    public function getResponsablesDisponiblesProperty(): Collection
    {
        return User::query()
            ->where('actif', true)
            ->when($this->utilisateurEnEditionId, fn ($q) => $q->where('id', '!=', $this->utilisateurEnEditionId))
            ->orderBy('name')
            ->get();
    }

    /** @return Collection<int, Role> */
    public function getRolesDisponiblesProperty(): Collection
    {
        return Role::query()->orderBy('name')->get();
    }

    public function render()
    {
        return view('livewire.administration.utilisateurs-admin')
            ->layout('components.layouts.app', ['title' => 'Administration — Utilisateurs']);
    }
}
