<x-layouts.app title="Administration — QR codes">
    <div class="mb-6">
        <a href="{{ route('administration.index') }}" class="text-sm text-slate-500 hover:text-slate-900">← Administration</a>
        <h1 class="mt-1 text-lg font-semibold text-slate-900">QR codes</h1>
    </div>

    @session('status')
        <div class="alert alert-success mb-4">{{ $value }}</div>
    @endsession

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div class="card p-5 lg:col-span-1">
            @if ($qrCodeEnEditionId)
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Modifier l'URL cible</h2>
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
                <h2 class="mb-3 text-sm font-semibold text-slate-900">Générer un QR code</h2>
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
                        <th class="pb-2">Parcours</th>
                        <th class="pb-2">Lien</th>
                        <th class="pb-2">Statut</th>
                        <th class="pb-2"></th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($this->qrCodes as $qrCode)
                        <tr class="border-b border-slate-50">
                            <td class="py-2 text-slate-700">{{ $qrCode->parcours->libelle }}</td>
                            <td class="py-2 font-mono text-xs text-slate-500">{{ route('qr.redirect', $qrCode->token) }}</td>
                            <td class="py-2">
                                <span class="badge {{ $qrCode->actif ? 'badge-emerald' : 'badge-red' }}">
                                    {{ $qrCode->actif ? 'Actif' : 'Désactivé' }}
                                </span>
                            </td>
                            <td class="py-2 text-right">
                                <button type="button" wire:click="modifier('{{ $qrCode->id }}')" class="mr-2 text-sm font-medium text-slate-600 hover:text-slate-900">
                                    Modifier l'URL
                                </button>
                                <button type="button" wire:click="basculerActif('{{ $qrCode->id }}')" class="text-sm font-medium text-slate-600 hover:text-slate-900">
                                    {{ $qrCode->actif ? 'Désactiver' : 'Réactiver' }}
                                </button>
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    </div>
</x-layouts.app>
