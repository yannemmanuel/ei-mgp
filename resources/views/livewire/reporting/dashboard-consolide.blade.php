<div>
    @if (! $this->peutVoirRapport)
        <h1 class="text-h1 text-slate-900">Bonjour, {{ auth()->user()->name }}</h1>
        <p class="mt-1 mb-6 text-sm text-slate-500">
            Connecté avec le(s) rôle(s) :
            <span class="font-medium text-slate-700">{{ auth()->user()->getRoleNames()->join(', ') ?: 'aucun' }}</span>
        </p>

        @can('viewAny', App\Models\Dossier::class)
            <div class="card p-5">
                <div class="mb-4 flex items-center justify-between">
                    <h2 class="text-h3 text-slate-900">Mes dossiers à traiter ({{ $this->mesDossiersAffectes }})</h2>
                    <a href="{{ route('dossiers.index', ['assigneAMoi' => true]) }}" wire:navigate class="text-sm font-medium text-primary-700 hover:underline">
                        Voir tous mes dossiers →
                    </a>
                </div>

                @forelse ($this->mesDossiersATraiter as $dossier)
                    <a href="{{ route('dossiers.show', $dossier) }}" wire:navigate
                       class="flex items-center justify-between gap-3 border-b border-slate-50 py-2.5 text-sm last:border-0 hover:text-slate-900">
                        <span class="min-w-0 truncate text-slate-700">
                            <span class="font-mono text-slate-500">{{ $dossier->reference }}</span>
                            — {{ $dossier->parcours->libelle }}
                        </span>
                        <x-statut-badge :statut="$dossier->statut" />
                    </a>
                @empty
                    <x-empty-state title="Aucun dossier à traiter." description="Vous êtes à jour.">
                        <x-slot:icon><x-icons.folder class="h-8 w-8" /></x-slot:icon>
                    </x-empty-state>
                @endforelse
            </div>
        @endcan
    @else
        <div class="mb-6 flex items-center justify-between">
            <h1 class="text-h1 text-slate-900">Tableau de bord consolidé</h1>
            @if ($this->peutExporter)
                <div class="flex items-center gap-2">
                    @if ($this->peutExporterNominatif)
                        <label class="flex items-center gap-1.5 text-xs text-slate-600">
                            <input type="checkbox" wire:model="inclureNominatif"> Inclure les données nominatives
                        </label>
                    @endif
                    <button type="button" wire:click="exporterExcel" class="btn btn-secondary">Export Excel</button>
                    <button type="button" wire:click="exporterPdf" class="btn btn-secondary">Export PDF</button>
                </div>
            @endif
        </div>

        @if ($this->blocATraiter['actionsEnRetard'] > 0 || $this->blocATraiter['investigationsEnAttente'] > 0)
            <div class="card mb-6 border-l-4 border-l-accent-600 p-5">
                <h2 class="mb-3 flex items-center gap-2 text-h3 text-slate-900">
                    <x-icons.bell class="h-5 w-5 text-accent-600" />
                    À traiter
                </h2>
                <div class="flex flex-wrap gap-3">
                    @if ($this->blocATraiter['actionsEnRetard'] > 0)
                        <a href="{{ route('actions-correctives.index', ['statut' => 'en_retard']) }}" wire:navigate
                           class="badge badge-red">
                            {{ $this->blocATraiter['actionsEnRetard'] }} action(s) corrective(s) en retard
                        </a>
                    @endif
                    @if ($this->blocATraiter['investigationsEnAttente'] > 0)
                        <a href="{{ route('investigations.index', ['statut' => 'en_attente_validation']) }}" wire:navigate
                           class="badge badge-amber">
                            {{ $this->blocATraiter['investigationsEnAttente'] }} investigation(s) en attente de validation
                        </a>
                    @endif
                </div>
            </div>
        @endif

        <div class="card mb-6 flex flex-wrap items-end gap-3 p-5">
            <div>
                <label class="block text-xs font-medium text-slate-500">Parcours</label>
                <select wire:model.live="parcoursId" class="mt-1 block text-sm">
                    <option value="">Tous</option>
                    @foreach ($this->parcoursDisponibles as $parcours)
                        <option value="{{ $parcours->id }}">{{ $parcours->libelle }}</option>
                    @endforeach
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-slate-500">Catégorie</label>
                <select wire:model.live="categorieId" class="mt-1 block text-sm">
                    <option value="">Toutes</option>
                    @foreach ($this->categoriesDisponibles as $categorie)
                        <option value="{{ $categorie->id }}">{{ $categorie->libelle }}</option>
                    @endforeach
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-slate-500">Statut</label>
                <select wire:model.live="statutId" class="mt-1 block text-sm">
                    <option value="">Tous</option>
                    @foreach ($this->statutsDisponibles as $statut)
                        <option value="{{ $statut->id }}">{{ $statut->libelle_interne }}</option>
                    @endforeach
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-slate-500">Gravité</label>
                <select wire:model.live="niveauGraviteId" class="mt-1 block text-sm">
                    <option value="">Toutes</option>
                    @foreach ($this->niveauxGraviteDisponibles as $niveau)
                        <option value="{{ $niveau->id }}">{{ $niveau->libelle }}</option>
                    @endforeach
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-slate-500">Site</label>
                <select wire:model.live="siteId" class="mt-1 block text-sm">
                    <option value="">Tous</option>
                    @foreach ($this->sitesDisponibles as $site)
                        <option value="{{ $site->id }}">{{ $site->libelle }}</option>
                    @endforeach
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-slate-500">Direction</label>
                <select wire:model.live="directionId" class="mt-1 block text-sm">
                    <option value="">Toutes</option>
                    @foreach ($this->directionsDisponibles as $direction)
                        <option value="{{ $direction->id }}">{{ $direction->libelle }}</option>
                    @endforeach
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-slate-500">Du</label>
                <input type="date" wire:model.live="periodeDebut" class="mt-1 block text-sm">
            </div>
            <div>
                <label class="block text-xs font-medium text-slate-500">Au</label>
                <input type="date" wire:model.live="periodeFin" class="mt-1 block text-sm">
            </div>
            <button type="button" wire:click="resetFiltres" class="btn btn-secondary">Réinitialiser</button>
        </div>

        <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="card border-l-4 border-l-secondary-600 p-5">
                <p class="text-xs text-slate-500">Déclarations</p>
                <p class="mt-1 text-2xl font-semibold text-slate-900">{{ $this->indicateurs['total'] }}</p>
            </div>
            <div class="card border-l-4 border-l-primary-600 p-5">
                <p class="text-xs text-slate-500">Taux de résolution</p>
                <p class="mt-1 text-2xl font-semibold text-slate-900">{{ $this->indicateurs['tauxResolution'] ?? '—' }}{{ $this->indicateurs['tauxResolution'] !== null ? ' %' : '' }}</p>
            </div>
            <div class="card border-l-4 border-l-primary-600 p-5">
                <p class="text-xs text-slate-500">Taux de clôture</p>
                <p class="mt-1 text-2xl font-semibold text-slate-900">{{ $this->indicateurs['tauxCloture'] ?? '—' }}{{ $this->indicateurs['tauxCloture'] !== null ? ' %' : '' }}</p>
            </div>
            <div class="card border-l-4 border-l-slate-300 p-5">
                <p class="text-xs text-slate-500">Délai moyen (jours)</p>
                <p class="mt-1 text-2xl font-semibold text-slate-900">{{ $this->indicateurs['delaiMoyen'] ?? '—' }}</p>
            </div>
        </div>

        {{--
            Onglets plutôt qu'un empilement de 9 blocs (docs/audit-frontend-2026-08-29.md, point
            6). Les 4 graphiques restent TOUS dans l'onglet actif par défaut, jamais dans un
            onglet masqué au chargement : Chart.js lit les dimensions du <canvas> à la
            construction, un canvas cousu dans un x-show="false" (display:none) se retrouve avec
            une largeur nulle et un graphique cassé — seul du contenu sans cette contrainte
            (tableaux) va dans le second onglet.
        --}}
        <div x-data="{ onglet: 'apercu' }">
            <div class="mb-4 flex gap-1 border-b border-slate-200">
                <button type="button" x-on:click="onglet = 'apercu'"
                        :class="onglet === 'apercu' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-900'"
                        class="border-b-2 px-3 py-2 text-sm font-medium transition-colors">
                    Vue d'ensemble
                </button>
                <button type="button" x-on:click="onglet = 'details'"
                        :class="onglet === 'details' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-900'"
                        class="border-b-2 px-3 py-2 text-sm font-medium transition-colors">
                    Répartitions &amp; historique
                </button>
            </div>

            <div x-show="onglet === 'apercu'">
                <div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div class="card p-5 lg:col-span-2" wire:ignore
                         x-data="volumeChart(@js($this->historiqueMensuel->reverse()->values()))"
                         x-on:graphiques-actualises.window="update($event.detail.historiqueMensuel)">
                        <h2 class="mb-3 text-h3 text-slate-900">Volume mensuel</h2>
                        <canvas x-ref="canvas" height="240"></canvas>
                    </div>
                    <div class="card p-5" wire:ignore
                         x-data="repartitionChart(@js($this->indicateurs['parGravite']))"
                         x-on:graphiques-actualises.window="update($event.detail.parGravite)">
                        <h2 class="mb-3 text-h3 text-slate-900">Répartition par gravité</h2>
                        <canvas x-ref="canvas" height="240"></canvas>
                    </div>
                </div>

                <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div class="card p-5" wire:ignore
                         x-data="delaisChart(@js($this->historiqueMensuel->reverse()->values()))"
                         x-on:graphiques-actualises.window="update($event.detail.historiqueMensuel)">
                        <h2 class="mb-3 text-h3 text-slate-900">Délai moyen (12 mois)</h2>
                        <canvas x-ref="canvas" height="200"></canvas>
                    </div>
                    <div class="card p-5" wire:ignore
                         x-data="resolutionChart(@js($this->historiqueMensuel->reverse()->values()))"
                         x-on:graphiques-actualises.window="update($event.detail.historiqueMensuel)">
                        <h2 class="mb-3 text-h3 text-slate-900">Taux de résolution (12 mois)</h2>
                        <canvas x-ref="canvas" height="200"></canvas>
                    </div>
                </div>
            </div>

            <div x-show="onglet === 'details'" x-cloak>
                <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div class="card p-5">
                        <h2 class="mb-3 text-h3 text-slate-900">Par parcours</h2>
                        <table class="w-full text-left text-sm">
                            @forelse ($this->indicateurs['parParcours'] as $ligne)
                                <tr class="border-b border-slate-50">
                                    <td class="py-1.5 text-slate-700">{{ $ligne->libelle }}</td>
                                    <td class="py-1.5 text-right font-medium text-slate-900">{{ $ligne->total }}</td>
                                </tr>
                            @empty
                                <tr><td class="py-1.5 text-slate-400">Aucune donnée.</td></tr>
                            @endforelse
                        </table>
                    </div>

                    <div class="card p-5">
                        <h2 class="mb-3 text-h3 text-slate-900">Par statut</h2>
                        <table class="w-full text-left text-sm">
                            @forelse ($this->indicateurs['parStatut'] as $ligne)
                                <tr class="border-b border-slate-50">
                                    <td class="py-1.5 text-slate-700">{{ $ligne->libelle }}</td>
                                    <td class="py-1.5 text-right font-medium text-slate-900">{{ $ligne->total }}</td>
                                </tr>
                            @empty
                                <tr><td class="py-1.5 text-slate-400">Aucune donnée.</td></tr>
                            @endforelse
                        </table>
                    </div>

                    <div class="card p-5">
                        <h2 class="mb-3 text-h3 text-slate-900">Par gravité</h2>
                        <table class="w-full text-left text-sm">
                            @forelse ($this->indicateurs['parGravite'] as $ligne)
                                <tr class="border-b border-slate-50">
                                    <td class="py-1.5 text-slate-700">
                                        <span class="inline-block h-2 w-2 rounded-full" style="background-color: {{ $ligne->couleur ?? '#64748b' }}"></span>
                                        {{ $ligne->libelle }}
                                    </td>
                                    <td class="py-1.5 text-right font-medium text-slate-900">{{ $ligne->total }}</td>
                                </tr>
                            @empty
                                <tr><td class="py-1.5 text-slate-400">Aucune donnée.</td></tr>
                            @endforelse
                        </table>
                    </div>
                </div>

                @if ($this->historiqueMensuel->isNotEmpty())
                    <div class="card mt-6 p-5">
                        <h2 class="mb-3 text-h3 text-slate-900">Historique mensuel (EX-REP-05)</h2>
                        <table class="w-full text-left text-sm">
                            <thead>
                                <tr class="border-b border-slate-100 text-xs text-slate-500">
                                    <th class="pb-2">Mois</th>
                                    <th class="pb-2 text-right">Déclarations</th>
                                    <th class="pb-2 text-right">Clôturées</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach ($this->historiqueMensuel as $ligne)
                                    <tr class="border-b border-slate-50">
                                        <td class="py-1.5 text-slate-700">{{ \Illuminate\Support\Carbon::parse($ligne->periode)->translatedFormat('F Y') }}</td>
                                        <td class="py-1.5 text-right text-slate-900">{{ $ligne->total }}</td>
                                        <td class="py-1.5 text-right text-slate-900">{{ $ligne->cloturees }}</td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                @endif
            </div>
        </div>
    @endif
</div>
