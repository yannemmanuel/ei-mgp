<?php

use App\Models\Parcours;
use App\Models\QrCode;

beforeEach(fn () => seedReferentiels());

it('redirects an active QR code to its parcours declaration form (EX-DEC-01)', function () {
    $parcours = Parcours::where('code', 'grief_communaute')->firstOrFail();
    $qr = QrCode::create([
        'parcours_id' => $parcours->id,
        'token' => 'test-token-1',
        'url_cible' => url('/declarer/grief-communaute'),
        'actif' => true,
        'genere_le' => now(),
    ]);

    $this->get("/q/{$qr->token}")->assertRedirect(route('declarer.grief-communaute'));
});

it('returns 404 for an inactive QR code', function () {
    $parcours = Parcours::where('code', 'ei_employe')->firstOrFail();
    $qr = QrCode::create([
        'parcours_id' => $parcours->id,
        'token' => 'test-token-2',
        'url_cible' => url('/declarer/ei-employe'),
        'actif' => false,
        'genere_le' => now(),
    ]);

    $this->get("/q/{$qr->token}")->assertNotFound();
});

it('returns 404 for an unknown token', function () {
    $this->get('/q/does-not-exist')->assertNotFound();
});
