<x-layouts.app title="Administration — Utilisateurs">
    <div class="mb-6">
        <a href="{{ route('administration.index') }}" class="text-sm text-slate-500 hover:text-slate-900">← Administration</a>
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Utilisateurs</h1>
    </div>

    @session('status')
        <div class="alert alert-success mb-4">{{ $value }}</div>
    @endsession

    @if ($motDePasseGenere)
        <div class="alert alert-warning mb-4">
            Mot de passe initial généré : <span class="font-mono font-semibold">{{ $motDePasseGenere }}</span>
            — communiquez-le à l'utilisateur, il pourra le modifier via « Mot de passe oublié ».
        </div>
    @endif

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="card p-5 lg:col-span-1">
            <h2 class="mb-3 text-sm font-semibold text-slate-900">
                {{ $utilisateurEnEditionId ? 'Modifier l\'utilisateur' : 'Créer un utilisateur' }}
            </h2>
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

                <div class="flex gap-2 pt-2">
                    <button type="submit" class="btn btn-primary">
                        {{ $utilisateurEnEditionId ? 'Enregistrer' : 'Créer' }}
                    </button>
                    @if ($utilisateurEnEditionId)
                        <button type="button" wire:click="annulerEdition" class="btn btn-secondary">Annuler</button>
                    @endif
                </div>
            </form>
        </div>

        <div class="card p-5 lg:col-span-2">
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
                    @foreach ($this->utilisateurs as $utilisateur)
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
                                <span class="badge {{ $utilisateur->actif ? 'badge-emerald' : 'badge-red' }}">
                                    {{ $utilisateur->actif ? 'Actif' : 'Inactif' }}
                                </span>
                            </td>
                            <td class="py-2 text-right">
                                <button type="button" wire:click="modifier('{{ $utilisateur->id }}')" class="text-sm font-medium text-slate-600 hover:text-slate-900">
                                    Modifier
                                </button>
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    </div>
</x-layouts.app>
