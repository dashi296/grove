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
- Tauri のフロントエンドビルドに Vite を使用
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
│   │   ├── providers/
│   │   │   ├── RouterProvider.tsx
│   │   │   ├── QueryProvider.tsx
│   │   │   └── ThemeProvider.tsx
│   │   └── routes/
│   │       ├── index.tsx
│   │       ├── editor.tsx
│   │       ├── settings.tsx
│   │       └── plugins.tsx
│   ├── pages/
│   │   ├── editor/
│   │   │   └── EditorPage.tsx
│   │   ├── settings/
│   │   │   └── SettingsPage.tsx
│   │   └── plugins/
│   │       └── PluginsPage.tsx
│   ├── features/
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
│   ├── shared/
│   │   ├── api/
│   │   │   ├── tauri.ts
│   │   │   ├── commands.ts
│   │   │   └── errors.ts
│   │   ├── config/
│   │   ├── lib/
│   │   ├── model/
│   │   ├── ui/
│   │   └── styles/
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

- `src/app` はルーティング、Provider、トップレベル初期化のみを置く
- `src/pages` は `features`、`entities`、`shared` を組み合わせて画面を構成する
- `src/features` はノートを開く、タブを移動する、プラグインを導入する、Workspace を選ぶといったユーザー操作単位を置く
- `src/entities` は `Note`、`Tag`、`Plugin` などのドメイン単位の UI モジュールを置く
- `src/shared` は低レベル UI、ラッパー、アダプタ、スキーマ、ユーティリティを置く
- ペイン枠やサイドバーのような大きな画面部品は、画面固有なら `src/pages` 配下、操作単位として再利用するなら `src/features` 配下に置く
- `src-tauri` では同期ポリシーや Markdown ドメインロジックを持たず、ネイティブ機能の公開だけを担当する

## ルーティング方針

初期ルート:

- `/` は `/editor` にリダイレクト
- `/editor` はメインのノート編集ワークスペース
- `/settings` はアプリ設定
- `/plugins` はプラグインストアとインストール済みプラグイン管理

Workspace 切り替えや競合解決のようなモーダル中心のフローは、深い URL が必要になるまではページ状態で扱います。

## デスクトップの状態設計

主要な Zustand ストア:

- `useNoteStore`: ペイン、タブ、アクティブノート状態
- `useWorkspaceStore`: 選択中 workspace とワークスペース設定
- `usePluginStore`: インストール済みプラグインと関連 UI 状態
- `useUiStore`: モーダル、サイドバー、コマンドパレット状態

Query 境界:

- プラグインカタログ取得
- プラグインのダウンロードとインストール進捗
- ノートインデックス再構築トリガー
- バックグラウンド同期状態のポーリング

## ネイティブ command 境界

フロントエンドは `src/shared/api/commands.ts` の小さく型付けされた command 層だけを呼びます。
生の `invoke()` をアプリ全体に散らさない方針です。

ルーティングは `@tanstack/react-router` を前提にし、ページとデータ境界を型付きで扱います。
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
