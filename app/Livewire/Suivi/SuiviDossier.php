<?php

namespace App\Livewire\Suivi;

use App\Models\Dossier;
use App\Services\Audit\AuditLogger;
use App\Services\Declaration\AccessCodeService;
use Illuminate\Support\Facades\RateLimiter;
use Livewire\Component;

/**
 * EX-NOT-06 : page de suivi publique, accessible uniquement par référence + code d'accès
 * (docs/exigences-securite.md §4 — jamais par email/téléphone, RGI-12 ; généralisé aux dossiers
 * non anonymes en Phase 9, cf. docs/decisions-techniques.md DT-28). Le débit est contrôlé ici
 * (pas par un middleware de route) : les interactions Livewire transitent par un endpoint
 * partagé, même principe que DT-14 (formulaires de déclaration).
 */
class SuiviDossier extends Component
{
    public string $reference = '';

    public string $codeAcces = '';

    public ?string $dossierId = null;

    public function rechercher(AccessCodeService $codesAcces, AuditLogger $auditLogger): void
    {
        $this->validate([
            'reference' => ['required', 'string'],
            'codeAcces' => ['required', 'string'],
        ], [], ['reference' => 'référence', 'codeAcces' => 'code d\'accès']);

        $referenceNormalisee = strtoupper(trim($this->reference));
        $cleIp = 'suivi-lookup-ip:'.request()->ip();
        $cleReference = 'suivi-lookup-ref:'.$referenceNormalisee;

        // docs/exigences-securite.md §4 : throttling agressif + verrouillage temporaire après N
        // tentatives échouées, sur l'IP ET sur la référence ciblée (protège aussi contre un
        // brute-force distribué visant une seule référence depuis des IP différentes).
        if (RateLimiter::tooManyAttempts($cleIp, 10) || RateLimiter::tooManyAttempts($cleReference, 5)) {
            $this->addError('reference', 'Trop de tentatives. Merci de réessayer plus tard.');

            return;
        }

        $dossier = Dossier::query()->where('reference', $referenceNormalisee)->first();
        $codeValide = $dossier !== null
            && $dossier->access_code_hash !== null
            && $codesAcces->verifier($this->codeAcces, $dossier->access_code_hash);

        if (! $codeValide) {
            RateLimiter::hit($cleIp, 600);
            RateLimiter::hit($cleReference, 900);

            // docs/exigences-securite.md §4 : tentative échouée journalisée pour l'auditeur/DPO
            // (piste d'un éventuel brute-force) — seule la référence tentée est enregistrée,
            // jamais le code d'accès saisi. L'IP est déjà capturée automatiquement par
            // AuditLogger::enregistrer() et reste soumise à la même restriction de consultation
            // que le reste du journal (App\Livewire\Audit\AuditLogViewer::peutVoirAdresseIp).
            $auditLogger->enregistrer('suivi.tentative_echouee', nouvellesValeurs: ['reference_tentee' => $referenceNormalisee]);

            // Message générique volontaire : ne jamais révéler si c'est la référence ou le code
            // qui est incorrect (empêcherait un attaquant de distinguer les deux cas).
            $this->addError('reference', 'Aucun dossier ne correspond à ces informations.');

            return;
        }

        RateLimiter::clear($cleReference);

        session(["suivi_verifie_{$dossier->id}" => true]);
        $this->dossierId = $dossier->id;
    }

    public function getDossierProperty(): ?Dossier
    {
        if ($this->dossierId === null) {
            return null;
        }

        return Dossier::query()->with(['parcours', 'statut'])->find($this->dossierId);
    }

    public function render()
    {
        return view('livewire.suivi.suivi-dossier');
    }
}
