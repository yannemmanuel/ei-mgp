<?php

namespace App\Services\Declaration;

use App\Enums\ParcoursCode;
use App\Enums\StatutDossierCode;
use App\Enums\TypeAffectation;
use App\Events\DeclarationCritique;
use App\Events\DeclarationSoumise;
use App\Events\DossierAffecte;
use App\Models\CanalCaptage;
use App\Models\DeclarationIdentite;
use App\Models\Dossier;
use App\Models\DossierAffectation;
use App\Models\HistoriqueStatut;
use App\Models\Parcours;
use App\Models\StatutDossier;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * Orchestre la création d'un dossier de bout en bout (prompt §15, CDC §5, §6). Point d'entrée
 * unique de la création d'une déclaration : les composants Livewire ne doivent jamais créer un
 * Dossier directement, pour garantir que chaque étape (référence, code d'accès, affectation,
 * historique, événements) est systématiquement exécutée.
 */
class DeclarationService
{
    /**
     * Rôles auto-affectés au captage selon le parcours (CDC §5.1/§5.2, EX-GES-02). Le nombre
     * d'acteurs par rôle n'étant pas borné par le CDC, TOUS les utilisateurs actifs porteurs du
     * rôle sont affectés (pas d'algorithme de répartition non spécifié par le CDC).
     *
     * @var array<string, list<string>>
     */
    private const ROLES_AFFECTATION_AUTOMATIQUE = [
        'ei_employe' => ['secretaire_csst', 'rqse'],
        'grief_employe' => ['rgp'],
        'grief_sous_traitant' => ['captage_grief_soustraitant'],
        'grief_communaute' => ['captage_grief_communaute'],
    ];

    public function __construct(
        private readonly ReferenceGeneratorService $references,
        private readonly AccessCodeService $codesAcces,
        private readonly PieceJointeUploadService $piecesJointes,
    ) {}

    /**
     * @param  array<string, mixed>  $donneesDossier  Attributs Dossier (categorie_id, niveau_gravite_id,
     *                                                description, lieu, date_survenance, attentes_declarant,
     *                                                categorie_autre_precision, declarant_user_id).
     * @param  array<string, mixed>  $donneesIdentite  Attributs declaration_identites, ignorés si anonyme (RG-06).
     * @param  list<UploadedFile>  $fichiers
     * @return array{dossier: Dossier, code_acces: ?string}
     */
    public function creer(
        ParcoursCode $parcoursCode,
        string $canalCaptageCode,
        bool $anonyme,
        array $donneesDossier,
        array $donneesIdentite,
        array $fichiers = [],
        ?int $televersePar = null,
    ): array {
        // Validée avant la transaction : un lot de fichiers rejeté ne doit pas déclencher
        // d'écriture partielle (dossier créé sans ses pièces jointes).
        $this->piecesJointes->verifierLot($fichiers);

        return DB::transaction(function () use (
            $parcoursCode, $canalCaptageCode, $anonyme, $donneesDossier, $donneesIdentite, $fichiers, $televersePar
        ) {
            $parcours = Parcours::query()->where('code', $parcoursCode->value)->firstOrFail();
            $statutRecu = StatutDossier::query()->where('code', StatutDossierCode::Recu->value)->firstOrFail();
            $canal = CanalCaptage::query()->where('code', $canalCaptageCode)->firstOrFail();

            $reference = $this->references->suivante($parcoursCode);

            // EX-NOT-06 / docs/exigences-securite.md §4 : la page de suivi publique exige
            // toujours référence + code d'accès, anonyme ou non (RG-02 ne couvrait jusqu'ici que
            // le cas anonyme ; généralisé ici pour que /suivi ait une clé secondaire uniforme —
            // cf. docs/decisions-techniques.md DT-28).
            $codeAccesClair = $this->codesAcces->generer();
            $accessCodeHash = $this->codesAcces->hacher($codeAccesClair);

            if ($anonyme) {
                // RG-06 : aucune donnée d'identification pour une déclaration anonyme, y
                // compris le déclarant identifié qui aurait pu être connecté au moment du dépôt.
                $donneesDossier['declarant_user_id'] = null;
            }

            $dossier = Dossier::create([
                ...$donneesDossier,
                'reference' => $reference,
                'parcours_id' => $parcours->id,
                'statut_id' => $statutRecu->id,
                'canal_captage_id' => $canal->id,
                'is_anonymous' => $anonyme,
                'access_code_hash' => $accessCodeHash,
            ]);

            if (! $anonyme && $donneesIdentite !== []) {
                DeclarationIdentite::create([...$donneesIdentite, 'dossier_id' => $dossier->id]);
            }

            if ($fichiers !== []) {
                $this->piecesJointes->stocker($fichiers, $dossier, $televersePar);
            }

            HistoriqueStatut::create([
                'dossier_id' => $dossier->id,
                'statut_precedent_id' => null,
                'statut_suivant_id' => $statutRecu->id,
                'commentaire' => 'Déclaration reçue.',
                'effectue_par' => null,
            ]);

            $aEteAffecte = $this->affecterAutomatiquement($dossier, $parcoursCode);

            if ($aEteAffecte) {
                $statutAffecte = StatutDossier::query()->where('code', StatutDossierCode::Affecte->value)->firstOrFail();

                $dossier->update(['statut_id' => $statutAffecte->id]);

                HistoriqueStatut::create([
                    'dossier_id' => $dossier->id,
                    'statut_precedent_id' => $statutRecu->id,
                    'statut_suivant_id' => $statutAffecte->id,
                    'commentaire' => 'Affectation automatique (EX-GES-02).',
                    'effectue_par' => null,
                ]);
            }

            $dossier->load('niveauGravite');
            event(new DeclarationSoumise($dossier));

            if ($dossier->niveauGravite->isCritique()) {
                event(new DeclarationCritique($dossier));
            }

            return ['dossier' => $dossier, 'code_acces' => $codeAccesClair];
        });
    }

    private function affecterAutomatiquement(Dossier $dossier, ParcoursCode $parcoursCode): bool
    {
        // ROLES_AFFECTATION_AUTOMATIQUE couvre les 4 parcours de façon exhaustive (vérifié par
        // Larastan) : pas de repli "aucun rôle configuré" à gérer ici, seulement le cas "aucun
        // utilisateur actif ne porte ce rôle", couvert par isNotEmpty() ci-dessous.
        $roles = self::ROLES_AFFECTATION_AUTOMATIQUE[$parcoursCode->value];

        $utilisateurs = User::query()
            ->role($roles)
            ->where('actif', true)
            ->get();

        foreach ($utilisateurs as $utilisateur) {
            DossierAffectation::create([
                'dossier_id' => $dossier->id,
                'user_id' => $utilisateur->id,
                'affecte_par' => null,
                'type' => TypeAffectation::Automatique->value,
                'actif' => true,
                'affecte_le' => now(),
            ]);
        }

        if ($utilisateurs->isNotEmpty()) {
            event(new DossierAffecte($dossier, $utilisateurs));
        }

        return $utilisateurs->isNotEmpty();
    }
}
