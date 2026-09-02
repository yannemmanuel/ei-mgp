<div>
    <x-breadcrumb :items="[
        ['label' => 'Dossiers', 'url' => route('dossiers.index')],
        ['label' => $dossier->reference, 'url' => route('dossiers.show', $dossier)],
        ['label' => 'Investigation'],
    ]" />

    <div class="card mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
            <p class="font-mono text-sm text-slate-500">{{ $dossier->reference }}</p>
            <h1 class="text-h1 text-slate-900">Investigation ouverte le {{ $investigation->date_ouverture->format('d/m/Y') }}</h1>
        </div>
        @php
            $badges = [
                'en_cours' => ['En cours', 'badge-slate'],
                'en_attente_validation' => ['En attente de validation', 'badge-amber'],
                'validee' => ['Validée', 'badge-emerald'],
            ];
            [$label, $classes] = $badges[$investigation->statut->value];
            $modifiable = $investigation->statut->value === 'en_cours';
        @endphp
        <span class="badge {{ $classes }}">{{ $label }}</span>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
            <div class="card p-5">
                <h2 class="mb-3 text-h3 text-slate-900">Constats et analyse</h2>

                @can('update', $investigation)
                    @if ($modifiable)
                        <form wire:submit="enregistrer" class="space-y-3">
                            <label class="block text-xs font-medium text-slate-500">Faits constatés *</label>
                            <textarea wire:model="faitsConstates" rows="4" class="block w-full text-sm"></textarea>
                            @error('faitsConstates') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                            <label class="block text-xs font-medium text-slate-500">Personnes rencontrées</label>
                            <textarea wire:model="personnesRencontrees" rows="2" class="block w-full text-sm"></textarea>

                            <label class="block text-xs font-medium text-slate-500">Cause immédiate</label>
                            <textarea wire:model="causeImmediate" rows="2" class="block w-full text-sm"></textarea>

                            <label class="block text-xs font-medium text-slate-500">Causes racines</label>
                            <textarea wire:model="causesRacines" rows="2" class="block w-full text-sm"></textarea>

                            <label class="block text-xs font-medium text-slate-500">Recommandations *</label>
                            <textarea wire:model="recommandations" rows="4" class="block w-full text-sm"></textarea>
                            @error('recommandations') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                            <div class="flex gap-2 pt-2">
                                <button type="submit" class="btn btn-primary">
                                    Enregistrer
                                </button>
                                <button type="button" wire:click="soumettrePourValidation"
                                        wire:confirm="Confirmer la soumission pour validation ? Vous ne pourrez plus modifier cette fiche ensuite."
                                        class="btn btn-secondary">
                                    Soumettre pour validation
                                </button>
                            </div>
                        </form>
                    @endif
                @endcan

                @if (! $modifiable || ! auth()->user()->can('update', $investigation))
                    <dl class="space-y-3 text-sm">
                        <div><dt class="text-xs text-slate-500">Faits constatés</dt><dd class="whitespace-pre-line text-slate-700">{{ $investigation->faits_constates }}</dd></div>
                        @if ($investigation->personnes_rencontrees)
                            <div><dt class="text-xs text-slate-500">Personnes rencontrées</dt><dd class="whitespace-pre-line text-slate-700">{{ $investigation->personnes_rencontrees }}</dd></div>
                        @endif
                        @if ($investigation->cause_immediate)
                            <div><dt class="text-xs text-slate-500">Cause immédiate</dt><dd class="whitespace-pre-line text-slate-700">{{ $investigation->cause_immediate }}</dd></div>
                        @endif
                        @if ($investigation->causes_racines)
                            <div><dt class="text-xs text-slate-500">Causes racines</dt><dd class="whitespace-pre-line text-slate-700">{{ $investigation->causes_racines }}</dd></div>
                        @endif
                        <div><dt class="text-xs text-slate-500">Recommandations</dt><dd class="whitespace-pre-line text-slate-700">{{ $investigation->recommandations }}</dd></div>
                    </dl>
                @endif
            </div>
        </div>

        <div class="space-y-6">
            <div class="card p-5">
                <h2 class="mb-3 text-h3 text-slate-900">Informations</h2>
                <dl class="space-y-2 text-sm">
                    <div><dt class="text-xs text-slate-500">Enquêteur</dt><dd class="text-slate-700">{{ $investigation->enqueteur->name }}</dd></div>
                    @if ($investigation->validateur)
                        <div><dt class="text-xs text-slate-500">Validée par</dt><dd class="text-slate-700">{{ $investigation->validateur->name }}</dd></div>
                        <div><dt class="text-xs text-slate-500">Le</dt><dd class="text-slate-700">{{ $investigation->valide_le->format('d/m/Y H:i') }}</dd></div>
                    @endif
                </dl>
            </div>

            @can('validateInvestigation', $investigation)
                @if ($investigation->statut->value === 'en_attente_validation')
                    <div class="card border-amber-200 p-5">
                        <h2 class="mb-3 text-h3 text-amber-700">Validation hiérarchique (RGI-06)</h2>
                        <p class="mb-3 text-xs text-slate-500">
                            La validation ne peut être effectuée par l'enquêteur lui-même.
                        </p>
                        <button type="button" wire:click="valider"
                                wire:confirm="Confirmer la validation de cette investigation ? Cette action est définitive."
                                class="btn btn-warning btn-block">
                            Valider l'investigation
                        </button>
                    </div>
                @endif
            @endcan
        </div>
    </div>
</div>
