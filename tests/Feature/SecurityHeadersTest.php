<?php

it('sets standard hardening headers on every response (exigences-securite.md §5)', function () {
    $this->get('/up')
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('X-Frame-Options', 'DENY')
        ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
});
