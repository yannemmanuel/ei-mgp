<div>
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-h1 text-slate-900">Dossiers</h1>
        <label class="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" wire:model.live="assigneAMoi">
            Mes dossiers uniquement
        </label>
    </div>

<div class="card mb-6 grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
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

    {{-- Desktop : tableau complet. En dessous de lg, un tableau large scrolle horizontalement --
         moins lisible au doigt qu'une liste de cartes (docs/audit-frontend-2026-08-29.md §3). --}}
    <div class="card hidden overflow-x-auto lg:block">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50">
                <tr>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Référence</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Parcours</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Catégorie</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Gravité</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Statut</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Échéance</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Reçu le</th>
                    <th class="px-4 py-2"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                @forelse ($this->dossiers as $dossier)
                    <tr wire:key="dossier-{{ $dossier->id }}" class="transition-colors hover:bg-slate-50">
                        <td class="px-4 py-2 font-mono text-xs text-slate-700">{{ $dossier->reference }}</td>
                        <td class="px-4 py-2 text-slate-600">{{ $dossier->parcours->libelle }}</td>
                        <td class="px-4 py-2 text-slate-600">{{ $dossier->categorie->libelle }}</td>
                        <td class="px-4 py-2">
                            <x-gravite-badge :niveau="$dossier->niveauGravite" />
                        </td>
                        <td class="px-4 py-2">
                            <x-statut-badge :statut="$dossier->statut" />
                        </td>
                        <td class="px-4 py-2">
                            @php $joursRestants = $this->joursRestants($dossier); @endphp
                            @if ($joursRestants === null)
                                <span class="text-xs text-slate-400">—</span>
                            @elseif ($joursRestants < 0)
                                <span class="badge badge-red">
                                    En retard ({{ abs($joursRestants) }} j)
                                </span>
                            @elseif ($joursRestants <= 3)
                                <span class="badge badge-amber">
                                    J-{{ $joursRestants }}
                                </span>
                            @else
                                <span class="text-xs text-slate-500">{{ $joursRestants }} j restants</span>
                            @endif
                        </td>
                        <td class="px-4 py-2 text-slate-500">{{ $dossier->created_at->format('d/m/Y') }}</td>
                        <td class="px-4 py-2 text-right">
                            <a href="{{ route('dossiers.show', $dossier) }}" wire:navigate class="font-medium text-slate-700 hover:text-slate-900">
                                Consulter →
                            </a>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="8">
                            <x-empty-state title="Aucun dossier ne correspond à ces critères.">
                                <x-slot:icon><x-icons.inbox class="h-10 w-10" /></x-slot:icon>
                            </x-empty-state>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    {{-- Mobile/tablette : liste de cartes, une carte = une ligne, toute la carte cliquable
         (cible tactile large plutôt qu'un lien "Consulter" isolé). --}}
    <div class="card divide-y divide-slate-100 lg:hidden">
        @forelse ($this->dossiers as $dossier)
            @php $joursRestants = $this->joursRestants($dossier); @endphp
            <a href="{{ route('dossiers.show', $dossier) }}" wire:navigate wire:key="dossier-card-{{ $dossier->id }}"
               class="flex items-center gap-3 p-4 transition-colors hover:bg-slate-50">
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="font-mono text-xs text-slate-500">{{ $dossier->reference }}</span>
                        <x-gravite-badge :niveau="$dossier->niveauGravite" />
                        <x-statut-badge :statut="$dossier->statut" />
                    </div>
                    <p class="mt-1 truncate text-sm font-medium text-slate-900">
                        {{ $dossier->parcours->libelle }} · {{ $dossier->categorie->libelle }}
                    </p>
                    <p class="mt-0.5 text-xs text-slate-500">
                        Reçu le {{ $dossier->created_at->format('d/m/Y') }}
                        @if ($joursRestants !== null)
                            @if ($joursRestants < 0)
                                · <span class="font-medium text-red-600">en retard ({{ abs($joursRestants) }} j)</span>
                            @elseif ($joursRestants <= 3)
                                · <span class="font-medium text-amber-600">J-{{ $joursRestants }}</span>
                            @else
                                · {{ $joursRestants }} j restants
                            @endif
                        @endif
                    </p>
                </div>
                <x-icons.chevron-right class="h-4 w-4 shrink-0 text-slate-300" />
            </a>
        @empty
            <x-empty-state title="Aucun dossier ne correspond à ces critères.">
                <x-slot:icon><x-icons.inbox class="h-10 w-10" /></x-slot:icon>
            </x-empty-state>
        @endforelse
    </div>

    <div class="mt-4">
        {{ $this->dossiers->links() }}
    </div>
</div>
