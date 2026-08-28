<?php

namespace App\Livewire\Administration;

use App\Models\Parcours;
use App\Models\QrCode;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Livewire\Component;

/**
 * Console des QR codes (`qrcodes.manage`, DT-02 : paramétrage technique, `administrateur_digital`).
 * EX-DEC-01 : un token stable redirige (App\Http\Controllers\QrCodeRedirectController) vers le
 * formulaire du parcours — modifier l'URL cible d'un code existant permet de réorienter un QR
 * physique déjà imprimé sans le régénérer.
 */
class QrCodesAdmin extends Component
{
    public string $parcoursId = '';

    public string $urlCible = '';

    public ?string $qrCodeEnEditionId = null;

    public function mount(): void
    {
        abort_unless(Auth::user()->can('qrcodes.manage'), 403);
    }

    public function modifier(string $qrCodeId): void
    {
        $qrCode = QrCode::findOrFail($qrCodeId);

        $this->qrCodeEnEditionId = $qrCode->id;
        $this->urlCible = $qrCode->url_cible;
    }

    public function annulerEdition(): void
    {
        $this->reset(['qrCodeEnEditionId', 'parcoursId', 'urlCible']);
    }

    public function generer(): void
    {
        $this->validate(['parcoursId' => ['required', 'exists:parcours,id']], [], ['parcoursId' => 'parcours']);

        $parcours = Parcours::findOrFail($this->parcoursId);

        QrCode::create([
            'parcours_id' => $parcours->id,
            'token' => Str::random(24),
            'url_cible' => route('declarer.'.str_replace('_', '-', $parcours->code->value)),
            'actif' => true,
            'genere_par' => Auth::id(),
            'genere_le' => now(),
        ]);

        session()->flash('status', 'QR code généré.');
        $this->reset(['parcoursId']);
    }

    public function enregistrerUrl(): void
    {
        $this->validate(['urlCible' => ['required', 'url', 'max:2000']], [], ['urlCible' => 'URL cible']);

        QrCode::findOrFail($this->qrCodeEnEditionId)->update(['url_cible' => $this->urlCible]);

        session()->flash('status', 'URL cible mise à jour.');
        $this->annulerEdition();
    }

    public function basculerActif(string $qrCodeId): void
    {
        $qrCode = QrCode::findOrFail($qrCodeId);
        $qrCode->update([
            'actif' => ! $qrCode->actif,
            'desactive_le' => $qrCode->actif ? now() : null,
        ]);
    }

    /** @return Collection<int, QrCode> */
    public function getQrCodesProperty(): Collection
    {
        return QrCode::query()->with('parcours')->orderByDesc('genere_le')->get();
    }

    /** @return Collection<int, Parcours> */
    public function getParcoursListeProperty(): Collection
    {
        return Parcours::query()->orderBy('ordre')->get();
    }

    public function render()
    {
        return view('livewire.administration.qr-codes-admin');
    }
}
