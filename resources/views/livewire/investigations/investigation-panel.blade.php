<div class="rounded-lg border border-slate-200 bg-white p-5">
    <h2 class="mb-3 text-sm font-semibold text-slate-900">Investigations</h2>

    @error('dateOuverture')
        <p class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{{ $message }}</p>
    @enderror

    @forelse ($this->investigations as $investigation)
        <a href="{{ route('dossiers.investigations.show', [$dossier, $investigation]) }}"
           class="mb-2 flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm hover:border-slate-300">
            <span class="text-slate-700">
                Ouverte le {{ $investigation->date_ouverture->format('d/m/Y') }} — {{ $investigation->enqueteur->name }}
            </span>
            @php
                $badges = [
                    'en_cours' => ['En cours', 'bg-slate-100 text-slate-700'],
                    'en_attente_validation' => ['En attente de validation', 'bg-amber-100 text-amber-700'],
                    'validee' => ['Validée', 'bg-emerald-100 text-emerald-700'],
                ];
                [$label, $classes] = $badges[$investigation->statut->value];
            @endphp
            <span class="inline-flex items-center rounded px-2 py-1 text-xs font-medium {{ $classes }}">{{ $label }}</span>
        </a>
    @empty
        <p class="text-sm text-slate-400">Aucune investigation ouverte pour ce dossier.</p>
    @endforelse

    @if ($this->peutOuvrir)
        <form wire:submit="ouvrir" class="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <h3 class="text-xs font-semibold text-slate-500">Ouvrir une nouvelle investigation</h3>

            <label class="block text-xs font-medium text-slate-500">Date d'ouverture *</label>
            <input type="date" wire:model="dateOuverture" class="block w-full rounded-md border-slate-300 text-sm">
            @error('dateOuverture') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <label class="block text-xs font-medium text-slate-500">Faits constatés *</label>
            <textarea wire:model="faitsConstates" rows="3" class="block w-full rounded-md border-slate-300 text-sm"></textarea>
            @error('faitsConstates') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <label class="block text-xs font-medium text-slate-500">Personnes rencontrées</label>
            <textarea wire:model="personnesRencontrees" rows="2" class="block w-full rounded-md border-slate-300 text-sm"></textarea>

            <label class="block text-xs font-medium text-slate-500">Cause immédiate</label>
            <textarea wire:model="causeImmediate" rows="2" class="block w-full rounded-md border-slate-300 text-sm"></textarea>

            <label class="block text-xs font-medium text-slate-500">Causes racines</label>
            <textarea wire:model="causesRacines" rows="2" class="block w-full rounded-md border-slate-300 text-sm"></textarea>

            <label class="block text-xs font-medium text-slate-500">Recommandations *</label>
            <textarea wire:model="recommandations" rows="3" class="block w-full rounded-md border-slate-300 text-sm"></textarea>
            @error('recommandations') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <button type="submit" class="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                Ouvrir l'investigation
            </button>
        </form>
    @endif
</div>
