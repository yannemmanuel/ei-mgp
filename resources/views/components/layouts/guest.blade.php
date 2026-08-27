<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title ?? config('app.name') }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
    <div class="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div class="mb-8 text-center">
            <p class="text-sm font-semibold uppercase tracking-wide text-slate-500">Digitalisation EI / MGP</p>
        </div>

        <div class="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
            {{ $slot }}
        </div>
    </div>
</body>
</html>
