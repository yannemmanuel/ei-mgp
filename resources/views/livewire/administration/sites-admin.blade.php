<div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
            <x-breadcrumb :items="[['label' => 'Administration', 'url' => route('administration.index')], ['label' => 'Sites']]" />
            <h1 class="text-h1 text-slate-900">Sites</h1>
        </div>
        <button type="button" x-on:click="$dispatch('open-modal', { name: 'site-form' })" class="btn btn-primary">
            + Nouveau site
        </button>
    </div>

    <div class="card p-5">
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
                @forelse ($this->sites as $site)
                    <tr class="border-b border-slate-50">
                        <td class="py-2 font-mono text-xs text-slate-500">{{ $site->code }}</td>
                        <td class="py-2">{{ $site->libelle }}</td>
                        <td class="py-2">
                            <x-actif-badge :actif="$site->actif" />
                        </td>
                        <td class="py-2 text-right">
                            <button type="button" wire:click="modifier({{ $site->id }})" class="text-sm font-medium text-slate-600 hover:text-slate-900">
                                Modifier
                            </button>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="4">
                            <x-empty-state title="Aucun site configuré.">
                                <x-slot:icon><x-icons.inbox class="h-10 w-10" /></x-slot:icon>
                            </x-empty-state>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div x-on:close-modal.window="if ($event.detail.name === 'site-form') $wire.annulerEdition()">
        <x-modal name="site-form" :title="$siteEnEditionId ? 'Modifier le site' : 'Créer un site'">
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

                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" wire:click="annulerEdition" class="btn btn-secondary">Annuler</button>
                    <button type="submit" class="btn btn-primary">
                        {{ $siteEnEditionId ? 'Enregistrer' : 'Créer' }}
                    </button>
                </div>
            </form>
        </x-modal>
    </div>
</div>
