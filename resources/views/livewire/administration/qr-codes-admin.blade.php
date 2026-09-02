<div>
    <div class="mb-6">
        <x-breadcrumb :items="[['label' => 'Administration', 'url' => route('administration.index')], ['label' => 'QR codes']]" />
        <h1 class="text-h1 text-slate-900">QR codes</h1>
    </div>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="card p-5 lg:col-span-1">
            @if ($qrCodeEnEditionId)
                <h2 class="mb-3 text-h3 text-slate-900">Modifier l'URL cible</h2>
                <form wire:submit="enregistrerUrl" class="space-y-2">
                    <label class="block text-xs font-medium text-slate-500">URL cible *</label>
                    <input type="text" wire:model="urlCible" class="block w-full text-sm">
                    @error('urlCible') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                    <div class="flex gap-2 pt-2">
                        <button type="submit" class="btn btn-primary">Enregistrer</button>
                        <button type="button" wire:click="annulerEdition" class="btn btn-secondary">Annuler</button>
                    </div>
                </form>
            @else
                <h2 class="mb-3 text-h3 text-slate-900">Générer un QR code</h2>
                <form wire:submit="generer" class="space-y-2">
                    <label class="block text-xs font-medium text-slate-500">Parcours *</label>
                    <select wire:model="parcoursId" class="block w-full text-sm">
                        <option value="">— Sélectionner —</option>
                        @foreach ($this->parcoursListe as $parcours)
                            <option value="{{ $parcours->id }}">{{ $parcours->libelle }}</option>
                        @endforeach
                    </select>
                    @error('parcoursId') <p class="text-xs text-red-600">{{ $message }}</p> @enderror

                    <button type="submit" class="btn btn-primary btn-block">Générer</button>
                </form>
            @endif
        </div>

        <div class="card p-5 lg:col-span-2">
            <table class="w-full text-left text-sm">
                <thead>
                    <tr class="border-b border-slate-100 text-xs text-slate-500">
                        <th class="pb-2"></th>
                        <th class="pb-2">Parcours</th>
                        <th class="pb-2">Lien</th>
                        <th class="pb-2">Statut</th>
                        <th class="pb-2"></th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($this->qrCodes as $qrCode)
                        @php $dataUri = $this->qrCodeDataUri($qrCode); @endphp
                        <tr class="border-b border-slate-50">
                            <td class="py-2">
                                <img src="{{ $dataUri }}" alt="QR code {{ $qrCode->parcours->libelle }}"
                                     class="h-14 w-14 max-w-none shrink-0 rounded border border-slate-200 bg-white p-1">
                            </td>
                            <td class="py-2 text-slate-700">{{ $qrCode->parcours->libelle }}</td>
                            <td class="py-2 font-mono text-xs text-slate-500">{{ route('qr.redirect', $qrCode->token) }}</td>
                            <td class="py-2">
                                <x-actif-badge :actif="$qrCode->actif" label-inactif="Désactivé" />
                            </td>
                            <td class="py-2 text-right whitespace-nowrap">
                                <a href="{{ $dataUri }}" download="qr-{{ $qrCode->parcours->code->value }}-{{ $qrCode->token }}.svg"
                                   class="mr-2 text-sm font-medium text-slate-600 hover:text-slate-900">
                                    Télécharger
                                </a>
                                <button type="button" wire:click="modifier('{{ $qrCode->id }}')" class="mr-2 text-sm font-medium text-slate-600 hover:text-slate-900">
                                    Modifier l'URL
                                </button>
                                <button type="button" wire:click="basculerActif('{{ $qrCode->id }}')" class="text-sm font-medium text-slate-600 hover:text-slate-900">
                                    {{ $qrCode->actif ? 'Désactiver' : 'Réactiver' }}
                                </button>
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="5">
                                <x-empty-state title="Aucun QR code généré.">
                                    <x-slot:icon><x-icons.inbox class="h-10 w-10" /></x-slot:icon>
                                </x-empty-state>
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>
</div>
