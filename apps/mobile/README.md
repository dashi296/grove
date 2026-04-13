# Mobile App Design

## 概要

`apps/mobile` は iOS / Android 向けの React Native モバイルアプリです。
デスクトップ UI の移植ではなく、モバイル前提で設計します。
Grove のローカルファースト前提を維持しつつ、素早いメモ追加、閲覧、軽量編集、断続的なネットワーク環境に合う体験を重視します。

ドメインパッケージはデスクトップと共有しますが、画面遷移、エディタ UI、ファイルアクセスの橋渡しはモバイル専用に設計します。

## 技術選定

### ランタイムと UI

- React Native 0.76
- Expo Bare workflow
- TypeScript `strict: true`
- 画面遷移に Expo Router
- ローカル UI 状態管理に Zustand
- 非同期境界にのみ TanStack Query を使用
- スタイリングに NativeWind

### 共有パッケージ

- `packages/core` をノート型、解析、プラグイン契約、共有サービスの配置先とする
- `packages/editor` をエディタ抽象化層とし、CodeMirror が不適な場合はモバイル用アダプタを用意する
- `packages/db` を SQLite スキーマとクエリの窓口とする
- `packages/sync` を暗号化と同期オーケストレーションの配置先とする

### ネイティブと Expo Modules

- ファイルシステムや鍵保存で managed workflow の制約を超えるため Expo Bare を採用
- 鍵保存は iOS Keychain / Android Keystore を使用
- SQLite アクセスは単一の共有アダプタ境界に閉じ込める
- 共有シートやファイル取り込みはサービスインターフェース越しに扱う

### 初期実装で採用するライブラリ

- `expo-router`
- `zustand`
- `@tanstack/react-query`
- `nativewind`
- `valibot`

## 責務境界

モバイルが持つ責務:

- モバイル前提のナビゲーションとレイアウト
- クイックキャプチャ導線
- ノート一覧、検索、編集画面
- バックグラウンド同期トリガーのようなアプリライフサイクル処理
- 共有・取り込みのエントリポイント

モバイルが持たない責務:

- 同期エンジンのルール
- 暗号化実装
- プラグインスキーマ定義
- Markdown リンク解析ルール

## スタイリング方針

- レイアウト、余白、色、タイポグラフィの基本は `NativeWind` の utility class で構成する
- 色、spacing、radius、font size のようなデザイントークンは `shared/styles` に集約し、画面ごとに値をベタ書きしない
- `shared/ui` の共通コンポーネントは `NativeWind` を前提にしつつ、バリアントが増える箇所だけ薄いラッパーで整理する
- `StyleSheet` はアニメーション、キーボード回避、描画最適化など React Native 固有の都合がある場合に限定して併用する
- 画面側では route file に過剰な実装を持ち込まず、再利用可能な UI と振る舞いは `features`、`entities`、`shared` に分割する

## 初期ディレクトリ構成

```text
apps/mobile/
├── README.md
├── package.json
├── tsconfig.json
├── babel.config.js
├── metro.config.js
├── nativewind-env.d.ts
├── android/
├── ios/
├── app/
│   ├── _layout.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── search.tsx
│   │   └── settings.tsx
│   ├── note/
│   │   └── [noteId].tsx
│   ├── plugins/
│   │   └── index.tsx
│   └── workspace/
│       └── select.tsx
├── app.providers/
│   ├── QueryProvider.tsx
│   └── SafeAreaProvider.tsx
├── features/
│   ├── note-capture/
│   ├── note-search/
│   ├── note-edit/
│   ├── workspace-switch/
│   ├── sync-status/
│   └── plugin-install/
├── entities/
│   ├── note/
│   ├── tag/
│   └── plugin/
├── shared/
│   ├── api/
│   │   ├── native.ts
│   │   ├── storage.ts
│   │   └── errors.ts
│   ├── config/
│   ├── lib/
│   ├── model/
│   ├── ui/
│   └── styles/
└── modules/
    ├── file-access/
    ├── secure-storage/
    └── sqlite/
```

## 構成ルール

- `app` は Expo Router のファイルベースルーティング境界であり、route file と screen composition を担う
- `app.providers` は Router 外側で共有する Provider を置く
- `features` はキャプチャ、検索、編集、プラグイン導入、workspace 切り替えのような操作単位を置く
- `entities` はドメイン単位の表示モジュールを置く
- `shared` はアダプタ、デザイントークン、バリデーション、低レベル UI、汎用ユーティリティを置く
- tabs や stack 設定のようなルーティング定義は `app` 配下に置き、route file が重くなりそうな場合でも分解先は `features`、`entities`、`shared` を優先する
- `modules` はカスタムネイティブブリッジや Expo module ラッパーの唯一の配置先とする

## ナビゲーション方針

初期構成:

- Expo Router の root stack で起動、workspace 選択、メインアプリを管理する
- `(tabs)` グループで Notes、Search、Settings の bottom tabs を構成する
- ノート編集画面は `app/note/[noteId].tsx` へ push する
- プラグイン管理は Settings から `app/plugins/index.tsx` へ遷移する

これにより、日常的なメモ追加と閲覧の導線を浅く保ちつつ、取り込みや同期トラブルのような補助フローはモーダルや別画面で扱えます。

## モバイル UX 方針

想定する主な利用形態:

- ユーザーは短時間でメモを追加または編集する
- 画面領域が狭いため、デスクトップのような複数ペインは持ち込まない
- タブ編集より、単一のアクティブノート画面を優先する
- バックグラウンド同期は補助的に動作し、編集をブロックしない

想定するモバイル専用機能:

- ノート一覧からすぐに入れるクイックキャプチャ
- Markdown 操作に寄せたコンパクトなツールバー
- 既存ノートへ戻りやすい検索中心の導線
- 将来的な共有シート経由の取り込み

## 状態設計

主要な Zustand ストア:

- `useWorkspaceStore`: アクティブ workspace、オンボーディング状態、アプリ設定
- `useEditorStore`: 現在のノート、下書き状態、エディタ表示状態
- `usePluginStore`: インストール済みプラグインと設定状態
- `useUiStore`: トースト、シート、一時的な UI 状態

Query 境界:

- プラグインカタログ取得
- 同期状態の更新
- バックグラウンドインデックス更新
- 取り込みや共有処理の進捗

## ネイティブ境界

JavaScript 側は `shared/api` と `modules` の型付きラッパー経由でのみネイティブ機能へアクセスします。
feature 層に生のプラットフォーム分岐を散らさない方針です。

初期ネイティブ関心事:

- 選択中 workspace 配下のファイル読み書き
- 安全な鍵保存
- SQLite アクセス
- 同期スケジューリングのためのライフサイクルイベント
- ドキュメントピッカーと共有取り込み

## エディタ方針

モバイルはデスクトップのエディタ前提をそのまま引き継ぎません。
もし共有の `packages/editor` 抽象化で良い編集体験を出せない場合は、コマンド面を揃えたままモバイル専用の編集実装を使います。

この方針により:

- Markdown コマンドや解析ロジックは共有できる
- ツールバー操作は共有されたエディタ意図にマッピングできる
- 実際の編集 UI はデスクトップと異なってよい

## 実装優先度

### Phase 1

- Expo Bare アプリ初期化
- workspace セットアップとローカル保存ブリッジ
- ノート一覧と単一ノート編集フロー

### Phase 2

- ローカル検索
- WikiLink 対応
- バックグラウンド同期状態の統合

### Phase 3

- プラグイン管理 UI
- クイックキャプチャの改善
- 共有と取り込み導線

## 未確定事項

- ファイルアクセスを完全共通モジュールで吸収するか、内部的には iOS / Android アダプタを分けるか
- モバイルのプラグイン導入をアプリ内ダウンロードで完結させるか、共有サービスへ寄せるか
- 初期エディタをまずプレーンテキスト寄りで出すか、最初からリッチな Markdown 操作を入れるか
