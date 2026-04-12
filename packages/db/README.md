# DB Package Design

## 概要

`packages/db` は Grove の SQLite インデックス層です。
正本である Markdown ファイルから再構築可能な派生データを管理します。

このパッケージは保存の正本を持ちません。
ファイルを直接編集せず、ノート本文の authoritative source は常にローカルファイルです。

## 責務

- SQLite schema 定義
- migration 管理
- `notes`、`note_links`、`note_tags`、FTS テーブル管理
- ノートの再インデックス API
- ファイル削除や更新に追従する index 更新
- 検索と一覧取得のためのクエリ提供

## 責務外

- Markdown ファイル書き込み
- ノート本文の正本管理
- 同期実行
- 暗号化
- プラグインローディング

## 基本方針

- 正本は Markdown ファイル
- SQLite はキャッシュ兼インデックス
- SQLite が壊れてもファイルから復元可能
- 保存成功条件は「ファイル書き込み成功」
- SQLite 更新失敗時は dirty 状態を記録して再インデックスで回復する
- dirty 状態は DB 内だけに依存せず、sidecar state file でも保持できるようにする

## 依存ルール

許可:

- `packages/db` -> `packages/core`
- `apps/*` -> `packages/db`

禁止:

- `packages/db` -> `packages/sync`
- `packages/db` -> `apps/*`
- `plugins/*` -> `packages/db`

## 想定ディレクトリ構成

```text
packages/db/
├── README.md
├── package.json
├── tsconfig.json
├── migrations/
│   ├── 001_init.sql
│   ├── 002_add_note_links.sql
│   └── 003_add_fts.sql
└── src/
    ├── index.ts
    ├── schema/
    │   ├── notes.ts
    │   ├── noteLinks.ts
    │   ├── noteTags.ts
    │   └── fts.ts
    ├── migrations/
    │   └── runMigrations.ts
    ├── repositories/
    │   ├── noteRepository.ts
    │   ├── linkRepository.ts
    │   ├── tagRepository.ts
    │   └── searchRepository.ts
    ├── indexing/
    │   ├── indexNote.ts
    │   ├── reindexVault.ts
    │   ├── resolveLinks.ts
    │   └── markDirty.ts
    ├── recovery/
    │   ├── dirtyStateFile.ts
    │   └── shouldReindex.ts
    ├── queries/
    │   ├── listNotes.ts
    │   ├── getBacklinks.ts
    │   └── searchNotes.ts
    └── types/
        └── db.ts
```

## 主要テーブル

- `notes`
  - ノートのメタデータと必要なキャッシュ
- `note_links`
  - `source_note_id` と `target_note_id` を持つ中間テーブル
- `note_tags`
  - ノートとタグの関連
- `notes_fts`
  - 全文検索用インデックス
- `index_state`
  - dirty 状態や schema version の管理

## WikiLink の扱い

WikiLink は `notes` テーブルへ直接持たせず、`note_links` へ正規化します。
backlink は別テーブルにせず `target_note_id` の逆引きで取得します。
リンク解決ルールそのものは `packages/core` の `LinkResolver` に置き、`packages/db` は index 更新時にそれを呼び出します。

最低限必要な列:

- `source_note_id`
- `target_note_id`
- `raw_target`
- `alias`
- `position_start`
- `position_end`

## 保存フロー

1. app 層が Markdown ファイルを書き込む
2. `packages/core` でタイトル、タグ、WikiLink を抽出する
3. `packages/db` が `notes` と関連 index を upsert する
4. 失敗時は DB 内の `index_state` または sidecar state file に dirty を立てて再インデックス可能にする

## 再インデックスフロー

1. Vault 内の Markdown ファイル一覧を取得
2. 各ファイルを parse
3. `notes` を upsert
4. `note_links` をノート単位で再作成
5. 全ノート投入後にリンク解決
6. FTS を更新

## 復旧経路

SQLite が部分的に壊れている場合、DB 内の dirty 記録自体が失敗する可能性があります。
そのため復旧経路を DB の外にも持ちます。

- 第一経路: `index_state` テーブル
- 第二経路: Vault もしくは app 管理領域の sidecar state file
- 最終経路: 起動時の full reindex 判定

少なくとも一つは DB 非依存の復旧経路を持つ前提にします。

## 実装優先度

### Phase 1

- `notes` schema
- migration runner
- 単一ノート index 更新

### Phase 2

- `note_links`
- backlinks query
- FTS

### Phase 3

- dirty recovery
- vault 全再インデックス最適化
