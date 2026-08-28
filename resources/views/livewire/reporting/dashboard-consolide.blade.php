<x-layouts.app title="Tableau de bord">
    @if (! $this->peutVoirRapport)
        <div class="card p-6">
            <h1 class="text-lg font-semibold text-slate-900">Bienvenue, {{ auth()->user()->name }}</h1>
            <p class="mt-1 text-sm text-slate-500">
                Connecté avec le(s) rôle(s) :
                <span class="font-medium text-slate-700">{{ auth()->user()->getRoleNames()->join(', ') ?: 'aucun' }}</span>
            </p>
            @can('viewAny', App\Models\Dossier::class)
                <p class="mt-4 text-sm text-slate-700">
                    <span class="font-semibold">{{ $this->mesDossiersAffectes }}</span>
                    dossier(s) actuellement affecté(s) à votre compte.
                </p>
                <a href="{{ route('dossiers.index') }}" class="btn btn-secondary mt-3">Voir mes dossiers</a>
            @endcan
        </div>
    @else
        <div class="mb-6 flex items-center justify-between">
            <h1 class="text-lg font-semibold text-slate-900">Tableau de bord consolidé</h1>
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
            <div class="card p-5">
                <p class="text-xs text-slate-500">Déclarations</p>
                <p class="mt-1 text-2xl font-semibold text-slate-900">{{ $this->indicateurs['total'] }}</p>
            </div>
            <div class="card p-5">
                <p class="text-xs text-slate-500">Taux de résolution</p>
                <p class="mt-1 text-2xl font-semibold text-slate-900">{{ $this->indicateurs['tauxResolution'] ?? '—' }}{{ $this->indicateurs['tauxResolution'] !== null ? ' %' : '' }}</p>
            </div>
            <div class="card p-5">
                <p class="text-xs text-slate-500">Taux de clôture</p>
                <p class="mt-1 text-2xl font-semibold text-slate-900">{{ $this->indicateurs['tauxCloture'] ?? '—' }}{{ $this->indicateurs['tauxCloture'] !== null ? ' %' : '' }}</p>
            </div>
            <div class="card p-5">
                <p class="text-xs text-slate-500">Délai moyen (jours)</p>
                <p class="mt-1 text-2xl font-semibold text-slate-900">{{ $this->indicateurs['delaiMoyen'] ?? '—' }}</p>
            </div>
        </div>

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div class="card p-5">
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Par parcours</h2>
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
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Par statut</h2>
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
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Par gravité</h2>
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
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Historique mensuel (EX-REP-05)</h2>
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
    @endif
</x-layouts.app>
