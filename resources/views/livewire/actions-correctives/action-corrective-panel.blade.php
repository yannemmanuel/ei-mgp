<div class="rounded-lg border border-slate-200 bg-white p-5">
    <h2 class="mb-3 text-sm font-semibold text-slate-900">Actions correctives</h2>

    @forelse ($this->actions as $action)
        @php
            $badges = [
                'non_demarree' => ['Non démarrée', 'bg-slate-100 text-slate-700'],
                'en_cours' => ['En cours', 'bg-sky-100 text-sky-700'],
                'realisee' => ['Réalisée', 'bg-emerald-100 text-emerald-700'],
                'en_retard' => ['En retard', 'bg-red-100 text-red-700'],
            ];
            [$label, $classes] = $badges[$action->statut->value];
        @endphp
        <div class="mb-3 rounded-md border border-slate-100 p-3 text-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p class="font-medium text-slate-900">{{ $action->intitule }}</p>
                    <p class="text-xs text-slate-500">
                        {{ $action->responsable->name }} — échéance {{ $action->echeance->format('d/m/Y') }}
                    </p>
                </div>
                <span class="inline-flex items-center rounded px-2 py-1 text-xs font-medium {{ $classes }}">{{ $label }}</span>
            </div>

            <p class="mt-2 whitespace-pre-line text-slate-700">{{ $action->description }}</p>

            @if ($action->verification_efficacite !== null)
                <p class="mt-2 text-xs {{ $action->verification_efficacite ? 'text-emerald-700' : 'text-red-700' }}">
                    Vérification : {{ $action->verification_efficacite ? 'efficace' : 'non efficace' }}
                    @if ($action->verification_commentaire)
                        — {{ $action->verification_commentaire }}
                    @endif
                </p>
            @endif

            @if ($action->date_cloture)
                <p class="mt-1 text-xs text-slate-400">Clôturée le {{ $action->date_cloture->format('d/m/Y H:i') }}</p>
            @endif

            <div class="mt-2 flex flex-wrap gap-2">
                @if (in_array($action->statut->value, ['non_demarree']) && auth()->user()->can('update', $action))
                    <button type="button" wire:click="demarrer('{{ $action->id }}')"
                            class="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        Démarrer
                    </button>
                @endif

                @if (in_array($action->statut->value, ['en_cours', 'en_retard']) && auth()->user()->can('update', $action))
                    <button type="button" wire:click="marquerRealisee('{{ $action->id }}')"
                            class="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        Marquer réalisée
                    </button>
                @endif

                @if ($action->statut->value === 'realisee' && $action->verification_efficacite === null && auth()->user()->can('verifyEfficacite', $action))
                    <button type="button" wire:click="ouvrirVerification('{{ $action->id }}')"
                            class="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        Vérifier l'efficacité
                    </button>
                @endif

                @if ($action->verification_efficacite === true && ! $action->date_cloture && auth()->user()->can('close', $action))
                    <button type="button" wire:click="cloturerAction('{{ $action->id }}')"
                            class="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        Clôturer
                    </button>
                @endif
            </div>

            @if ($actionEnVerificationId === $action->id)
                <form wire:submit="soumettreVerification" class="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    <div class="flex gap-4 text-xs">
                        <label class="flex items-center gap-1">
                            <input type="radio" wire:model="efficace" value="1"> Efficace
                        </label>
                        <label class="flex items-center gap-1">
                            <input type="radio" wire:model="efficace" value="0"> Non efficace
                        </label>
                    </div>
                    <textarea wire:model="commentaireVerification" rows="2" placeholder="Commentaire"
                              class="block w-full rounded-md border-slate-300 text-sm"></textarea>
                    @error('commentaireVerification') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                    <button type="submit" class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
                        Enregistrer la vérification
                    </button>
                </form>
            @endif
        </div>
    @empty
        <p class="text-sm text-slate-400">Aucune action corrective pour ce dossier.</p>
    @endforelse

    @if ($this->peutCreer)
        <form wire:submit="creer" class="mt-4 space-y-2 border-t border-slate-100 pt-4">
            <h3 class="text-xs font-semibold text-slate-500">Créer une action corrective</h3>

            @if ($this->investigationsValidees->isNotEmpty())
                <label class="block text-xs font-medium text-slate-500">Investigation source (facultatif)</label>
                <select wire:model="investigationId" class="block w-full rounded-md border-slate-300 text-sm">
                    <option value="">— Aucune —</option>
                    @foreach ($this->investigationsValidees as $investigation)
                        <option value="{{ $investigation->id }}">Investigation du {{ $investigation->date_ouverture->format('d/m/Y') }}</option>
                    @endforeach
                </select>
            @endif

            <label class="block text-xs font-medium text-slate-500">Intitulé *</label>
            <input type="text" wire:model="intitule" class="block w-full rounded-md border-slate-300 text-sm">
            @error('intitule') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <label class="block text-xs font-medium text-slate-500">Description *</label>
            <textarea wire:model="description" rows="3" class="block w-full rounded-md border-slate-300 text-sm"></textarea>
            @error('description') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <label class="block text-xs font-medium text-slate-500">Responsable *</label>
            <select wire:model="responsableId" class="block w-full rounded-md border-slate-300 text-sm">
                <option value="">— Sélectionner —</option>
                @foreach ($this->responsablesDisponibles as $utilisateur)
                    <option value="{{ $utilisateur->id }}">{{ $utilisateur->name }}</option>
                @endforeach
            </select>
            @error('responsableId') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <label class="block text-xs font-medium text-slate-500">Échéance *</label>
            <input type="date" wire:model="echeance" class="block w-full rounded-md border-slate-300 text-sm">
            @error('echeance') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

            <button type="submit" class="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                Créer l'action corrective
            </button>
        </form>
    @endif
</div>
