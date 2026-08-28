<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Rapport des dossiers</title>
    <style>
        body { font-family: sans-serif; font-size: 11px; color: #1e293b; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        p.meta { color: #64748b; margin-top: 0; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #e2e8f0; padding: 5px 7px; text-align: left; }
        th { background-color: #f1f5f9; }
    </style>
</head>
<body>
    <h1>Rapport des dossiers</h1>
    <p class="meta">Généré le {{ now()->format('d/m/Y H:i') }} — {{ $dossiers->count() }} dossier(s)</p>

    <table>
        <thead>
            <tr>
                <th>Référence</th>
                <th>Parcours</th>
                <th>Catégorie</th>
                <th>Gravité</th>
                <th>Statut</th>
                <th>Soumission</th>
                <th>Clôture</th>
                @if ($inclureNominatif)
                    <th>Déclarant</th>
                @endif
            </tr>
        </thead>
        <tbody>
            @foreach ($dossiers as $dossier)
                <tr>
                    <td>{{ $dossier->reference }}</td>
                    <td>{{ $dossier->parcours->libelle }}</td>
                    <td>{{ $dossier->categorie->libelle }}</td>
                    <td>{{ $dossier->niveauGravite->libelle }}</td>
                    <td>{{ $dossier->statut->libelle_interne }}</td>
                    <td>{{ $dossier->created_at->format('d/m/Y') }}</td>
                    <td>{{ $dossier->date_cloture?->format('d/m/Y') ?? '—' }}</td>
                    @if ($inclureNominatif)
                        <td>{{ $dossier->identite->nom_prenom ?? '—' }}</td>
                    @endif
                </tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>
