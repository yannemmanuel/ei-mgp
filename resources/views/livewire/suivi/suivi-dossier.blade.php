<x-layouts.guest title="Suivi de ma déclaration" max-width="max-w-lg">
    <h1 class="mb-1 text-lg font-semibold text-slate-900">Suivi de ma déclaration</h1>

    @if (! $this->dossier)
        <p class="mb-6 text-sm text-slate-500">
            Consultez l'avancement de votre déclaration à l'aide de votre numéro de référence et
            de votre code d'accès (communiqués lors de la soumission).
        </p>

        <form wire:submit="rechercher" class="space-y-3">
            <label class="block text-xs font-medium text-slate-500">Numéro de référence *</label>
            <input type="text" wire:model="reference" placeholder="EI-2026-000001" class="block w-full text-sm">
            @error('reference') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <label class="block text-xs font-medium text-slate-500">Code d'accès *</label>
            <input type="text" wire:model="codeAcces" placeholder="000000" class="block w-full text-sm">
            @error('codeAcces') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <button type="submit" class="btn btn-primary btn-block">
                Consulter mon dossier
            </button>
        </form>
    @else
        <div class="mb-6">
            <p class="font-mono text-sm text-slate-500">{{ $this->dossier->reference }}</p>
            <h2 class="mb-3 text-base font-semibold text-slate-900">{{ $this->dossier->parcours->libelle }}</h2>
            <span class="badge badge-slate">{{ $this->dossier->statut->libelle_affiche }}</span>
            <p class="mt-3 text-xs text-slate-500">
                Déclaration soumise le {{ $this->dossier->created_at->format('d/m/Y') }}.
            </p>
        </div>

        <livewire:messagerie.messagerie-dossier :dossier="$this->dossier" :key="'messagerie-'.$this->dossier->id" />
    @endif
</x-layouts.guest>
