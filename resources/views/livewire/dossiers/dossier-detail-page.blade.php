<x-layouts.app title="Dossier {{ $dossier->reference }}">
    <div class="mb-6">
        <a href="{{ route('dossiers.index') }}" class="text-sm text-slate-500 hover:text-slate-900">← Retour à la liste</a>
    </div>

    @session('status')
        <div class="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {{ $value }}
        </div>
    @endsession

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-5">
        <div>
            <p class="font-mono text-sm text-slate-500">{{ $dossier->reference }}</p>
            <h1 class="text-lg font-semibold text-slate-900">{{ $dossier->parcours->libelle }} — {{ $dossier->categorie->libelle }}</h1>
        </div>
        <div class="flex items-center gap-2">
            <span class="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-white"
                  style="background-color: {{ $dossier->niveauGravite->couleur ?? '#64748b' }}">
                {{ $dossier->niveauGravite->libelle }}
            </span>
            <span class="inline-flex items-center rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {{ $dossier->statut->libelle_interne }}
            </span>
            @if ($dossier->is_anonymous)
                <span class="inline-flex items-center rounded bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">Anonyme</span>
            @endif
        </div>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
            <div class="rounded-lg border border-slate-200 bg-white p-5">
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Description</h2>
                <p class="whitespace-pre-line text-sm text-slate-700">{{ $dossier->description }}</p>

                <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
                    @if ($dossier->lieu)
                        <div><dt class="text-xs text-slate-500">Lieu</dt><dd class="text-slate-700">{{ $dossier->lieu }}</dd></div>
                    @endif
                    @if ($dossier->date_survenance)
                        <div><dt class="text-xs text-slate-500">Date des faits</dt><dd class="text-slate-700">{{ $dossier->date_survenance->format('d/m/Y H:i') }}</dd></div>
                    @endif
                    @if ($dossier->caractere_repetitif)
                        <div><dt class="text-xs text-slate-500">Caractère répétitif</dt><dd class="text-slate-700">{{ $dossier->caractere_repetitif }}</dd></div>
                    @endif
                    @if ($dossier->attentes_declarant)
                        <div><dt class="text-xs text-slate-500">Attentes du déclarant</dt><dd class="text-slate-700">{{ $dossier->attentes_declarant }}</dd></div>
                    @endif
                </dl>

                @if ($dossier->proposition_mesure_corrective)
                    <div class="mt-4">
                        <dt class="text-xs text-slate-500">Proposition de mesure corrective</dt>
                        <dd class="text-sm text-slate-700">{{ $dossier->proposition_mesure_corrective }}</dd>
                    </div>
                @endif
            </div>

            @if ($this->peutVoirIdentite && $dossier->identite)
                <div class="rounded-lg border border-slate-200 bg-white p-5">
                    <h2 class="mb-3 text-sm font-semibold text-slate-900">Identité du déclarant</h2>
                    <dl class="grid grid-cols-2 gap-3 text-sm">
                        @foreach ([
                            'nom_prenom' => 'Nom et prénom', 'matricule' => 'Matricule', 'entreprise' => 'Entreprise',
                            'fonction' => 'Fonction', 'localite' => 'Localité', 'statut_plaignant' => 'Statut',
                            'contact_email' => 'Email', 'contact_telephone' => 'Téléphone',
                        ] as $champ => $libelle)
                            @if ($dossier->identite->{$champ})
                                <div><dt class="text-xs text-slate-500">{{ $libelle }}</dt><dd class="text-slate-700">{{ $dossier->identite->{$champ} }}</dd></div>
                            @endif
                        @endforeach
                    </dl>
                </div>
            @elseif (! $dossier->is_anonymous && ! $this->peutVoirIdentite)
                <div class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Les données nominatives de ce dossier ne sont pas accessibles à votre rôle.
                </div>
            @endif

            <div class="rounded-lg border border-slate-200 bg-white p-5">
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Pièces jointes</h2>
                @forelse ($dossier->piecesJointes as $piece)
                    <a href="{{ route('pieces-jointes.telecharger', $piece) }}"
                       class="block truncate text-sm text-slate-700 hover:text-slate-900 hover:underline">
                        📎 {{ $piece->nom_original }}
                    </a>
                @empty
                    <p class="text-sm text-slate-400">Aucune pièce jointe.</p>
                @endforelse
            </div>

            <div class="rounded-lg border border-slate-200 bg-white p-5">
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Historique</h2>
                <ul class="space-y-3">
                    @foreach ($this->historique as $entree)
                        <li class="text-sm">
                            <p class="text-slate-700">
                                <span class="font-medium">{{ $entree->statutSuivant->libelle_interne }}</span>
                                @if ($entree->effectuePar)
                                    — {{ $entree->effectuePar->name }}
                                @else
                                    — Système
                                @endif
                            </p>
                            <p class="text-xs text-slate-400">{{ $entree->created_at->format('d/m/Y H:i') }}</p>
                            @if ($entree->commentaire)
                                <p class="text-xs text-slate-500">{{ $entree->commentaire }}</p>
                            @endif
                        </li>
                    @endforeach
                </ul>
            </div>
        </div>

        <div class="space-y-6">
            <div class="rounded-lg border border-slate-200 bg-white p-5">
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Affectation</h2>
                @forelse ($this->affectationsActives as $affectation)
                    <p class="text-sm text-slate-700">{{ $affectation->utilisateur->name }}</p>
                @empty
                    <p class="text-sm text-slate-400">Aucun responsable affecté.</p>
                @endforelse

                @can('reassign', $dossier)
                    <form wire:submit="reaffecter" class="mt-4 space-y-2 border-t border-slate-100 pt-4">
                        <label class="block text-xs font-medium text-slate-500">Réaffecter à</label>
                        <select wire:model="nouvelUtilisateurId" class="block w-full rounded-md border-slate-300 text-sm">
                            <option value="">— Sélectionner —</option>
                            @foreach ($this->utilisateursDisponibles as $utilisateur)
                                <option value="{{ $utilisateur->id }}">{{ $utilisateur->name }}</option>
                            @endforeach
                        </select>
                        @error('nouvelUtilisateurId') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                        <label class="block text-xs font-medium text-slate-500">Motif *</label>
                        <textarea wire:model="motifReaffectation" rows="2" class="block w-full rounded-md border-slate-300 text-sm"></textarea>
                        @error('motifReaffectation') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                        <button type="submit" class="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                            Réaffecter
                        </button>
                    </form>
                @endcan
            </div>

            @can('updateStatus', $dossier)
                @if ($this->transitionsDisponibles->isNotEmpty())
                    <div class="rounded-lg border border-slate-200 bg-white p-5">
                        <h2 class="mb-3 text-sm font-semibold text-slate-900">Changer le statut</h2>
                        <form wire:submit="changerStatut" class="space-y-2">
                            <select wire:model="nouveauStatutCode" class="block w-full rounded-md border-slate-300 text-sm">
                                <option value="">— Sélectionner —</option>
                                @foreach ($this->transitionsDisponibles as $statut)
                                    <option value="{{ $statut->code->value }}">{{ $statut->libelle_interne }}</option>
                                @endforeach
                            </select>
                            @error('nouveauStatutCode') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                            <textarea wire:model="commentaireStatut" rows="2" placeholder="Commentaire (facultatif)"
                                      class="block w-full rounded-md border-slate-300 text-sm"></textarea>
                            <button type="submit" class="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                                Mettre à jour
                            </button>
                        </form>
                    </div>
                @endif

                @if ($dossier->statut->code === \App\Enums\StatutDossierCode::EnAnalyse)
                    <div class="rounded-lg border border-red-200 bg-white p-5">
                        <h2 class="mb-3 text-sm font-semibold text-red-700">Rejeter (non recevable)</h2>
                        <form wire:submit="rejeter" class="space-y-2">
                            <textarea wire:model="motifRejet" rows="2" placeholder="Motif du rejet *"
                                      class="block w-full rounded-md border-slate-300 text-sm"></textarea>
                            @error('motifRejet') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                            <button type="submit" class="w-full rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500">
                                Rejeter le dossier
                            </button>
                        </form>
                    </div>
                @endif
            @endcan

            @can('close', $dossier)
                @if ($dossier->statut->code === \App\Enums\StatutDossierCode::Resolu)
                    <div class="rounded-lg border border-slate-200 bg-white p-5">
                        <h2 class="mb-3 text-sm font-semibold text-slate-900">Clôturer (EX-GES-05)</h2>
                        <form wire:submit="cloturer" class="space-y-2">
                            <textarea wire:model="syntheseResolution" rows="3" placeholder="Synthèse de résolution *"
                                      class="block w-full rounded-md border-slate-300 text-sm"></textarea>
                            @error('syntheseResolution') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                            <button type="submit" class="w-full rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                                Clôturer le dossier
                            </button>
                        </form>
                    </div>
                @endif
            @endcan

            @can('reopen', $dossier)
                @if ($dossier->statut->code === \App\Enums\StatutDossierCode::Cloture)
                    <div class="rounded-lg border border-amber-200 bg-white p-5">
                        <h2 class="mb-3 text-sm font-semibold text-amber-700">Réouverture contrôlée (RG-07)</h2>
                        <form wire:submit="reouvrir" class="space-y-2">
                            <textarea wire:model="motifReouverture" rows="2" placeholder="Motif de réouverture *"
                                      class="block w-full rounded-md border-slate-300 text-sm"></textarea>
                            @error('motifReouverture') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                            <button type="submit" class="w-full rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500">
                                Réouvrir le dossier
                            </button>
                        </form>
                    </div>
                @endif
            @endcan
        </div>
    </div>
</x-layouts.app>
