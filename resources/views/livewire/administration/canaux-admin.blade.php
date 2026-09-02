<div>
    <div class="mb-6">
        <x-breadcrumb :items="[['label' => 'Administration', 'url' => route('administration.index')], ['label' => 'Canaux de captage']]" />
        <h1 class="text-h1 text-slate-900">Canaux de captage</h1>
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
                @foreach ($this->canaux as $canal)
                    <tr class="border-b border-slate-50">
                        <td class="py-2 font-mono text-xs text-slate-500">{{ $canal->code->value }}</td>
                        <td class="py-2">{{ $canal->libelle }}</td>
                        <td class="py-2">
                            <x-actif-badge :actif="$canal->actif" />
                        </td>
                        <td class="py-2 text-right">
                            <button type="button" wire:click="modifier({{ $canal->id }})" class="text-sm font-medium text-slate-600 hover:text-slate-900">
                                Modifier
                            </button>
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>

    <div x-on:close-modal.window="if ($event.detail.name === 'canal-form') $wire.annulerEdition()">
        <x-modal name="canal-form" title="Modifier le canal">
            <form wire:submit="enregistrer" class="space-y-2">
                <label class="block text-xs font-medium text-slate-500">Libellé *</label>
                <input type="text" wire:model="libelle" class="block w-full text-sm">
                @error('libelle') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" wire:model="actif"> Actif
                </label>

                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" wire:click="annulerEdition" class="btn btn-secondary">Annuler</button>
                    <button type="submit" class="btn btn-primary">Enregistrer</button>
                </div>
            </form>
        </x-modal>
    </div>
</div>
