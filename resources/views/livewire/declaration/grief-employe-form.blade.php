<x-layouts.guest title="Grief / plainte — Employé" max-width="max-w-2xl">
    <div class="w-full">
        <h1 class="mb-1 text-lg font-semibold text-slate-900">Déclarer un grief ou une plainte</h1>
        <p class="mb-6 text-sm text-slate-500">Parcours Employé.</p>

        @if ($soumis)
            @include('livewire.declaration.partials.confirmation')
        @else
            <form wire:submit="submit" class="relative space-y-6">
                @include('livewire.declaration.partials.honeypot')
                @include('livewire.declaration.partials.canal-relais')
                @include('livewire.declaration.partials.anonymat')

                @unless ($anonymat)
                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label for="nomPrenom" class="block text-sm font-medium text-slate-700">Nom et prénom</label>
                            <input id="nomPrenom" type="text" wire:model="nomPrenom" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        </div>
                        <div>
                            <label for="matricule" class="block text-sm font-medium text-slate-700">Matricule / département / service</label>
                            <input id="matricule" type="text" wire:model="matricule" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        </div>
                        <div>
                            <label for="posteOccupe" class="block text-sm font-medium text-slate-700">Poste occupé</label>
                            <input id="posteOccupe" type="text" wire:model="posteOccupe" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        </div>
                        <div>
                            <label for="ancienneteAnnees" class="block text-sm font-medium text-slate-700">Ancienneté (années)</label>
                            <input id="ancienneteAnnees" type="number" min="0" wire:model="ancienneteAnnees" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        </div>
                        <div>
                            <label for="contactEmail" class="block text-sm font-medium text-slate-700">Email</label>
                            <input id="contactEmail" type="email" wire:model="contactEmail" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            @error('contactEmail') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label for="contactTelephone" class="block text-sm font-medium text-slate-700">Téléphone</label>
                            <input id="contactTelephone" type="text" wire:model="contactTelephone" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        </div>
                    </div>
                @endunless

                <div>
                    <label for="categorieId" class="block text-sm font-medium text-slate-700">Catégorie du grief *</label>
                    <select id="categorieId" wire:model.live="categorieId" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        <option value="">— Sélectionner —</option>
                        @foreach ($this->categoriesDisponibles as $categorie)
                            <option value="{{ $categorie->id }}">{{ $categorie->libelle }}</option>
                        @endforeach
                    </select>
                    @error('categorieId') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                </div>

                @if ($this->categorieEstAutre)
                    <div>
                        <label for="categorieAutrePrecision" class="block text-sm font-medium text-slate-700">Merci de préciser *</label>
                        <input id="categorieAutrePrecision" type="text" wire:model="categorieAutrePrecision" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        @error('categorieAutrePrecision') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                @endif

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label for="niveauGraviteId" class="block text-sm font-medium text-slate-700">Niveau de gravité *</label>
                        <select id="niveauGraviteId" wire:model="niveauGraviteId" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            <option value="">— Sélectionner —</option>
                            @foreach ($this->niveauxGraviteDisponibles as $niveau)
                                <option value="{{ $niveau->id }}">{{ $niveau->libelle }}</option>
                            @endforeach
                        </select>
                        @error('niveauGraviteId') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                    <div>
                        <label for="caractereRepetitif" class="block text-sm font-medium text-slate-700">Caractère répétitif *</label>
                        <select id="caractereRepetitif" wire:model="caractereRepetitif" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                            <option value="">— Sélectionner —</option>
                            <option value="premiere_fois">Première fois</option>
                            <option value="deja_signale">Déjà signalé</option>
                            <option value="recurrent">Récurrent</option>
                        </select>
                        @error('caractereRepetitif') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                </div>

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label for="dateHeureFaits" class="block text-sm font-medium text-slate-700">Date et heure des faits *</label>
                        <input id="dateHeureFaits" type="datetime-local" wire:model="dateHeureFaits" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        @error('dateHeureFaits') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                    <div>
                        <label for="lieu" class="block text-sm font-medium text-slate-700">Lieu *</label>
                        <input id="lieu" type="text" wire:model="lieu" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        @error('lieu') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                    </div>
                </div>

                <div>
                    <label for="description" class="block text-sm font-medium text-slate-700">Description détaillée *</label>
                    <textarea id="description" wire:model="description" rows="4" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                    @error('description') <p class="mt-1 text-sm text-red-600">{{ $message }}</p> @enderror
                </div>

                <div class="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Attention : les informations sur les personnes impliquées et les témoins sont traitées de
                    façon strictement confidentielle.
                </div>

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label for="personnesImpliquees" class="block text-sm font-medium text-slate-700">Personnes impliquées</label>
                        <textarea id="personnesImpliquees" wire:model="personnesImpliquees" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                    </div>
                    <div>
                        <label for="temoinsEventuels" class="block text-sm font-medium text-slate-700">Témoins éventuels</label>
                        <textarea id="temoinsEventuels" wire:model="temoinsEventuels" rows="2" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm"></textarea>
                    </div>
                </div>

                @include('livewire.declaration.partials.pieces-jointes')

                <div>
                    <label for="resultatSouhaite" class="block text-sm font-medium text-slate-700">Résultat souhaité</label>
                    <select id="resultatSouhaite" wire:model="resultatSouhaite" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                        <option value="">— Sélectionner —</option>
                        <option value="resolution">Résolution</option>
                        <option value="mediation">Médiation</option>
                        <option value="sanction">Sanction</option>
                        <option value="signalement_simple">Signalement simple</option>
                    </select>
                </div>

                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label class="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" wire:model="souhaitEtreRecontacte" class="rounded border-slate-300">
                        Je souhaite être recontacté(e)
                    </label>
                    @unless ($anonymat)
                        <div>
                            <label for="preferenceCanalRetour" class="block text-sm font-medium text-slate-700">Canal de retour préféré</label>
                            <select id="preferenceCanalRetour" wire:model="preferenceCanalRetour" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm sm:text-sm">
                                <option value="">— Sélectionner —</option>
                                <option value="email">Email</option>
                                <option value="telephone">Téléphone</option>
                                <option value="entretien">Entretien</option>
                                <option value="page_de_suivi">Page de suivi</option>
                            </select>
                        </div>
                    @endunless
                </div>

                <button type="submit" wire:loading.attr="disabled" wire:target="submit"
                        class="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
                    <span wire:loading.remove wire:target="submit">Soumettre la déclaration</span>
                    <span wire:loading wire:target="submit">Envoi en cours…</span>
                </button>
            </form>
        @endif
    </div>
</x-layouts.guest>
