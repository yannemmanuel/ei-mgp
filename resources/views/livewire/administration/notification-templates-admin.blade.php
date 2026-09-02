<div>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
            <x-breadcrumb :items="[['label' => 'Administration', 'url' => route('administration.index')], ['label' => 'Modèles de notification']]" />
            <h1 class="text-h1 text-slate-900">Modèles de notification</h1>
            <p class="mt-1 text-xs text-slate-500">
                Jetons disponibles : <code>{reference}</code>, <code>{parcours}</code>, et selon l'évènement <code>{statut}</code>, <code>{jours_restants}</code>.
            </p>
        </div>
        <button type="button" x-on:click="$dispatch('open-modal', { name: 'notification-template-form' })" class="btn btn-primary">
            + Nouveau gabarit
        </button>
    </div>

    <div class="card p-5">
        <table class="w-full text-left text-sm">
            <thead>
                <tr class="border-b border-slate-100 text-xs text-slate-500">
                    <th class="pb-2">Évènement</th>
                    <th class="pb-2">Parcours</th>
                    <th class="pb-2">Canal</th>
                    <th class="pb-2">Statut</th>
                    <th class="pb-2"></th>
                </tr>
            </thead>
            <tbody>
                @forelse ($this->templates as $template)
                    <tr class="border-b border-slate-50">
                        <td class="py-2 font-mono text-xs text-slate-700">{{ $template->evenement_code }}</td>
                        <td class="py-2 text-slate-500">{{ $template->parcours->libelle ?? 'Tous' }}</td>
                        <td class="py-2">
                            <span class="badge badge-slate">{{ $template->canal->value }}</span>
                        </td>
                        <td class="py-2">
                            <x-actif-badge :actif="$template->actif" />
                        </td>
                        <td class="py-2 text-right">
                            <button type="button" wire:click="modifier({{ $template->id }})" class="text-sm font-medium text-slate-600 hover:text-slate-900">
                                Modifier
                            </button>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="5">
                            <x-empty-state title="Aucun gabarit configuré.">
                                <x-slot:icon><x-icons.inbox class="h-10 w-10" /></x-slot:icon>
                            </x-empty-state>
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div x-on:close-modal.window="if ($event.detail.name === 'notification-template-form') $wire.annulerEdition()">
        <x-modal name="notification-template-form" :title="$templateEnEditionId ? 'Modifier le gabarit' : 'Créer un gabarit'">
            <form wire:submit="enregistrer" class="space-y-2">
                <label class="block text-xs font-medium text-slate-500">Code évènement *</label>
                <input type="text" wire:model="evenementCode" class="block w-full text-sm">
                @error('evenementCode') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="block text-xs font-medium text-slate-500">Parcours (vide = tous)</label>
                <select wire:model="parcoursId" class="block w-full text-sm">
                    <option value="">— Tous les parcours —</option>
                    @foreach ($this->parcoursListe as $parcours)
                        <option value="{{ $parcours->id }}">{{ $parcours->libelle }}</option>
                    @endforeach
                </select>

                <label class="block text-xs font-medium text-slate-500">Canal *</label>
                <select wire:model="canal" class="block w-full text-sm">
                    @foreach ($this->canaux as $c)
                        <option value="{{ $c->value }}">{{ $c->value }}</option>
                    @endforeach
                </select>

                <label class="block text-xs font-medium text-slate-500">Objet *</label>
                <input type="text" wire:model="objet" class="block w-full text-sm">
                @error('objet') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="block text-xs font-medium text-slate-500">Corps *</label>
                <textarea wire:model="corps" rows="4" class="block w-full text-sm"></textarea>
                @error('corps') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="block text-xs font-medium text-slate-500">Destinataires supplémentaires (emails séparés par des virgules)</label>
                <input type="text" wire:model="destinatairesSupplementaires" placeholder="prevention@example.test, directions@example.test" class="block w-full text-sm">
                @error('destinatairesSupplementaires') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                <label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" wire:model="actif"> Actif
                </label>

                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" wire:click="annulerEdition" class="btn btn-secondary">Annuler</button>
                    <button type="submit" class="btn btn-primary">
                        {{ $templateEnEditionId ? 'Enregistrer' : 'Créer' }}
                    </button>
                </div>
            </form>
        </x-modal>
    </div>
</div>
