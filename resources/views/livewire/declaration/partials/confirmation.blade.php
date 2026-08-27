<div class="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
    <h2 class="text-lg font-semibold text-emerald-900">Déclaration enregistrée</h2>
    <p class="mt-2 text-sm text-emerald-800">
        Votre déclaration a bien été prise en compte. Conservez précieusement les informations
        ci-dessous : elles sont indispensables pour suivre l'avancement de votre dossier.
    </p>

    <dl class="mx-auto mt-6 max-w-sm space-y-3 text-left">
        <div class="rounded-md bg-white p-3 shadow-sm">
            <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Numéro de référence</dt>
            <dd class="mt-1 font-mono text-lg font-semibold text-slate-900">{{ $referenceGeneree }}</dd>
        </div>

        @if ($codeAccesGenere)
            <div class="rounded-md bg-white p-3 shadow-sm">
                <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">Code d'accès (déclaration anonyme)</dt>
                <dd class="mt-1 font-mono text-lg font-semibold text-slate-900">{{ $codeAccesGenere }}</dd>
                <p class="mt-1 text-xs text-slate-500">
                    Ce code ne sera plus jamais affiché. Notez-le dès maintenant : avec votre
                    référence, il est la seule façon de suivre votre dossier de manière anonyme.
                </p>
            </div>
        @endif
    </dl>
</div>
