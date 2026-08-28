<x-layouts.app title="Investigation — {{ $dossier->reference }}">
    <div class="mb-6">
        <a href="{{ route('dossiers.show', $dossier) }}" class="text-sm text-slate-500 hover:text-slate-900">← Retour au dossier {{ $dossier->reference }}</a>
    </div>

    @session('status')
        <div class="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {{ $value }}
        </div>
    @endsession

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-5">
        <div>
            <p class="font-mono text-sm text-slate-500">{{ $dossier->reference }}</p>
            <h1 class="text-lg font-semibold text-slate-900">Investigation ouverte le {{ $investigation->date_ouverture->format('d/m/Y') }}</h1>
        </div>
        @php
            $badges = [
                'en_cours' => ['En cours', 'bg-slate-100 text-slate-700'],
                'en_attente_validation' => ['En attente de validation', 'bg-amber-100 text-amber-700'],
                'validee' => ['Validée', 'bg-emerald-100 text-emerald-700'],
            ];
            [$label, $classes] = $badges[$investigation->statut->value];
            $modifiable = $investigation->statut->value === 'en_cours';
        @endphp
        <span class="inline-flex items-center rounded px-2 py-1 text-xs font-medium {{ $classes }}">{{ $label }}</span>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
            <div class="rounded-lg border border-slate-200 bg-white p-5">
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Constats et analyse</h2>

                @can('update', $investigation)
                    @if ($modifiable)
                        <form wire:submit="enregistrer" class="space-y-3">
                            <label class="block text-xs font-medium text-slate-500">Faits constatés *</label>
                            <textarea wire:model="faitsConstates" rows="4" class="block w-full rounded-md border-slate-300 text-sm"></textarea>
                            @error('faitsConstates') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                            <label class="block text-xs font-medium text-slate-500">Personnes rencontrées</label>
                            <textarea wire:model="personnesRencontrees" rows="2" class="block w-full rounded-md border-slate-300 text-sm"></textarea>

                            <label class="block text-xs font-medium text-slate-500">Cause immédiate</label>
                            <textarea wire:model="causeImmediate" rows="2" class="block w-full rounded-md border-slate-300 text-sm"></textarea>

                            <label class="block text-xs font-medium text-slate-500">Causes racines</label>
                            <textarea wire:model="causesRacines" rows="2" class="block w-full rounded-md border-slate-300 text-sm"></textarea>

                            <label class="block text-xs font-medium text-slate-500">Recommandations *</label>
                            <textarea wire:model="recommandations" rows="4" class="block w-full rounded-md border-slate-300 text-sm"></textarea>
                            @error('recommandations') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                            <div class="flex gap-2 pt-2">
                                <button type="submit" class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                                    Enregistrer
                                </button>
                                <button type="button" wire:click="soumettrePourValidation"
                                        class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
            <div class="rounded-lg border border-slate-200 bg-white p-5">
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Informations</h2>
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
                    <div class="rounded-lg border border-amber-200 bg-white p-5">
                        <h2 class="mb-3 text-sm font-semibold text-amber-700">Validation hiérarchique (RGI-06)</h2>
                        <p class="mb-3 text-xs text-slate-500">
                            La validation ne peut être effectuée par l'enquêteur lui-même.
                        </p>
                        <button type="button" wire:click="valider"
                                class="w-full rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500">
                            Valider l'investigation
                        </button>
                    </div>
                @endif
            @endcan
        </div>
    </div>
</x-layouts.app>
