<x-layouts.app title="Dossier {{ $dossier->reference }}">
    <div class="mb-6">
        <a href="{{ route('dossiers.index') }}" class="text-sm text-slate-500 hover:text-slate-900">← Retour à la liste</a>
    </div>

    @session('status')
        <div class="alert alert-success mb-4">
            {{ $value }}
        </div>
    @endsession

    <div class="card mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
            <p class="font-mono text-sm text-slate-500">{{ $dossier->reference }}</p>
            <h1 class="text-lg font-semibold text-slate-900">{{ $dossier->parcours->libelle }} — {{ $dossier->categorie->libelle }}</h1>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            <x-gravite-badge :niveau="$dossier->niveauGravite" />
            <span class="badge badge-slate">
                {{ $dossier->statut->libelle_interne }}
            </span>
            @if ($dossier->is_anonymous)
                <span class="badge badge-indigo">Anonyme</span>
            @endif
            @if ($this->joursRestants !== null)
                @if ($this->joursRestants < 0)
                    <span class="badge badge-red">
                        En retard ({{ abs($this->joursRestants) }} j)
                    </span>
                @elseif ($this->joursRestants <= 3)
                    <span class="badge badge-amber">
                        Échéance dans {{ $this->joursRestants }} j
                    </span>
                @else
                    <span class="badge badge-emerald">
                        {{ $this->joursRestants }} j avant échéance
                    </span>
                @endif
            @endif
        </div>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
            <div class="card p-5">
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
                <div class="card p-5">
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
                <div class="alert alert-warning">
                    Les données nominatives de ce dossier ne sont pas accessibles à votre rôle.
                </div>
            @endif

            <div class="card p-5">
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Pièces jointes</h2>
                @forelse ($dossier->piecesJointes as $piece)
                    <a href="{{ route('pieces-jointes.telecharger', $piece) }}"
                       class="flex items-center gap-2 truncate rounded-md px-2 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900">
                        <svg class="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                            <path d="M8 12.5l4.5-4.5a2.121 2.121 0 013 3L10 16.5a4.243 4.243 0 01-6-6l6.5-6.5a3.536 3.536 0 015 5L9 15" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        <span class="truncate underline-offset-2 hover:underline">{{ $piece->nom_original }}</span>
                    </a>
                @empty
                    <p class="text-sm text-slate-400">Aucune pièce jointe.</p>
                @endforelse
            </div>

            <livewire:investigations.investigation-panel :dossier="$dossier" :key="'investigations-'.$dossier->id" />

            <livewire:actions-correctives.action-corrective-panel :dossier="$dossier" :key="'actions-correctives-'.$dossier->id" />

            @if ($this->peutVoirMessagerie)
                <livewire:messagerie.messagerie-dossier :dossier="$dossier" :key="'messagerie-'.$dossier->id" />
            @endif

            <div class="card p-5">
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
            <div class="card p-5">
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Affectation</h2>
                @forelse ($this->affectationsActives as $affectation)
                    <p class="text-sm text-slate-700">{{ $affectation->utilisateur->name }}</p>
                @empty
                    <p class="text-sm text-slate-400">Aucun responsable affecté.</p>
                @endforelse

                @can('reassign', $dossier)
                    <form wire:submit="reaffecter" class="mt-4 space-y-2 border-t border-slate-100 pt-4">
                        <label class="block text-xs font-medium text-slate-500">Réaffecter à</label>
                        <select wire:model="nouvelUtilisateurId" class="block w-full text-sm">
                            <option value="">— Sélectionner —</option>
                            @foreach ($this->utilisateursDisponibles as $utilisateur)
                                <option value="{{ $utilisateur->id }}">{{ $utilisateur->name }}</option>
                            @endforeach
                        </select>
                        @error('nouvelUtilisateurId') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                        <label class="block text-xs font-medium text-slate-500">Motif *</label>
                        <textarea wire:model="motifReaffectation" rows="2" class="block w-full text-sm"></textarea>
                        @error('motifReaffectation') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                        <button type="submit" class="btn btn-primary btn-block">
                            Réaffecter
                        </button>
                    </form>
                @endcan
            </div>

            @can('updateStatus', $dossier)
                @if ($this->transitionsDisponibles->isNotEmpty())
                    <div class="card p-5">
                        <h2 class="mb-3 text-sm font-semibold text-slate-900">Changer le statut</h2>
                        <form wire:submit="changerStatut" class="space-y-2">
                            <select wire:model="nouveauStatutCode" class="block w-full text-sm">
                                <option value="">— Sélectionner —</option>
                                @foreach ($this->transitionsDisponibles as $statut)
                                    <option value="{{ $statut->code->value }}">{{ $statut->libelle_interne }}</option>
                                @endforeach
                            </select>
                            @error('nouveauStatutCode') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                            <textarea wire:model="commentaireStatut" rows="2" placeholder="Commentaire (facultatif)"
                                      class="block w-full text-sm"></textarea>
                            <button type="submit" class="btn btn-primary btn-block">
                                Mettre à jour
                            </button>
                        </form>
                    </div>
                @endif

                @if ($dossier->statut->code === \App\Enums\StatutDossierCode::EnAnalyse)
                    <div class="card border-red-200 p-5">
                        <h2 class="mb-3 text-sm font-semibold text-red-700">Rejeter (non recevable)</h2>
                        <form wire:submit="rejeter" class="space-y-2">
                            <textarea wire:model="motifRejet" rows="2" placeholder="Motif du rejet *"
                                      class="block w-full text-sm"></textarea>
                            @error('motifRejet') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                            <button type="submit" class="btn btn-danger btn-block">
                                Rejeter le dossier
                            </button>
                        </form>
                    </div>
                @endif
            @endcan

            @can('close', $dossier)
                @if ($dossier->statut->code === \App\Enums\StatutDossierCode::Resolu)
                    <div class="card p-5">
                        <h2 class="mb-3 text-sm font-semibold text-slate-900">Clôturer (EX-GES-05)</h2>
                        <form wire:submit="cloturer" class="space-y-2">
                            <textarea wire:model="syntheseResolution" rows="3" placeholder="Synthèse de résolution *"
                                      class="block w-full text-sm"></textarea>
                            @error('syntheseResolution') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                            <button type="submit" class="btn btn-primary btn-block">
                                Clôturer le dossier
                            </button>
                        </form>
                    </div>
                @endif
            @endcan

            @can('reopen', $dossier)
                @if ($dossier->statut->code === \App\Enums\StatutDossierCode::Cloture)
                    <div class="card border-amber-200 p-5">
                        <h2 class="mb-3 text-sm font-semibold text-amber-700">Réouverture contrôlée (RG-07)</h2>
                        <form wire:submit="reouvrir" class="space-y-2">
                            <textarea wire:model="motifReouverture" rows="2" placeholder="Motif de réouverture *"
                                      class="block w-full text-sm"></textarea>
                            @error('motifReouverture') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                            <button type="submit" class="btn btn-warning btn-block">
                                Réouvrir le dossier
                            </button>
                        </form>
                    </div>
                @endif
            @endcan
        </div>
    </div>
</x-layouts.app>
