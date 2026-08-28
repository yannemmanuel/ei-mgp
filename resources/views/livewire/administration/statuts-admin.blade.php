<x-layouts.app title="Administration — Statuts affichés">
    <div class="mb-6">
        <a href="{{ route('administration.index') }}" class="text-sm text-slate-500 hover:text-slate-900">← Administration</a>
        <h1 class="mt-1 text-lg font-semibold text-slate-900">Statuts</h1>
        <p class="mt-1 text-xs text-slate-500">
            Le libellé affiché est celui vu par le déclarant (projection simplifiée, RGI-10).
        </p>
    </div>

    @session('status')
        <div class="alert alert-success mb-4">{{ $value }}</div>
    @endsession

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        @if ($statutEnEditionId)
            <div class="card p-5 lg:col-span-1">
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Modifier le statut</h2>
                <form wire:submit="enregistrer" class="space-y-2">
                    <label class="block text-xs font-medium text-slate-500">Libellé interne *</label>
                    <input type="text" wire:model="libelleInterne" class="block w-full text-sm">
                    @error('libelleInterne') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                    <label class="block text-xs font-medium text-slate-500">Libellé affiché au déclarant *</label>
                    <input type="text" wire:model="libelleAffiche" class="block w-full text-sm">
                    @error('libelleAffiche') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                    <label class="block text-xs font-medium text-slate-500">Ordre *</label>
                    <input type="number" min="1" wire:model="ordre" class="block w-full text-sm">
                    @error('ordre') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                    <div class="flex gap-2 pt-2">
                        <button type="submit" class="btn btn-primary">Enregistrer</button>
                        <button type="button" wire:click="annulerEdition" class="btn btn-secondary">Annuler</button>
                    </div>
                </form>
            </div>
        @endif

        <div class="card p-5 {{ $statutEnEditionId ? 'lg:col-span-2' : 'lg:col-span-3' }}">
            <table class="w-full text-left text-sm">
                <thead>
                    <tr class="border-b border-slate-100 text-xs text-slate-500">
                        <th class="pb-2">Interne</th>
                        <th class="pb-2">Affiché</th>
                        <th class="pb-2">Terminal</th>
                        <th class="pb-2"></th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($this->statuts as $statut)
                        <tr class="border-b border-slate-50">
                            <td class="py-2">{{ $statut->libelle_interne }}</td>
                            <td class="py-2 text-slate-500">{{ $statut->libelle_affiche }}</td>
                            <td class="py-2">
                                @if ($statut->is_terminal)
                                    <span class="badge badge-slate">Terminal</span>
                                @endif
                            </td>
                            <td class="py-2 text-right">
                                <button type="button" wire:click="modifier({{ $statut->id }})" class="text-sm font-medium text-slate-600 hover:text-slate-900">
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
