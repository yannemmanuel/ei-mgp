<x-layouts.app title="Administration — Sites">
    <div class="mb-6">
        <a href="{{ route('administration.index') }}" class="text-sm text-slate-500 hover:text-slate-900">← Administration</a>
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Sites</h1>
    </div>

    @session('status')
        <div class="alert alert-success mb-4">{{ $value }}</div>
    @endsession

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="card p-5 lg:col-span-1">
            <h2 class="mb-3 text-sm font-semibold text-slate-900">
                {{ $siteEnEditionId ? 'Modifier le site' : 'Créer un site' }}
            </h2>
            <form wire:submit="enregistrer" class="space-y-2">
                <label class="block text-xs font-medium text-slate-500">Code *</label>
                <input type="text" wire:model="code" class="block w-full text-sm">
                @error('code') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="block text-xs font-medium text-slate-500">Libellé *</label>
                <input type="text" wire:model="libelle" class="block w-full text-sm">
                @error('libelle') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" wire:model="actif"> Actif
                </label>

                <div class="flex gap-2 pt-2">
                    <button type="submit" class="btn btn-primary">
                        {{ $siteEnEditionId ? 'Enregistrer' : 'Créer' }}
                    </button>
                    @if ($siteEnEditionId)
                        <button type="button" wire:click="annulerEdition" class="btn btn-secondary">Annuler</button>
                    @endif
                </div>
            </form>
        </div>

        <div class="card p-5 lg:col-span-2">
            <table class="w-full text-left text-sm">
                <thead>
                    <tr class="border-b border-slate-100 text-xs text-slate-500">
                        <th class="pb-2">Code</th>
                        <th class="pb-2">Libellé</th>
                        <th class="pb-2">Statut</th>
                        <th class="pb-2"></th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($this->sites as $site)
                        <tr class="border-b border-slate-50">
                            <td class="py-2 font-mono text-xs text-slate-500">{{ $site->code }}</td>
                            <td class="py-2">{{ $site->libelle }}</td>
                            <td class="py-2">
                                <span class="badge {{ $site->actif ? 'badge-emerald' : 'badge-red' }}">
                                    {{ $site->actif ? 'Actif' : 'Inactif' }}
                                </span>
                            </td>
                            <td class="py-2 text-right">
                                <button type="button" wire:click="modifier({{ $site->id }})" class="text-sm font-medium text-slate-600 hover:text-slate-900">
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
