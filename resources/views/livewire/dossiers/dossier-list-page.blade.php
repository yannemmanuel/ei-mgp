<x-layouts.app title="Dossiers">
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-lg font-semibold text-slate-900">Dossiers</h1>
    </div>

    @session('status')
        <div class="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {{ $value }}
        </div>
    @endsession

    <div class="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div>
            <label class="block text-xs font-medium text-slate-500">Parcours</label>
            <select wire:model.live="parcoursId" class="mt-1 block w-full rounded-md border-slate-300 text-sm">
                <option value="">Tous</option>
                @foreach ($this->parcoursDisponibles as $parcours)
                    <option value="{{ $parcours->id }}">{{ $parcours->libelle }}</option>
                @endforeach
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Catégorie</label>
            <select wire:model.live="categorieId" class="mt-1 block w-full rounded-md border-slate-300 text-sm">
                <option value="">Toutes</option>
                @foreach ($this->categoriesDisponibles as $categorie)
                    <option value="{{ $categorie->id }}">{{ $categorie->libelle }}</option>
                @endforeach
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Statut</label>
            <select wire:model.live="statutId" class="mt-1 block w-full rounded-md border-slate-300 text-sm">
                <option value="">Tous</option>
                @foreach ($this->statutsDisponibles as $statut)
                    <option value="{{ $statut->id }}">{{ $statut->libelle_interne }}</option>
                @endforeach
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Gravité</label>
            <select wire:model.live="niveauGraviteId" class="mt-1 block w-full rounded-md border-slate-300 text-sm">
                <option value="">Toutes</option>
                @foreach ($this->niveauxGraviteDisponibles as $niveau)
                    <option value="{{ $niveau->id }}">{{ $niveau->libelle }}</option>
                @endforeach
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Du</label>
            <input type="date" wire:model.live="periodeDebut" class="mt-1 block w-full rounded-md border-slate-300 text-sm">
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Au</label>
            <input type="date" wire:model.live="periodeFin" class="mt-1 block w-full rounded-md border-slate-300 text-sm">
        </div>
    </div>

    <div class="mb-4">
        <button type="button" wire:click="resetFiltres" class="text-sm text-slate-500 hover:text-slate-900">Réinitialiser les filtres</button>
    </div>

    <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50">
                <tr>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Référence</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Parcours</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Catégorie</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Gravité</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Statut</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Reçu le</th>
                    <th class="px-4 py-2"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                @forelse ($this->dossiers as $dossier)
                    <tr wire:key="dossier-{{ $dossier->id }}" class="hover:bg-slate-50">
                        <td class="px-4 py-2 font-mono text-xs text-slate-700">{{ $dossier->reference }}</td>
                        <td class="px-4 py-2 text-slate-600">{{ $dossier->parcours->libelle }}</td>
                        <td class="px-4 py-2 text-slate-600">{{ $dossier->categorie->libelle }}</td>
                        <td class="px-4 py-2">
                            <span class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-white"
                                  style="background-color: {{ $dossier->niveauGravite->couleur ?? '#64748b' }}">
                                {{ $dossier->niveauGravite->libelle }}
                            </span>
                        </td>
                        <td class="px-4 py-2">
                            <span class="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {{ $dossier->statut->libelle_interne }}
                            </span>
                        </td>
                        <td class="px-4 py-2 text-slate-500">{{ $dossier->created_at->format('d/m/Y') }}</td>
                        <td class="px-4 py-2 text-right">
                            <a href="{{ route('dossiers.show', $dossier) }}" class="font-medium text-slate-700 hover:text-slate-900">
                                Consulter →
                            </a>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="7" class="px-4 py-8 text-center text-sm text-slate-400">Aucun dossier ne correspond à ces critères.</td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="mt-4">
        {{ $this->dossiers->links() }}
    </div>
</x-layouts.app>
