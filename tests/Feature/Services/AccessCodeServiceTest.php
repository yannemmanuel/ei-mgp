<?php

use App\Services\Declaration\AccessCodeService;

it('generates a 6-digit numeric code (EX-DEC-09)', function () {
    $service = app(AccessCodeService::class);

    $code = $service->generer();

    expect($code)->toMatch('/^\d{6}$/');
});

it('hashes the code and can verify it later, but never stores it in clear', function () {
    $service = app(AccessCodeService::class);

    $code = $service->generer();
    $hash = $service->hacher($code);

    expect($hash)->not->toBe($code);
    expect($service->verifier($code, $hash))->toBeTrue();
    expect($service->verifier('000000', $hash))->toBeFalse();
});
