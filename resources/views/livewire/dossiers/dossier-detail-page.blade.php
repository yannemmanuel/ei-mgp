<div>
    <x-breadcrumb :items="[
        ['label' => 'Dossiers', 'url' => route('dossiers.index')],
        ['label' => $dossier->reference],
    ]" />

    <div class="card mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
            <p class="font-mono text-sm text-slate-500">{{ $dossier->reference }}</p>
            <h1 class="text-h1 text-slate-900">{{ $dossier->parcours->libelle }} — {{ $dossier->categorie->libelle }}</h1>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            <x-gravite-badge :niveau="$dossier->niveauGravite" />
            @if ($dossier->is_anonymous)
                <span class="badge badge-indigo">Anonyme</span>
            @endif
            @if ($this->peutGererContentieux && $dossier->contentieux)
                <span class="badge badge-red">Contentieux</span>
            @endif
        </div>
    </div>

    <div class="card mb-6 p-5">
        <x-workflow-stepper :statut="$dossier->statut" />

        @if ($this->joursRestants !== null)
            <div class="mt-4 border-t border-slate-100 pt-4">
                @if ($this->joursRestants < 0)
                    <span class="badge badge-red">En retard de {{ abs($this->joursRestants) }} jour(s)</span>
                @elseif ($this->joursRestants <= 3)
                    <span class="badge badge-amber">Échéance dans {{ $this->joursRestants }} jour(s)</span>
                @else
                    <span class="badge badge-emerald">{{ $this->joursRestants }} jour(s) avant échéance</span>
                @endif
            </div>
        @endif
    </div>

    @php
        $sectionsNav = [['id' => 'description', 'label' => 'Description']];
        if ($this->peutVoirIdentite && $dossier->identite) {
            $sectionsNav[] = ['id' => 'identite', 'label' => 'Identité'];
        }
        $sectionsNav[] = ['id' => 'pieces-jointes', 'label' => 'Pièces jointes'];
        $sectionsNav[] = ['id' => 'investigations', 'label' => 'Investigations'];
        $sectionsNav[] = ['id' => 'actions-correctives', 'label' => 'Actions correctives'];
        if ($this->peutVoirMessagerie) {
            $sectionsNav[] = ['id' => 'messagerie', 'label' => 'Messagerie'];
        }
        $sectionsNav[] = ['id' => 'activite', 'label' => 'Activité'];
    @endphp

    {{--
        Sommaire de navigation interne (docs/audit-frontend-2026-08-29.md, point 5) : une fiche
        dossier avec investigation + actions correctives + messagerie dépasse facilement 2-3 écrans
        de défilement sans aucun moyen d'y sauter directement. IntersectionObserver plutôt que du
        scrollspy Livewire : c'est un comportement 100% côté client (surligner l'onglet visible),
        aucune raison de faire un aller-retour serveur pour ça, et ça reste indifférent aux
        frontières des composants Livewire imbriqués (Investigations/Actions correctives/
        Messagerie sont chacun leur propre <livewire:...>, l'observation DOM ne s'en soucie pas.
    --}}
    <nav x-data="{ actif: '{{ $sectionsNav[0]['id'] }}' }"
         x-init="
            const cibles = document.querySelectorAll('[data-section]');
            const observateur = new IntersectionObserver((entrees) => {
                entrees.forEach((entree) => { if (entree.isIntersecting) actif = entree.target.dataset.section; });
            }, { rootMargin: '-140px 0px -70% 0px' });
            cibles.forEach((el) => observateur.observe(el));
         "
         aria-label="Sections de la fiche"
         class="sticky top-16 z-10 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 bg-brand-bg/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:bg-white sm:px-2">
        @foreach ($sectionsNav as $section)
            <a href="#section-{{ $section['id'] }}"
               :class="actif === '{{ $section['id'] }}' ? 'bg-primary-100 text-primary-700' : 'text-slate-600 hover:bg-slate-100'"
               class="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors">
                {{ $section['label'] }}
            </a>
        @endforeach
    </nav>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
            <div id="section-description" data-section="description" class="card scroll-mt-32 p-5">
                <h2 class="mb-3 text-h3 text-slate-900">Description</h2>
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
                <div id="section-identite" data-section="identite" class="card scroll-mt-32 p-5">
                    <h2 class="mb-3 text-h3 text-slate-900">Identité du déclarant</h2>
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

            <div id="section-pieces-jointes" data-section="pieces-jointes" class="card scroll-mt-32 p-5">
                <h2 class="mb-3 text-h3 text-slate-900">Pièces jointes</h2>
                @forelse ($dossier->piecesJointes as $piece)
                    <a href="{{ route('pieces-jointes.telecharger', $piece) }}"
                       class="flex items-center gap-2 truncate rounded-md px-2 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900">
                        <x-icons.paper-clip class="h-4 w-4 shrink-0 text-slate-400" />
                        <span class="truncate underline-offset-2 hover:underline">{{ $piece->nom_original }}</span>
                    </a>
                @empty
                    <x-empty-state title="Aucune pièce jointe.">
                        <x-slot:icon><x-icons.folder class="h-8 w-8" /></x-slot:icon>
                    </x-empty-state>
                @endforelse
            </div>

            <div id="section-investigations" data-section="investigations" class="scroll-mt-32">
                <livewire:investigations.investigation-panel :dossier="$dossier" :key="'investigations-'.$dossier->id" />
            </div>

            <div id="section-actions-correctives" data-section="actions-correctives" class="scroll-mt-32">
                <livewire:actions-correctives.action-corrective-panel :dossier="$dossier" :key="'actions-correctives-'.$dossier->id" />
            </div>

            @if ($this->peutVoirMessagerie)
                <div id="section-messagerie" data-section="messagerie" class="scroll-mt-32">
                    <livewire:messagerie.messagerie-dossier :dossier="$dossier" :key="'messagerie-'.$dossier->id" />
                </div>
            @endif

            <div id="section-activite" data-section="activite" class="card scroll-mt-32 p-5">
                <h2 class="mb-4 text-h3 text-slate-900">Activité</h2>
                @php
                    $toneParCode = [
                        'resolu' => 'success', 'cloture' => 'success',
                        'rejete' => 'danger',
                        'en_attente_information' => 'warning', 'reouvert' => 'warning',
                        'en_investigation' => 'info', 'action_corrective_en_cours' => 'info',
                    ];
                @endphp
                <x-activity-timeline :items="$this->historique->map(fn ($entree) => [
                    'label' => $entree->statutSuivant->libelle_interne,
                    'meta' => $entree->effectuePar?->name ?? 'Système',
                    'date' => $entree->created_at->format('d/m/Y H:i'),
                    'description' => $entree->commentaire,
                    'tone' => $toneParCode[$entree->statutSuivant->code->value] ?? 'neutral',
                ])->all()" />
            </div>
        </div>

        <div class="space-y-6">
            <div class="card p-5">
                <h2 class="mb-3 text-h3 text-slate-900">Affectation</h2>
                @forelse ($this->affectationsActives as $affectation)
                    <p class="text-sm text-slate-700">{{ $affectation->utilisateur->name }}</p>
                @empty
                    <p class="text-sm text-slate-400">Aucun responsable affecté.</p>
                @endforelse

                @can('reassign', $dossier)
                    <x-modal name="reaffecter-dossier" title="Réaffecter le dossier">
                        <x-slot:trigger>
                            <button type="button" x-on:click="$dispatch('open-modal', { name: 'reaffecter-dossier' })"
                                    class="btn btn-secondary btn-block mt-4">
                                Réaffecter
                            </button>
                        </x-slot:trigger>
                        <form wire:submit="reaffecter" class="space-y-2">
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

                            <div class="flex justify-end gap-2 pt-2">
                                <button type="button" x-on:click="$dispatch('close-modal', { name: 'reaffecter-dossier' })" class="btn btn-secondary">
                                    Annuler
                                </button>
                                <button type="submit" class="btn btn-primary">
                                    Réaffecter
                                </button>
                            </div>
                        </form>
                    </x-modal>
                @endcan
            </div>

            @can('updateStatus', $dossier)
                @if ($this->transitionsDisponibles->isNotEmpty())
                    <div class="card p-5">
                        <h2 class="mb-3 text-h3 text-slate-900">Changer le statut</h2>
                        <x-modal name="changer-statut" title="Changer le statut">
                            <x-slot:trigger>
                                <button type="button" x-on:click="$dispatch('open-modal', { name: 'changer-statut' })" class="btn btn-primary btn-block">
                                    Changer le statut
                                </button>
                            </x-slot:trigger>
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
                                <div class="flex justify-end gap-2 pt-2">
                                    <button type="button" x-on:click="$dispatch('close-modal', { name: 'changer-statut' })" class="btn btn-secondary">
                                        Annuler
                                    </button>
                                    <button type="submit" class="btn btn-primary">
                                        Mettre à jour
                                    </button>
                                </div>
                            </form>
                        </x-modal>
                    </div>
                @endif

                @if ($dossier->statut->code === \App\Enums\StatutDossierCode::EnAnalyse)
                    <div class="card border-red-200 p-5">
                        <h2 class="mb-3 text-h3 text-red-700">Rejeter (non recevable)</h2>
                        <x-modal name="rejeter-dossier" title="Rejeter le dossier">
                            <x-slot:trigger>
                                <button type="button" x-on:click="$dispatch('open-modal', { name: 'rejeter-dossier' })" class="btn btn-danger btn-block">
                                    Rejeter le dossier
                                </button>
                            </x-slot:trigger>
                            <form wire:submit="rejeter" class="space-y-2">
                                <textarea wire:model="motifRejet" rows="2" placeholder="Motif du rejet *"
                                          class="block w-full text-sm"></textarea>
                                @error('motifRejet') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                                <div class="flex justify-end gap-2 pt-2">
                                    <button type="button" x-on:click="$dispatch('close-modal', { name: 'rejeter-dossier' })" class="btn btn-secondary">
                                        Annuler
                                    </button>
                                    <button type="submit" class="btn btn-danger">
                                        Rejeter le dossier
                                    </button>
                                </div>
                            </form>
                        </x-modal>
                    </div>
                @endif
            @endcan

            @can('close', $dossier)
                @if ($dossier->statut->code === \App\Enums\StatutDossierCode::Resolu)
                    <div class="card p-5">
                        <h2 class="mb-3 text-h3 text-slate-900">Clôturer (EX-GES-05)</h2>
                        <x-modal name="cloturer-dossier" title="Clôturer le dossier">
                            <x-slot:trigger>
                                <button type="button" x-on:click="$dispatch('open-modal', { name: 'cloturer-dossier' })" class="btn btn-primary btn-block">
                                    Clôturer le dossier
                                </button>
                            </x-slot:trigger>
                            <form wire:submit="cloturer" class="space-y-2">
                                <textarea wire:model="syntheseResolution" rows="3" placeholder="Synthèse de résolution *"
                                          class="block w-full text-sm"></textarea>
                                @error('syntheseResolution') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                                <div class="flex justify-end gap-2 pt-2">
                                    <button type="button" x-on:click="$dispatch('close-modal', { name: 'cloturer-dossier' })" class="btn btn-secondary">
                                        Annuler
                                    </button>
                                    <button type="submit" class="btn btn-primary">
                                        Clôturer le dossier
                                    </button>
                                </div>
                            </form>
                        </x-modal>
                    </div>
                @endif
            @endcan

            @can('reopen', $dossier)
                @if ($dossier->statut->code === \App\Enums\StatutDossierCode::Cloture)
                    <div class="card border-amber-200 p-5">
                        <h2 class="mb-3 text-h3 text-amber-700">Réouverture contrôlée (RG-07)</h2>
                        <x-modal name="reouvrir-dossier" title="Réouverture contrôlée (RG-07)">
                            <x-slot:trigger>
                                <button type="button" x-on:click="$dispatch('open-modal', { name: 'reouvrir-dossier' })" class="btn btn-warning btn-block">
                                    Réouvrir le dossier
                                </button>
                            </x-slot:trigger>
                            <form wire:submit="reouvrir" class="space-y-2">
                                <textarea wire:model="motifReouverture" rows="2" placeholder="Motif de réouverture *"
                                          class="block w-full text-sm"></textarea>
                                @error('motifReouverture') <p class="text-xs text-red-600">{{ $message }}</p> @enderror
                                <div class="flex justify-end gap-2 pt-2">
                                    <button type="button" x-on:click="$dispatch('close-modal', { name: 'reouvrir-dossier' })" class="btn btn-secondary">
                                        Annuler
                                    </button>
                                    <button type="submit" class="btn btn-warning">
                                        Réouvrir le dossier
                                    </button>
                                </div>
                            </form>
                        </x-modal>
                    </div>
                @endif
            @endcan

            @if ($this->peutGererContentieux)
                <div class="card p-5">
                    <h2 class="mb-3 text-h3 text-slate-900">Conservation des données (RG-11)</h2>
                    <p class="mb-3 text-xs text-slate-500">
                        Un dossier en contentieux est exclu de l'anonymisation automatique après clôture.
                    </p>
                    <form wire:submit="basculerContentieux">
                        @if ($dossier->contentieux)
                            <button type="submit" wire:confirm="Confirmer la levée du blocage contentieux ?" class="btn btn-warning btn-block">
                                Lever le blocage contentieux
                            </button>
                        @else
                            <button type="submit" wire:confirm="Confirmer le marquage de ce dossier en contentieux ?" class="btn btn-danger btn-block">
                                Marquer en contentieux
                            </button>
                        @endif
                    </form>
                </div>
            @endif
        </div>
    </div>
</div>
