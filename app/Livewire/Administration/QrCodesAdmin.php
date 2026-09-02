<?php

namespace App\Livewire\Administration;

use App\Models\Parcours;
use App\Models\QrCode;
use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\Writer\SvgWriter;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
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

        $this->dispatch('toast', message: 'QR code généré.', type: 'success');
        $this->reset(['parcoursId']);
    }

    public function enregistrerUrl(): void
    {
        $this->validate(['urlCible' => ['required', 'url', 'max:2000']], [], ['urlCible' => 'URL cible']);

        QrCode::findOrFail($this->qrCodeEnEditionId)->update(['url_cible' => $this->urlCible]);

        $this->dispatch('toast', message: 'URL cible mise à jour.', type: 'success');
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

    /**
     * Rendu SVG à la volée (data URI) — aucune écriture disque, pas de nouvelle route. Mis en
     * cache indéfiniment par token : le contenu encodé est la route de redirection
     * `/q/{token}`, jamais `url_cible` (c'est tout l'intérêt de l'indirection — réorienter un QR
     * physique déjà imprimé sans le régénérer, cf. docblock de classe) — donc un token donné
     * produit TOUJOURS le même SVG, pas d'invalidation à prévoir. Sans ce cache, une page listant
     * N QR codes relance N générations Endroid synchrones à chaque chargement ; sur cet
     * environnement déjà sujet à des dépassements de "Maximum execution time" sous charge, c'est
     * un vrai risque de fiabilité, pas seulement une micro-optimisation.
     */
    public function qrCodeDataUri(QrCode $qrCode): string
    {
        return Cache::rememberForever(
            "qr-code-svg:{$qrCode->token}",
            fn () => (new Builder(
                writer: new SvgWriter,
                data: route('qr.redirect', $qrCode->token),
                size: 160,
                margin: 4,
            ))->build()->getDataUri()
        );
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
        return view('livewire.administration.qr-codes-admin')
            ->layout('components.layouts.app', ['title' => 'Administration — QR codes']);
    }
}
