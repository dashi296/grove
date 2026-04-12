# Editor Package Design

## 概要

`packages/editor` は Grove のエディタ抽象化層です。
デスクトップでは CodeMirror 6 ラッパーを主軸にしつつ、モバイルでは必要に応じて異なる描画実装を許容します。

重要なのは、描画実装を共通化することではなく、エディタの操作意図と契約を揃えることです。

## 責務

- エディタに必要な共通 command surface の定義
- デスクトップ向け CodeMirror 6 ラッパー
- Markdown 編集に必要な最小ユーティリティ
- `apps/desktop` と `apps/mobile` が使える共通 props / event 契約

## 責務外

- ノート保存
- WikiLink 解析そのもの
- app 固有のツールバー UI
- モバイルネイティブブリッジ

## 依存ルール

許可:

- `packages/editor` -> `packages/core`
- `apps/*` -> `packages/editor`

禁止:

- `packages/editor` -> `packages/db`
- `packages/editor` -> `packages/sync`
- `packages/editor` -> `apps/*`

## 基本方針

- デスクトップは CodeMirror 6 を前提に設計
- モバイルは無理に CodeMirror を再利用しない
- ただし editor command や event 契約はなるべく共通化する

## 想定ディレクトリ構成

```text
packages/editor/
├── README.md
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types/
    │   ├── editor.ts
    │   └── commands.ts
    ├── commands/
    │   ├── insertWikiLink.ts
    │   ├── toggleBold.ts
    │   └── toggleHeading.ts
    ├── desktop/
    │   ├── CodeMirrorEditor.tsx
    │   ├── extensions.ts
    │   └── keymap.ts
    ├── mobile/
    │   ├── MobileEditorAdapter.ts
    │   └── inputCommands.ts
    └── markdown/
        ├── selection.ts
        └── formatting.ts
```

## app との境界

`editor` が返すもの:

- テキスト変更イベント
- 選択範囲変更イベント
- command 実行インターフェース

app 側が持つもの:

- 保存タイミング
- ノート切り替え
- ツールバー配置
- プラグイン連携 UI

## 実装優先度

### Phase 1

- デスクトップ CodeMirror ラッパー
- 基本 command surface

### Phase 2

- モバイル向け adapter
- Markdown 操作用 command

### Phase 3

- WikiLink 補完 UI 用 hooks
- 将来のプラグイン拡張点整理
