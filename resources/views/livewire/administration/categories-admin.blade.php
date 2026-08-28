<x-layouts.app title="Administration — Catégories">
    <div class="mb-6">
        <a href="{{ route('administration.index') }}" class="text-sm text-slate-500 hover:text-slate-900">← Administration</a>
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Catégories</h1>
    </div>

    @session('status')
        <div class="alert alert-success mb-4">{{ $value }}</div>
    @endsession

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="card p-5 lg:col-span-1">
            <h2 class="mb-3 text-sm font-semibold text-slate-900">
                {{ $categorieEnEditionId ? 'Modifier la catégorie' : 'Créer une catégorie' }}
            </h2>
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

                <div class="flex gap-2 pt-2">
                    <button type="submit" class="btn btn-primary">
                        {{ $categorieEnEditionId ? 'Enregistrer' : 'Créer' }}
                    </button>
                    @if ($categorieEnEditionId)
                        <button type="button" wire:click="annulerEdition" class="btn btn-secondary">Annuler</button>
                    @endif
                </div>
            </form>
        </div>

        <div class="card p-5 lg:col-span-2">
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
                    @foreach ($this->categories as $categorie)
                        <tr class="border-b border-slate-50">
                            <td class="py-2 text-slate-500">{{ $categorie->parcours->libelle }}</td>
                            <td class="py-2">
                                {{ $categorie->libelle }}
                                @if ($categorie->is_autre)
                                    <span class="badge badge-indigo">Autre</span>
                                @endif
                            </td>
                            <td class="py-2">
                                <span class="badge {{ $categorie->actif ? 'badge-emerald' : 'badge-red' }}">
                                    {{ $categorie->actif ? 'Active' : 'Inactive' }}
                                </span>
                            </td>
                            <td class="py-2 text-right">
                                <button type="button" wire:click="modifier({{ $categorie->id }})" class="text-sm font-medium text-slate-600 hover:text-slate-900">
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
