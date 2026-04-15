# @grove/plugin-api

TypeScript contract for Grove plugins.

This package defines manifest, capability, permission, activation, and provider types for plugin authors and host-side validation code. Plugins may also import `SyncProvider` from this package, which re-exports the shared storage-agnostic contract from `@grove/core`.

The package intentionally has no runtime host implementation. `definePlugin()` is a typed identity helper that preserves plugin definitions while keeping activation behavior owned by the host app.
