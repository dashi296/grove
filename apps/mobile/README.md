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
- 初期段階では Expo Router を採用せず、React Navigation で明示的に構成する
- 画面遷移に React Navigation
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

- `@react-navigation/native`
- `@react-navigation/native-stack`
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
│   ├── App.tsx
│   ├── providers/
│   │   ├── NavigationProvider.tsx
│   │   ├── QueryProvider.tsx
│   │   └── SafeAreaProvider.tsx
│   └── navigation/
│       ├── RootNavigator.tsx
│       ├── MainTabs.tsx
│       └── types.ts
├── pages/
│   ├── inbox/
│   │   └── InboxPage.tsx
│   ├── note/
│   │   └── NotePage.tsx
│   ├── search/
│   │   └── SearchPage.tsx
│   ├── settings/
│   │   └── SettingsPage.tsx
│   └── plugins/
│       └── PluginsPage.tsx
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

- `app` はモバイルのブートストラップ層で、Provider とナビゲーション設定だけを置く
- `pages` はナビゲーション単位のトップレベル画面を置く
- `features` はキャプチャ、検索、編集、プラグイン導入、workspace 切り替えのような操作単位を置く
- `entities` はドメイン単位の表示モジュールを置く
- `shared` はアダプタ、デザイントークン、バリデーション、低レベル UI、汎用ユーティリティを置く
- bottom tab のようなナビゲーション部品は `app` 配下、ノート一覧や同期バナーのような大きめの UI は責務に応じて `pages`、`features`、`entities` に置く
- `modules` はカスタムネイティブブリッジや Expo module ラッパーの唯一の配置先とする

## ナビゲーション方針

初期構成:

- 起動、workspace 選択、メインアプリを持つ root stack
- Notes、Search、Settings を持つ bottom tabs
- ノート編集画面は Notes または Search から stack push
- プラグイン管理は Settings 配下から遷移

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
