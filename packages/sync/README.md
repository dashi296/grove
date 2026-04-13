# Sync Package Design

## 概要

`packages/sync` は Grove の同期エンジンです。
暗号化、差分計算、競合解決、キュー制御を担当し、具体的なストレージ実装には依存しません。

このパッケージは `packages/core` の `SyncProvider` 契約と host 抽象を使います。
Cloudflare R2 や iCloud Drive のような同期実装は `plugins/*` 側に置きます。iCloud は通常のクラウド API ではなくプラットフォームのフォルダ共有方式で扱うため、`sync-icloud` プラグインが host 側の workspace file provider 抽象を利用します。

## 責務

- ノートデータの暗号化と復号
- ローカル状態とリモート状態の差分計算
- 同期キューの実行
- 競合検出と競合解決戦略
- `SyncProvider` 経由での upload / download / list / delete 実行
- `WorkspaceIO` または同期入力スナップショット経由でローカルノート実体へアクセス

## 責務外

- ストレージ API 固有実装
- SQLite の直接参照
- workspace の正本管理
- UI 表示

## 依存ルール

許可:

- `packages/sync` -> `packages/core`
- `apps/*` -> `packages/sync`

禁止:

- `packages/sync` -> `packages/db` を原則禁止
- `packages/sync` -> `plugins/*`
- `plugins/*` -> `packages/sync`

## 基本方針

- 同期対象はファイル正本から得たノート群
- SQLite を同期の正本にしない
- `SyncProvider` に渡すデータは常に暗号化済みバイト列
- 同期は UI をブロックしない
- 同期はデフォルト無効

## 想定ディレクトリ構成

```text
packages/sync/
├── README.md
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── engine/
    │   ├── runSync.ts
    │   ├── buildPlan.ts
    │   ├── applyRemoteChanges.ts
    │   └── conflictResolution.ts
    ├── inputs/
    │   ├── workspaceIoSource.ts
    │   ├── snapshotSource.ts
    │   └── types.ts
    ├── crypto/
    │   ├── encrypt.ts
    │   ├── decrypt.ts
    │   ├── keyDerivation.ts
    │   └── types.ts
    ├── diff/
    │   ├── compareEntries.ts
    │   ├── buildLocalSnapshot.ts
    │   └── buildRemoteSnapshot.ts
    ├── queue/
    │   ├── syncQueue.ts
    │   └── retryPolicy.ts
    ├── errors/
    │   └── sync-error.ts
    └── types/
        └── sync.ts
```

## 同期入出力モデル

入力:

- `WorkspaceIO` または app 層が収集した同期入力スナップショット
- `SyncProvider`
- 秘密鍵または暗号化コンテキスト

同期入力スナップショットの最小例:

- `path`
- `hash`
- `updatedAt`
- `bytes`

出力:

- upload / download / delete 実行結果
- 競合情報
- 同期状態サマリ

## app 層との境界

app 層は以下を担当します。

- `WorkspaceIO` 実装の提供、または同期入力スナップショットの構築
- ローカルファイル読み書き
- 秘密鍵へのアクセス
- 同期状態 UI

`packages/sync` は以下を担当します。

- どのファイルを同期するかの判断
- 暗号化して provider に送る処理
- リモート状態との差分評価

`packages/sync` がファイル一覧だけを受け取る設計にはしません。
暗号化 upload には実体バイト列が必要なため、以下のどちらかを必須にします。

- `WorkspaceIO` を受け取り必要時に read する
- app 層が `{ path, hash, updatedAt, bytes }` を揃えた同期入力を渡す

## 競合方針

初期段階では最小限の競合モデルにします。

- ローカル更新時刻とハッシュ
- リモート更新時刻とハッシュ
- 明確に同時編集と判断した場合のみ競合扱い
- 自動解決不能な場合は app 層へ競合情報を返す

## 実装優先度

### Phase 1

- `WorkspaceIO` または snapshot 入力で動く最小同期
- 暗号化
- upload / download 基本フロー

### Phase 2

- 差分計算
- delete と tombstone
- 競合検出

### Phase 3

- リトライポリシー
- バックグラウンド同期最適化
- 部分同期や大規模 workspace 対応
