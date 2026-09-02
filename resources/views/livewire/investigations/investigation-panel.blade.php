<div class="card p-5">
    <h2 class="mb-3 text-h3 text-slate-900">Investigations</h2>

    @error('dateOuverture')
        <p class="alert alert-error mb-3 text-xs">{{ $message }}</p>
    @enderror

    @forelse ($this->investigations as $investigation)
        <a href="{{ route('dossiers.investigations.show', [$dossier, $investigation]) }}" wire:navigate
           class="mb-2 flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm transition-colors hover:border-slate-300 hover:bg-slate-50">
            <span class="text-slate-700">
                Ouverte le {{ $investigation->date_ouverture->format('d/m/Y') }} — {{ $investigation->enqueteur->name }}
            </span>
            @php
                $badges = [
                    'en_cours' => ['En cours', 'badge-slate'],
                    'en_attente_validation' => ['En attente de validation', 'badge-amber'],
                    'validee' => ['Validée', 'badge-emerald'],
                ];
                [$label, $classes] = $badges[$investigation->statut->value];
            @endphp
            <span class="badge {{ $classes }}">{{ $label }}</span>
        </a>
    @empty
        <x-empty-state title="Aucune investigation ouverte pour ce dossier.">
            <x-slot:icon><x-icons.clipboard-document-check class="h-8 w-8" /></x-slot:icon>
        </x-empty-state>
    @endforelse

    @if ($this->peutOuvrir)
        <form wire:submit="ouvrir" class="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <h3 class="text-xs font-semibold text-slate-500">Ouvrir une nouvelle investigation</h3>

            <label class="block text-xs font-medium text-slate-500">Date d'ouverture *</label>
            <input type="date" wire:model="dateOuverture" class="block w-full text-sm">
            @error('dateOuverture') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <label class="block text-xs font-medium text-slate-500">Faits constatés *</label>
            <textarea wire:model="faitsConstates" rows="3" class="block w-full text-sm"></textarea>
            @error('faitsConstates') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <label class="block text-xs font-medium text-slate-500">Personnes rencontrées</label>
            <textarea wire:model="personnesRencontrees" rows="2" class="block w-full text-sm"></textarea>

            <label class="block text-xs font-medium text-slate-500">Cause immédiate</label>
            <textarea wire:model="causeImmediate" rows="2" class="block w-full text-sm"></textarea>

            <label class="block text-xs font-medium text-slate-500">Causes racines</label>
            <textarea wire:model="causesRacines" rows="2" class="block w-full text-sm"></textarea>

            <label class="block text-xs font-medium text-slate-500">Recommandations *</label>
            <textarea wire:model="recommandations" rows="3" class="block w-full text-sm"></textarea>
            @error('recommandations') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <button type="submit" class="btn btn-primary btn-block">
                Ouvrir l'investigation
            </button>
        </form>
    @endif
</div>
