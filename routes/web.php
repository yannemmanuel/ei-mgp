<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return redirect(auth()->check() ? '/dashboard' : '/login');
});

Route::get('/dashboard', function () {
    return view('dashboard');
})->middleware('auth')->name('dashboard');
