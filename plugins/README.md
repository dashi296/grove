# Plugins Layer Design

## 概要

`plugins/` は Grove の拡張層です。
同期バックエンドや AI 機能のように、本体がなくても成立する追加機能をここへ分離します。

プラグインは `packages/core` の Public API のみを利用します。
アプリ固有コードや SQLite 実装、同期エンジン内部には直接依存しません。
必要な host 機能は `PluginHostServices` のような host 抽象経由で受け取ります。

## 責務

- `SyncProvider` 実装
- AI 機能の実装
- プラグイン manifest の提供
- インストール単位の独立した拡張機能提供

## 責務外

- ノート本体のドメイン定義
- WikiLink 解析
- SQLite 直接操作
- Tauri や React Native の内部 API への直アクセス

## 依存ルール

許可:

- `plugins/*` -> `packages/core`

禁止:

- `plugins/*` -> `packages/db`
- `plugins/*` -> `packages/sync`
- `plugins/*` -> `apps/*`
- `packages/core` -> `plugins/*`

## 想定ディレクトリ構成

```text
plugins/
├── README.md
├── sync-r2/
│   ├── package.json
│   ├── grove-plugin.json
│   └── src/
│       ├── index.ts
│       └── r2-provider.ts
└── ai/
    ├── package.json
    ├── grove-plugin.json
    └── src/
        ├── index.ts
        └── ai-service.ts
```

## プラグイン化するもの

- Cloudflare R2
- AI 機能
- 将来的な外部連携

保留または host 提供側で扱うもの:

- iCloud Drive
  - 通常の remote storage plugin ではなく、platform file provider として app host 側で扱う可能性が高い
  - `PluginHostServices` と host API の整理後に最終判断する

## プラグイン化しないもの

- WikiLink
- バックリンク
- ノート型
- ローカル検索
- SQLite index

これらは Grove の基本体験そのものであり、環境差で挙動が変わると困るためです。

## 実装優先度

### Phase 1

- manifest 仕様確定
- `SyncProvider` 実装プラグインの雛形

### Phase 2

- R2 プラグイン
- iCloud の host file provider 方針確定

### Phase 3

- AI プラグイン
- コミュニティプラグイン向けドキュメント
