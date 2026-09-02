<div>
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-h1 text-slate-900">Investigations</h1>
    </div>

    <div class="card mb-6 grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
        <div>
            <label class="block text-xs font-medium text-slate-500">Statut</label>
            <select wire:model.live="statut" class="mt-1 block w-full text-sm">
                <option value="">Tous</option>
                <option value="en_cours">En cours</option>
                <option value="en_attente_validation">En attente de validation</option>
                <option value="validee">Validée</option>
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Parcours</label>
            <select wire:model.live="parcoursId" class="mt-1 block w-full text-sm">
                <option value="">Tous</option>
                @foreach ($this->parcoursDisponibles as $parcours)
                    <option value="{{ $parcours->id }}">{{ $parcours->libelle }}</option>
                @endforeach
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Enquêteur</label>
            <select wire:model.live="enqueteurId" class="mt-1 block w-full text-sm">
                <option value="">Tous</option>
                @foreach ($this->enqueteursDisponibles as $enqueteur)
                    <option value="{{ $enqueteur->id }}">{{ $enqueteur->name }}</option>
                @endforeach
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Du</label>
            <input type="date" wire:model.live="periodeDebut" class="mt-1 block w-full text-sm">
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Au</label>
            <input type="date" wire:model.live="periodeFin" class="mt-1 block w-full text-sm">
        </div>
    </div>

    <div class="mb-4">
        <button type="button" wire:click="resetFiltres" class="text-sm text-slate-500 hover:text-slate-900">Réinitialiser les filtres</button>
    </div>

    @php
        $statutBadges = [
            'en_cours' => ['En cours', 'badge-slate'],
            'en_attente_validation' => ['En attente de validation', 'badge-amber'],
            'validee' => ['Validée', 'badge-emerald'],
        ];
    @endphp

    <div class="card hidden overflow-x-auto lg:block">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50">
                <tr>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Référence</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Parcours</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Catégorie</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Enquêteur</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Ouverte le</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Statut</th>
                    <th class="px-4 py-2"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                @forelse ($this->investigations as $investigation)
                    @php [$label, $classes] = $statutBadges[$investigation->statut->value]; @endphp
                    <tr wire:key="investigation-{{ $investigation->id }}" class="transition-colors hover:bg-slate-50">
                        <td class="px-4 py-2 font-mono text-xs text-slate-700">{{ $investigation->dossier->reference }}</td>
                        <td class="px-4 py-2 text-slate-600">{{ $investigation->dossier->parcours->libelle }}</td>
                        <td class="px-4 py-2 text-slate-600">{{ $investigation->dossier->categorie->libelle }}</td>
                        <td class="px-4 py-2 text-slate-600">{{ $investigation->enqueteur->name }}</td>
                        <td class="px-4 py-2 text-slate-500">{{ $investigation->date_ouverture->format('d/m/Y') }}</td>
                        <td class="px-4 py-2">
                            <span class="badge {{ $classes }}">{{ $label }}</span>
                        </td>
                        <td class="px-4 py-2 text-right">
                            <a href="{{ route('dossiers.investigations.show', [$investigation->dossier, $investigation]) }}" wire:navigate
                               class="font-medium text-slate-700 hover:text-slate-900">
                                Consulter →
                            </a>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="7">
                            <x-empty-state title="Aucune investigation ne correspond à ces critères.">
                                <x-slot:icon><x-icons.clipboard-document-check class="h-10 w-10" /></x-slot:icon>
                            </x-empty-state>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="card divide-y divide-slate-100 lg:hidden">
        @forelse ($this->investigations as $investigation)
            @php [$label, $classes] = $statutBadges[$investigation->statut->value]; @endphp
            <a href="{{ route('dossiers.investigations.show', [$investigation->dossier, $investigation]) }}" wire:navigate
               wire:key="investigation-card-{{ $investigation->id }}"
               class="flex items-center gap-3 p-4 transition-colors hover:bg-slate-50">
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="font-mono text-xs text-slate-500">{{ $investigation->dossier->reference }}</span>
                        <span class="badge {{ $classes }}">{{ $label }}</span>
                    </div>
                    <p class="mt-1 truncate text-sm font-medium text-slate-900">
                        {{ $investigation->dossier->parcours->libelle }} · {{ $investigation->dossier->categorie->libelle }}
                    </p>
                    <p class="mt-0.5 text-xs text-slate-500">
                        {{ $investigation->enqueteur->name }} · ouverte le {{ $investigation->date_ouverture->format('d/m/Y') }}
                    </p>
                </div>
                <x-icons.chevron-right class="h-4 w-4 shrink-0 text-slate-300" />
            </a>
        @empty
            <x-empty-state title="Aucune investigation ne correspond à ces critères.">
                <x-slot:icon><x-icons.clipboard-document-check class="h-10 w-10" /></x-slot:icon>
            </x-empty-state>
        @endforelse
    </div>

    <div class="mt-4">
        {{ $this->investigations->links() }}
    </div>
</div>
