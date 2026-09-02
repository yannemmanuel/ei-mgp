<div>
    <div class="flex items-center gap-2 text-brand-green">
        <x-icons.check class="h-5 w-5" />
        <p class="text-sm font-medium">Déclaration enregistrée</p>
    </div>
    <p class="mt-2 text-sm text-slate-600">
        Votre déclaration a bien été prise en compte. Conservez précieusement les informations
        ci-dessous : elles sont indispensables pour suivre l'avancement de votre dossier.
    </p>

    <div class="mt-8 border-y-2 border-slate-900 py-5">
        <dt class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Numéro de référence</dt>
        <dd class="mt-1 font-serif text-3xl text-slate-900">{{ $referenceGeneree }}</dd>
    </div>

    @if ($codeAccesGenere)
        <div class="border-b-2 border-slate-900 py-5">
            <dt class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Code d'accès (déclaration anonyme)</dt>
            <dd class="mt-1 font-serif text-3xl text-slate-900">{{ $codeAccesGenere }}</dd>
            <p class="mt-2 text-xs text-slate-500">
                Ce code ne sera plus jamais affiché. Notez-le dès maintenant : avec votre
                référence, il est la seule façon de suivre votre dossier de manière anonyme.
            </p>
        </div>
    @endif
</div>
