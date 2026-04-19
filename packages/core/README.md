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
- `WorkspaceIO` や `PluginHostServices` のような app-host 境界インターフェース定義
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
    │   ├── workspace-io.ts
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

## フォルダ path semantics

フォルダ階層は `Note.filePath` から導出します。
`Note` に独立した `folderId` や親子関係の正本は持たせず、Markdown ファイルの workspace 相対 path を正本にします。

公開型:

- `NoteFilePath`: workspace 相対の Markdown ファイル path
- `FolderPath`: workspace 相対の folder path
- `FolderScope`: `FolderPath | null`
- `FolderTreeNode`: folder tree 表示や scoped note list の入力に使う派生構造

path の不変条件:

- separator は `/` に正規化する
- 絶対 path と Windows drive prefix は許可しない
- `.` と `..` segment は許可しない
- workspace root の folder scope は `null` で表す
- note file path は `.md` / `.MD` など Markdown 拡張子を必須にする

move / rename semantics:

- note move は note file name を維持し、target `FolderScope` へ path prefix を付け替える
- folder rename は対象 folder 配下の note path prefix だけを置き換える
- root への移動や rename は target `FolderScope` を `null` にする
- folder tree と note count は `NoteFilePath[]` と必要に応じた明示的な空 folder list から再構築する

path 変更後の一貫性:

- file I/O は app-host の責務とし、`core` は path 変換と検証だけを提供する
- note move / folder rename が成功したら、app は `Note.filePath` と明示的な空 folder list を同じ変更単位で更新する
- SQLite index は Markdown ファイルの正本から再構築できる派生状態として扱い、path 変更後に `packages/db` の Public API 経由で更新する
- watcher や index 更新が途中失敗しても Markdown ファイルを正本とし、次回 scan で index を再同期できる状態を維持する
- folder tree、scoped note list、note count は保存せず、更新後の path 集合から再導出する

## ノートタイトルと rename semantics

ノートタイトルは次の優先順位で導出します。

1. frontmatter の `title`
2. 最初の Markdown H1 (`# Title`)
3. file stem (`Project Plan.md` -> `Project Plan`)

この優先順位は `packages/core` の pure helper が定義し、desktop の scan/save metadata も同じルールに合わせます。

title の変更ルール:

- frontmatter `title` を編集した場合は metadata change として扱い、file path は変えない
- H1 を編集した場合も metadata change として扱い、file path は変えない
- frontmatter と H1 がないノートでは file stem がタイトルの正本なので、表示タイトルを変えるには Markdown file path を rename する
- file rename は既存の path semantics に従って collision を検証し、他ノートを silent overwrite しない

この境界により、ローカル Markdown ファイルと UI の title 表示が一貫し、明示タイトルを持つノートと file-name-driven なノートの振る舞いを分けて扱えます。

リンク、タグ、その他 metadata は folder 階層の正本ではありません。
folder path 変更後は `packages/db` が `core` の path semantics と WikiLink 解決ルールを呼び、SQLite index を再構築または更新します。

## app-host 境界

`core` には host 依存を隔離するための抽象を置きます。

- `WorkspaceIO`
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
- `WorkspaceIO`
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
