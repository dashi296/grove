# Core Package Design

## 概要

`packages/core` は Grove 全体のドメイン中核です。
ここには、アプリやストレージ実装に依存しない型、契約、純粋関数、ドメインルールを置きます。

`core` は依存の中心ですが、下位実装に依存しません。
SQLite、同期実装、OS API、Tauri、React Native の詳細はここへ入れません。

## 責務

- `Note`、`Tag`、`NoteLink` などのドメイン型定義
- WikiLink 解析とリンク解決ルールの定義
- プラグイン API と manifest 契約
- `SyncProvider` のようなインターフェース定義
- `VaultIO` や `PluginHostServices` のような app-host 境界インターフェース定義
- ノートタイトル抽出、タグ抽出、リンク抽出などの純粋関数
- アプリ全体で共有するバリデーションとエラー型

## 責務外

- SQLite schema と migration
- FTS の実装詳細
- 暗号化アルゴリズム実装
- 同期キューやリトライ処理
- Tauri command や React Native native module
- OS キーチェーンやファイル I/O

## 依存ルール

許可:

- `packages/db` -> `packages/core`
- `packages/sync` -> `packages/core`
- `packages/editor` -> `packages/core`
- `apps/*` -> `packages/core`
- `plugins/*` -> `packages/core`

禁止:

- `packages/core` -> `packages/db`
- `packages/core` -> `packages/sync`
- `packages/core` -> `apps/*`
- `packages/core` -> `plugins/*`

## 想定ディレクトリ構成

```text
packages/core/
├── README.md
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types/
    │   ├── note.ts
    │   ├── tag.ts
    │   ├── link.ts
    │   └── plugin.ts
    ├── note/
    │   ├── parseTitle.ts
    │   ├── parseTags.ts
    │   ├── parseWikiLinks.ts
    │   ├── resolveWikiLinks.ts
    │   └── normalizeNote.ts
    ├── plugins/
    │   ├── manifest.ts
    │   ├── lifecycle.ts
    │   ├── host-services.ts
    │   ├── errors.ts
    │   └── types.ts
    ├── sync/
    │   ├── types.ts
    │   └── provider.ts
    ├── host/
    │   ├── vault-io.ts
    │   └── plugin-host-services.ts
    ├── errors/
    │   └── domain-error.ts
    └── utils/
        ├── assertNever.ts
        └── date.ts
```

## WikiLink の位置付け

WikiLink はプラグインではなくコア責務です。
理由は、ノート間リンクが検索、バックリンク、リネーム追従、将来のグラフ表示など複数機能の前提になるためです。

`core` が持つべき最低限の能力:

- `[[Title]]` と `[[Title|Alias]]` の解析
- 生文字列のリンクターゲット抽出
- ノート一覧を使った純粋なリンク解決
- バックリンクの元になる `NoteLink` データ生成

`core` の `LinkResolver` は純粋関数として定義します。
`packages/db` はその解決ルールを呼び出して index を更新する orchestration を担当し、独自の解決ロジックは持ちません。

## app-host 境界

`core` には host 依存を隔離するための抽象を置きます。

- `VaultIO`
  - app が提供する file `list/read/write/delete/watch` 抽象
- `PluginHostServices`
  - settings、secrets、network、必要に応じた platform file provider などを host 経由で提供する抽象
- `LinkResolver`
  - ノート集合を受け取り、WikiLink 解決結果を返す純粋関数

## 公開 API 方針

`core` はなるべく小さい Public API を提供します。
外部からは `index.ts` だけを参照し、内部パス import は原則避けます。

公開する代表例:

- ドメイン型
- WikiLink 解析関数
- `LinkResolver`
- `VaultIO`
- `PluginHostServices`
- プラグイン定義関数
- `SyncProvider` 型

## テスト方針

- ドメインルールは `core` 単体でテストできるようにする
- 入出力が明確な純粋関数を優先する
- WikiLink 解析、リンク解決、manifest validation は重点テスト対象

## 実装優先度

### Phase 1

- ノート型
- WikiLink 解析
- プラグイン型

### Phase 2

- リンク解決
- タグ解析
- 共有エラー型

### Phase 3

- より厳密な manifest validation
- 将来機能向けのドメイン補助関数拡充
