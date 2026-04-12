# Architecture Layers

## 概要

Grove の依存関係は、`core` を中心にした一方向依存を原則とします。
各層は責務を明確に分け、正本管理、索引化、同期、UI、拡張を混ぜません。

## 依存関係図

```text
apps/desktop ─┬─> packages/core
              ├─> packages/db
              ├─> packages/sync
              └─> packages/editor

apps/mobile  ─┬─> packages/core
              ├─> packages/db
              ├─> packages/sync
              └─> packages/editor

plugins/*    ─────> packages/core

packages/db  ─────> packages/core
packages/sync─────> packages/core
packages/editor───> packages/core
```

app host 境界:

```text
apps/* ─────> VaultIO / PluginHostServices
packages/sync ──> VaultIO または同期入力 snapshot
packages/db ────> LinkResolver を使った index orchestration
plugins/* ──────> PluginHostServices
```

## 層ごとの役割

- `packages/core`
  - ドメイン、契約、純粋関数
- `packages/db`
  - SQLite index と migration
- `packages/sync`
  - 同期エンジンと暗号化
- `packages/editor`
  - エディタ抽象化
- `apps/*`
  - UI とネイティブ機能接続
- `plugins/*`
  - 追加機能

## 設計資料

- `apps/desktop`: [apps/desktop/README.md](/Users/shunokada/projects/grove/apps/desktop/README.md:1)
- `apps/mobile`: [apps/mobile/README.md](/Users/shunokada/projects/grove/apps/mobile/README.md:1)
- `packages/core`: [packages/core/README.md](/Users/shunokada/projects/grove/packages/core/README.md:1)
- `packages/db`: [packages/db/README.md](/Users/shunokada/projects/grove/packages/db/README.md:1)
- `packages/sync`: [packages/sync/README.md](/Users/shunokada/projects/grove/packages/sync/README.md:1)
- `packages/editor`: [packages/editor/README.md](/Users/shunokada/projects/grove/packages/editor/README.md:1)
- `plugins`: [plugins/README.md](/Users/shunokada/projects/grove/plugins/README.md:1)

## 注意点

- Markdown ファイルがノート本文の正本
- SQLite は再構築可能な派生 index
- WikiLink はコア機能でありプラグイン化しない
- `SyncProvider` 実装はプラグインへ置く
- `VaultIO`、`PluginHostServices`、`LinkResolver` を app-host 境界の基本抽象とする
