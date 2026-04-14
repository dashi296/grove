# Desktop App Design

## 概要

`apps/desktop` は macOS / Windows / Linux 向けの Tauri v2 デスクトップアプリです。
役割は、ローカル Markdown ノートの編集、ローカル検索、プラグイン管理 UI、ファイルシステムや OS キーチェーンのようなデスクトップ固有機能との接続です。

デスクトップアプリ本体は薄く保ちます。
ドメインルール、同期ロジック、プラグイン契約、ノート解析は `packages/core`、`packages/sync`、`packages/db`、`packages/editor` に置きます。

## 技術選定

### ランタイムと UI

- Tauri v2
- React 19
- TypeScript `strict: true`
- Tauri のフロントエンドは Vite + React で構成する
- ローカル UI 状態管理に Zustand
- 非同期境界にのみ TanStack Query を使用

### エディタとデータ

- `packages/editor` を CodeMirror 6 ラッパーとして利用
- `packages/core` をノート型、解析、プラグイン契約、アプリケーションサービスの配置先とする
- `packages/db` を SQLite アクセスとマイグレーションの窓口とする
- `packages/sync` を暗号化と同期オーケストレーションの配置先とする

### デスクトップ固有のネイティブ層

- ファイル I/O、ファイル監視、キーチェーン連携、OS 統合に Rust を使用
- Web UI とネイティブ機能の境界は Tauri command のみに限定
- 内部エラーは `anyhow::Result`、command 境界ではシリアライズ可能なアプリケーションエラーへ変換

### 初期実装で採用するライブラリ

- `@tauri-apps/api`
- `@tanstack/react-router`
- `zustand`
- `@tanstack/react-query`
- `valibot`

## 責務境界

デスクトップが持つ責務:

- ウィンドウレイアウト、ペイン、タブ、ダイアログ、キーボードショートカット
- Workspace 選択と Tauri 経由のローカルファイルシステム操作
- 検索 UI とノート一覧 UI
- プラグインストアとプラグイン設定 UI
- フロントエンドから Rust command への橋渡し

デスクトップが持たない責務:

- Markdown 解析ルール
- 同期競合解決
- 暗号化実装
- ストレージプロバイダ固有の同期処理
- プラグイン manifest スキーマ定義

## 初期ディレクトリ構成

```text
apps/desktop/
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   └── routes/
│   │       ├── __root.tsx
│   │       └── index.tsx
│   ├── features/
│   │   ├── folder-navigation/
│   │   ├── note-open/
│   │   ├── note-search/
│   │   ├── note-tabs/
│   │   ├── pane-layout/
│   │   ├── plugin-install/
│   │   └── workspace-picker/
│   ├── entities/
│   │   ├── note/
│   │   ├── tag/
│   │   └── plugin/
│   ├── shadcn/
│   ├── shared/
│   │   └── ui/
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        ├── main.rs
        ├── commands/
        │   ├── file_system.rs
        │   ├── workspace.rs
        │   ├── keychain.rs
        │   └── search.rs
        ├── services/
        │   ├── file_store.rs
        │   ├── file_watcher.rs
        │   ├── keychain.rs
        │   └── sqlite.rs
        ├── errors.rs
        └── state.rs
```

## 構成ルール

- `src/app` はアプリ共通 shell、TanStack Router の route file、トップレベル初期化のみを置く
- `src/features` はノートを開く、タブを移動する、プラグインを導入する、Workspace を選ぶといったユーザー操作単位を置く
- `src/entities` は `Note`、`Tag`、`Plugin` などのドメイン単位の UI モジュールを置く
- `src/shared` は低レベル UI、ラッパー、アダプタ、スキーマ、ユーティリティを置く
- `src/shadcn` は shadcn/ui 由来の primitive の配置先に限定し、Grove 固有 UI は `src/shared/ui` に置く
- `src-tauri` では同期ポリシーや Markdown ドメインロジックを持たず、ネイティブ機能の公開だけを担当する

## デスクトップの状態設計

主要な Zustand ストア:

- `useNoteStore`: ペイン、タブ、アクティブノート状態
- `useWorkspaceStore`: 選択中 workspace とワークスペース設定
- `usePluginStore`: インストール済みプラグインと関連 UI 状態
- `useUiStore`: モーダル、サイドバー、コマンドパレット状態

フォルダナビゲーションの UI 状態:

- `selectedFolderPath`: note list の現在スコープ。workspace root は `null` で表す
- `expandedFolderPaths`: サイドバー tree の展開状態。workspace 相対 path の配列として保持する
- `isSidebarCollapsed`: サイドバー全体の表示状態
- `noteListSort`: フォルダ選択中の note list 並び順

フォルダ path は workspace 相対 path として保持し、React state に絶対 path を入れません。
path の正規化、rename、move、ファイルシステム上の整合性は `packages/core` と Tauri command 境界の責務に寄せます。

Query 境界:

- プラグインカタログ取得
- プラグインのダウンロードとインストール進捗
- ノートインデックス再構築トリガー
- バックグラウンド同期状態のポーリング
- フォルダ別 note list と folder tree の再取得

## フォルダナビゲーション

desktop は広い画面を前提に、左サイドバーの folder tree、中央の note list、右側の editor pane area を基本形にします。
mobile の bottom tab / stack navigation とは分け、desktop ではフォルダ選択を note list のスコープ変更として扱います。

### サイドバー

- workspace root は固定項目として表示し、全ノートへの入口にする
- root 配下に workspace 相対 path の folder tree を表示する
- folder node は開閉可能にし、展開状態は workspace ごとに保持する
- 未選択時は workspace root を選択した状態と同じ扱いにする
- 空フォルダも表示する。移動や作成直後にノートがなくても場所の存在を失わせないため
- フォルダ名の横には直接配下と子孫を含む note count を表示する
- search、settings、plugin store は folder tree とは別の navigation group として扱う

### 選択と note list

- folder を選択すると note list はその folder と子孫 folder のノートに絞り込む
- workspace root を選択すると全ノートを表示する
- note list の search box は現在選択中の folder scope を初期条件にする
- 検索結果から note を開いても、現在の folder 選択は維持する
- folder scope 内にノートがない場合は、そのフォルダで新規ノートを作る導線を出す
- workspace 全体にノートがない場合は、workspace 選択後の初期作成導線を出す
- folder がファイルシステム変更で消えた場合は root scope に戻し、note list を再取得する

### ペインとタブとの関係

- フォルダ選択は `useNoteStore.panes` を直接変更しない
- note list で note を選ぶと `openNoteInActivePane()` を呼び、現在の active pane に開く
- 修飾キーや context menu の「新しいペインで開く」は `openNoteInNewPane()` を使う
- 既に開いている note を別 folder scope から選んだ場合も、既存 tab の重複制御は `useNoteStore` に任せる
- active note が現在の folder scope 外にあっても閉じない。フォルダ選択は閲覧スコープであり、開いている作業対象を破棄しないため
- tab の drag and drop は `moveTabToPane()` と `reorderTabs()` の範囲で扱い、folder tree への drag and drop move は別 issue に分ける

### 後続実装スライス

1. `packages/core` に workspace 相対 folder path と note path の semantics を定義する
2. Tauri command 境界に folder tree と folder-scoped note list の取得 API を追加する
3. `src/features/folder-navigation/` に folder tree、選択状態、空状態を実装する
4. `src/features/note-open/` と note list から `openNoteInActivePane()` / `openNoteInNewPane()` を呼び分ける
5. `src/features/note-search/` に selected folder scope を渡す
6. folder 削除、rename、move による stale selection を root scope へ戻す処理を追加する
7. component test で選択、展開、空状態、既存 tab の重複回避を確認する

## ネイティブ command 境界

フロントエンドは `src/shared/api/commands.ts` の小さく型付けされた command 層だけを呼びます。
生の `invoke()` をアプリ全体に散らさない方針です。

フロントエンドは Vite + React + TanStack Router の単純な SPA shell から始め、必要な画面分割は後続 issue で追加します。
ネイティブ応答や設定値の runtime validation には `valibot` を使います。

初期 command グループ:

- Workspace 管理
- ファイル読み書き
- ファイル監視購読
- SQLite インデックス更新
- 秘密情報の保存と取得
- システムダイアログの起動

## 実装優先度

### Phase 1

- Tauri シェル
- React アプリ初期化
- Workspace 選択
- ローカルファイル読み書き
- 単一ペインのノート編集画面

### Phase 2

- タブとペインのモデル
- SQLite ベースのローカル検索
- WikiLink 解析とバックリンク

### Phase 3

- プラグインストア UI
- 同期状態 UI
- ショートカットやネイティブメニューなどのデスクトップ仕上げ

## 未確定事項

- 全 OS でカスタムタイトルバーを使うか、必要な環境だけに限定するか
- ファイル監視の debounce を Rust 側で持つか React 境界で持つか
- コマンドパレットを v0.1 に入れるか、編集体験安定後に回すか

## 検証手順

依存解決と shell 構成の確認は monorepo ルートから行います。

```bash
pnpm install
pnpm typecheck
pnpm dev:desktop
```

確認ポイント:

- `@grove/core` の public export を desktop 側から import できること
- desktop shell が起動し、Grove branding の最小画面が表示されること
- `apps/desktop/src/app/routes` を route file の入口にしつつ、UI 共通部品が `shared/ui` に分かれていること
