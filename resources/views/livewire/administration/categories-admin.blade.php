<div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
            <x-breadcrumb :items="[['label' => 'Administration', 'url' => route('administration.index')], ['label' => 'Catégories']]" />
            <h1 class="text-h1 text-slate-900">Catégories</h1>
        </div>
        <button type="button" x-on:click="$dispatch('open-modal', { name: 'categorie-form' })" class="btn btn-primary">
            + Nouvelle catégorie
        </button>
    </div>

    <div class="card p-5">
        <table class="w-full text-left text-sm">
            <thead>
                <tr class="border-b border-slate-100 text-xs text-slate-500">
                    <th class="pb-2">Parcours</th>
                    <th class="pb-2">Libellé</th>
                    <th class="pb-2">Statut</th>
                    <th class="pb-2"></th>
                </tr>
            </thead>
            <tbody>
                @forelse ($this->categories as $categorie)
                    <tr class="border-b border-slate-50">
                        <td class="py-2 text-slate-500">{{ $categorie->parcours->libelle }}</td>
                        <td class="py-2">
                            {{ $categorie->libelle }}
                            @if ($categorie->is_autre)
                                <span class="badge badge-indigo">Autre</span>
                            @endif
                        </td>
                        <td class="py-2">
                            <x-actif-badge :actif="$categorie->actif" label-actif="Active" label-inactif="Inactive" />
                        </td>
                        <td class="py-2 text-right">
                            <button type="button" wire:click="modifier({{ $categorie->id }})" class="text-sm font-medium text-slate-600 hover:text-slate-900">
                                Modifier
                            </button>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="4">
                            <x-empty-state title="Aucune catégorie configurée.">
                                <x-slot:icon><x-icons.inbox class="h-10 w-10" /></x-slot:icon>
                            </x-empty-state>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div x-on:close-modal.window="if ($event.detail.name === 'categorie-form') $wire.annulerEdition()">
        <x-modal name="categorie-form" :title="$categorieEnEditionId ? 'Modifier la catégorie' : 'Créer une catégorie'">
            <form wire:submit="enregistrer" class="space-y-2">
                <label class="block text-xs font-medium text-slate-500">Parcours *</label>
                <select wire:model="parcoursId" class="block w-full text-sm">
                    <option value="">— Sélectionner —</option>
                    @foreach ($this->parcoursListe as $parcours)
                        <option value="{{ $parcours->id }}">{{ $parcours->libelle }}</option>
                    @endforeach
                </select>
                @error('parcoursId') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="block text-xs font-medium text-slate-500">Code *</label>
                <input type="text" wire:model="code" class="block w-full text-sm">
                @error('code') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="block text-xs font-medium text-slate-500">Libellé *</label>
                <input type="text" wire:model="libelle" class="block w-full text-sm">
                @error('libelle') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="block text-xs font-medium text-slate-500">Ordre *</label>
                <input type="number" min="1" wire:model="ordre" class="block w-full text-sm">
                @error('ordre') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" wire:model="isAutre"> Orientation « Autre » (précision libre exigée)
                </label>
                <label class="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" wire:model="actif"> Active
                </label>

                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" wire:click="annulerEdition" class="btn btn-secondary">Annuler</button>
                    <button type="submit" class="btn btn-primary">
                        {{ $categorieEnEditionId ? 'Enregistrer' : 'Créer' }}
                    </button>
                </div>
            </form>
        </x-modal>
    </div>
</div>
