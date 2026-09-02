<div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
            <x-breadcrumb :items="[['label' => 'Administration', 'url' => route('administration.index')], ['label' => 'Utilisateurs']]" />
            <h1 class="text-h1 text-slate-900">Utilisateurs</h1>
        </div>
        <button type="button" x-on:click="$dispatch('open-modal', { name: 'utilisateur-form' })" class="btn btn-primary">
            + Nouvel utilisateur
        </button>
    </div>

@if ($motDePasseGenere)
        <div class="alert alert-warning mb-4">
            Mot de passe initial généré : <span class="font-mono font-semibold">{{ $motDePasseGenere }}</span>
            — communiquez-le à l'utilisateur, il pourra le modifier via « Mot de passe oublié ».
        </div>
    @endif

    <div class="card p-5">
        <input type="text" wire:model.live.debounce.300ms="recherche" placeholder="Rechercher par nom ou email..."
               class="mb-3 block w-full text-sm">

        <table class="w-full text-left text-sm">
            <thead>
                <tr class="border-b border-slate-100 text-xs text-slate-500">
                    <th class="pb-2">Nom</th>
                    <th class="pb-2">Rôles</th>
                    <th class="pb-2">Statut</th>
                    <th class="pb-2"></th>
                </tr>
            </thead>
            <tbody>
                @forelse ($this->utilisateurs as $utilisateur)
                    <tr class="border-b border-slate-50">
                        <td class="py-2">
                            <p class="font-medium text-slate-900">{{ $utilisateur->name }}</p>
                            <p class="text-xs text-slate-500">{{ $utilisateur->email }}</p>
                        </td>
                        <td class="py-2">
                            @foreach ($utilisateur->roles as $role)
                                <span class="badge badge-slate">{{ $role->name }}</span>
                            @endforeach
                        </td>
                        <td class="py-2">
                            <x-actif-badge :actif="$utilisateur->actif" />
                        </td>
                        <td class="py-2 text-right">
                            <button type="button" wire:click="modifier('{{ $utilisateur->id }}')" class="text-sm font-medium text-slate-600 hover:text-slate-900">
                                Modifier
                            </button>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="4">
                            <x-empty-state title="Aucun utilisateur ne correspond à cette recherche.">
                                <x-slot:icon><x-icons.inbox class="h-10 w-10" /></x-slot:icon>
                            </x-empty-state>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div x-on:close-modal.window="if ($event.detail.name === 'utilisateur-form') $wire.annulerEdition()">
        <x-modal name="utilisateur-form" :title="$utilisateurEnEditionId ? 'Modifier l\'utilisateur' : 'Créer un utilisateur'">
            <form wire:submit="enregistrer" class="space-y-2">
                <label class="block text-xs font-medium text-slate-500">Nom *</label>
                <input type="text" wire:model="name" class="block w-full text-sm">
                @error('name') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="block text-xs font-medium text-slate-500">Email *</label>
                <input type="email" wire:model="email" class="block w-full text-sm">
                @error('email') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="block text-xs font-medium text-slate-500">Matricule</label>
                <input type="text" wire:model="matricule" class="block w-full text-sm">

                <label class="block text-xs font-medium text-slate-500">Poste</label>
                <input type="text" wire:model="poste" class="block w-full text-sm">

                <label class="block text-xs font-medium text-slate-500">Direction</label>
                <select wire:model="directionId" class="block w-full text-sm">
                    <option value="">—</option>
                    @foreach ($this->directions as $direction)
                        <option value="{{ $direction->id }}">{{ $direction->libelle }}</option>
                    @endforeach
                </select>

                <label class="block text-xs font-medium text-slate-500">Site</label>
                <select wire:model="siteId" class="block w-full text-sm">
                    <option value="">—</option>
                    @foreach ($this->sites as $site)
                        <option value="{{ $site->id }}">{{ $site->libelle }}</option>
                    @endforeach
                </select>

                <label class="block text-xs font-medium text-slate-500">Responsable hiérarchique (N+1)</label>
                <select wire:model="responsableHierarchiqueId" class="block w-full text-sm">
                    <option value="">—</option>
                    @foreach ($this->responsablesDisponibles as $responsable)
                        <option value="{{ $responsable->id }}">{{ $responsable->name }}</option>
                    @endforeach
                </select>
                @error('responsableHierarchiqueId') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" wire:model="actif"> Compte actif
                </label>
                @error('actif') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <p class="mt-2 block text-xs font-medium text-slate-500">Rôles</p>
                <div class="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                    @foreach ($this->rolesDisponibles as $role)
                        <label class="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" wire:model="rolesSelectionnes" value="{{ $role->name }}">
                            {{ $role->name }}
                        </label>
                    @endforeach
                </div>

                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" wire:click="annulerEdition" class="btn btn-secondary">Annuler</button>
                    <button type="submit" class="btn btn-primary">
                        {{ $utilisateurEnEditionId ? 'Enregistrer' : 'Créer' }}
                    </button>
                </div>
            </form>
        </x-modal>
    </div>
</div>
