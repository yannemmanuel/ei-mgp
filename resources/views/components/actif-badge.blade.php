@props(['actif', 'labelActif' => 'Actif', 'labelInactif' => 'Inactif'])

{{--
    Réservé aux bascules administratives banales (actif/inactif d'un référentiel) — pas aux
    statuts métier significatifs (dossier résolu/rejeté, etc.), qui gardent .badge-emerald/-red
    (docs/design-system-v2.md : la couleur encode un signal, pas une décoration). Une colonne
    entière de pastilles vertes saturées pour un simple bascule on/off lit comme "flashy" ; un
    point discret + texte reste scannable sans attirer l'œil sur l'état par défaut.
--}}
<span class="inline-flex items-center gap-1.5 text-sm text-slate-600">
    <span class="h-1.5 w-1.5 shrink-0 rounded-full {{ $actif ? 'bg-emerald-500' : 'bg-slate-300' }}"></span>
    {{ $actif ? $labelActif : $labelInactif }}
</span>
