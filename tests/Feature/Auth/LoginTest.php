<?php

use App\Models\User;
use Database\Seeders\DemoUsersSeeder;
use Database\Seeders\RolePermissionSeeder;

it('redirects a guest visiting the root URL to the login page', function () {
    $this->get('/')->assertRedirect('/login');
});

it('redirects an authenticated user visiting the root URL to the dashboard', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->get('/')->assertRedirect('/dashboard');
});

it('renders the login page for a guest', function () {
    $this->get('/login')->assertOk()->assertSee('Connexion');
});

it('redirects an unauthenticated user away from the dashboard', function () {
    $this->get('/dashboard')->assertRedirect('/login');
});

it('logs a demo user in with the correct credentials and shows their role', function () {
    $this->seed(RolePermissionSeeder::class);
    $this->seed(DemoUsersSeeder::class);

    $response = $this->post('/login', [
        'email' => 'admin@example.test',
        'password' => 'password',
    ]);

    $response->assertRedirect('/dashboard');
    $this->assertAuthenticatedAs(User::where('email', 'admin@example.test')->first());

    $this->get('/dashboard')->assertOk()->assertSee('administrateur_digital');
});

it('rejects an invalid password', function () {
    $this->seed(RolePermissionSeeder::class);
    $this->seed(DemoUsersSeeder::class);

    $response = $this->post('/login', [
        'email' => 'admin@example.test',
        'password' => 'wrong-password',
    ]);

    $response->assertSessionHasErrors();
    $this->assertGuest();
});

it('logs an authenticated user out', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->post('/logout');

    $this->assertGuest();
});
