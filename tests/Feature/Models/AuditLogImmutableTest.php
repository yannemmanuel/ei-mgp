<?php

use App\Models\AuditLog;

it('refuses to update an audit log entry, even for an internal caller (append-only, CDC §15)', function () {
    $log = AuditLog::factory()->create();

    expect(fn () => $log->update(['action' => 'tampered']))->toThrow(LogicException::class);
});

it('refuses to delete an audit log entry (append-only, CDC §15)', function () {
    $log = AuditLog::factory()->create();

    expect(fn () => $log->delete())->toThrow(LogicException::class);

    expect(AuditLog::whereKey($log->id)->exists())->toBeTrue();
});

it('has no updated_at column tracked by Eloquent', function () {
    expect(AuditLog::UPDATED_AT)->toBeNull();
});
