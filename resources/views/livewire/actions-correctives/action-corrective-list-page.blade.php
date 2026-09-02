<div>
    <div class="mb-6 flex items-center justify-between">
        <h1 class="text-h1 text-slate-900">Actions correctives</h1>
    </div>

    <div class="card mb-6 grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
        <div>
            <label class="block text-xs font-medium text-slate-500">Statut</label>
            <select wire:model.live="statut" class="mt-1 block w-full text-sm">
                <option value="">Tous</option>
                <option value="non_demarree">Non démarrée</option>
                <option value="en_cours">En cours</option>
                <option value="realisee">Réalisée</option>
                <option value="en_retard">En retard</option>
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
            <label class="block text-xs font-medium text-slate-500">Responsable</label>
            <select wire:model.live="responsableId" class="mt-1 block w-full text-sm">
                <option value="">Tous</option>
                @foreach ($this->responsablesDisponibles as $responsable)
                    <option value="{{ $responsable->id }}">{{ $responsable->name }}</option>
                @endforeach
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Échéance du</label>
            <input type="date" wire:model.live="echeanceDebut" class="mt-1 block w-full text-sm">
        </div>
        <div>
            <label class="block text-xs font-medium text-slate-500">Échéance au</label>
            <input type="date" wire:model.live="echeanceFin" class="mt-1 block w-full text-sm">
        </div>
    </div>

    <div class="mb-4">
        <button type="button" wire:click="resetFiltres" class="text-sm text-slate-500 hover:text-slate-900">Réinitialiser les filtres</button>
    </div>

    @php
        $statutBadges = [
            'non_demarree' => ['Non démarrée', 'badge-slate'],
            'en_cours' => ['En cours', 'badge-sky'],
            'realisee' => ['Réalisée', 'badge-emerald'],
            'en_retard' => ['En retard', 'badge-red'],
        ];
    @endphp

    <div class="card hidden overflow-x-auto lg:block">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
            <thead class="bg-slate-50">
                <tr>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Référence</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Parcours</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Intitulé</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Responsable</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Échéance</th>
                    <th class="px-4 py-2 text-left font-medium text-slate-500">Statut</th>
                    <th class="px-4 py-2"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                @forelse ($this->actions as $action)
                    @php
                        [$label, $classes] = $statutBadges[$action->statut->value];
                        $joursRestants = $this->joursRestants($action);
                    @endphp
                    <tr wire:key="action-{{ $action->id }}" class="transition-colors hover:bg-slate-50">
                        <td class="px-4 py-2 font-mono text-xs text-slate-700">{{ $action->dossier->reference }}</td>
                        <td class="px-4 py-2 text-slate-600">{{ $action->dossier->parcours->libelle }}</td>
                        <td class="px-4 py-2 text-slate-600">{{ $action->intitule }}</td>
                        <td class="px-4 py-2 text-slate-600">{{ $action->responsable->name }}</td>
                        <td class="px-4 py-2">
                            @if ($action->statut->value === 'realisee')
                                <span class="text-xs text-slate-500">{{ $action->echeance->format('d/m/Y') }}</span>
                            @elseif ($joursRestants < 0)
                                <span class="badge badge-red">En retard ({{ abs($joursRestants) }} j)</span>
                            @elseif ($joursRestants <= 3)
                                <span class="badge badge-amber">J-{{ $joursRestants }}</span>
                            @else
                                <span class="text-xs text-slate-500">{{ $action->echeance->format('d/m/Y') }}</span>
                            @endif
                        </td>
                        <td class="px-4 py-2">
                            <span class="badge {{ $classes }}">{{ $label }}</span>
                        </td>
                        <td class="px-4 py-2 text-right">
                            <a href="{{ route('dossiers.show', $action->dossier) }}" wire:navigate class="font-medium text-slate-700 hover:text-slate-900">
                                Consulter →
                            </a>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="7">
                            <x-empty-state title="Aucune action corrective ne correspond à ces critères.">
                                <x-slot:icon><x-icons.wrench-screwdriver class="h-10 w-10" /></x-slot:icon>
                            </x-empty-state>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="card divide-y divide-slate-100 lg:hidden">
        @forelse ($this->actions as $action)
            @php
                [$label, $classes] = $statutBadges[$action->statut->value];
                $joursRestants = $this->joursRestants($action);
            @endphp
            <a href="{{ route('dossiers.show', $action->dossier) }}" wire:navigate wire:key="action-card-{{ $action->id }}"
               class="flex items-center gap-3 p-4 transition-colors hover:bg-slate-50">
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="font-mono text-xs text-slate-500">{{ $action->dossier->reference }}</span>
                        <span class="badge {{ $classes }}">{{ $label }}</span>
                    </div>
                    <p class="mt-1 truncate text-sm font-medium text-slate-900">{{ $action->intitule }}</p>
                    <p class="mt-0.5 text-xs text-slate-500">
                        {{ $action->responsable->name }} ·
                        @if ($action->statut->value === 'realisee')
                            réalisée le {{ $action->echeance->format('d/m/Y') }}
                        @elseif ($joursRestants < 0)
                            <span class="font-medium text-red-600">en retard ({{ abs($joursRestants) }} j)</span>
                        @elseif ($joursRestants <= 3)
                            <span class="font-medium text-amber-600">échéance J-{{ $joursRestants }}</span>
                        @else
                            échéance {{ $action->echeance->format('d/m/Y') }}
                        @endif
                    </p>
                </div>
                <x-icons.chevron-right class="h-4 w-4 shrink-0 text-slate-300" />
            </a>
        @empty
            <x-empty-state title="Aucune action corrective ne correspond à ces critères.">
                <x-slot:icon><x-icons.wrench-screwdriver class="h-10 w-10" /></x-slot:icon>
            </x-empty-state>
        @endforelse
    </div>

    <div class="mt-4">
        {{ $this->actions->links() }}
    </div>
</div>
