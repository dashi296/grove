# CLAUDE.md — Grove

Claude Codeがリポジトリを操作する際の指示書です。コーディング前に必ず読んでください。

---

## プロジェクト概要

**Grove** は Tauri（デスクトップ）+ React Native Expo Bare（モバイル）のモノレポ構成のパーソナルメモアプリです。ローカルファーストでMarkdownファイルを保存し、E2E暗号化クラウド同期をプラグインでサポートします。

---

## モノレポ構成

```
grove/
├── apps/
│   ├── desktop/      # Tauri v2 + React 19 + TypeScript
│   └── mobile/       # React Native 0.76 + Expo Bare
├── packages/
│   ├── core/         # Note CRUD・リンク解析・SyncProvider インターフェース定義
│   ├── editor/       # CodeMirror 6 ラッパー
│   ├── sync/         # 同期エンジン本体（暗号化・競合解決・差分計算）※ストレージ非依存
│   └── db/           # SQLiteスキーマ・マイグレーション
└── plugins/
    ├── sync-r2/      # Cloudflare R2（おすすめプラグイン・全環境）
    ├── sync-icloud/  # iCloud Drive（おすすめプラグイン・Apple環境のみ）
    └── ai/           # Claude APIプラグイン（v1.1以降）
```

ツール: **Turborepo** + **pnpm workspaces**

---

## コマンド

```bash
# 開発
pnpm dev:desktop      # Tauriデスクトップ起動
pnpm dev:mobile       # Expo開発サーバー起動

# ビルド
pnpm build:desktop    # Tauriビルド
pnpm build:mobile     # Expoビルド

# テスト・品質
pnpm test             # Vitest（全パッケージ）
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit（全パッケージ）

# DB
pnpm db:migrate       # SQLiteマイグレーション実行
pnpm db:reset         # 開発用DBリセット
```

---

## アーキテクチャ方針

### Feature Sliced Design（FSD）

各appは以下の層構造に従う。**上位層は下位層のみimportできる。逆方向は禁止。**

```
app/        # ルーティング・プロバイダ（最上位）
pages/      # ページコンポーネント
features/   # ユーザー操作単位の機能
entities/   # ドメインモデル（Note, Tag, Link）
shared/     # 汎用UI・ユーティリティ（最下位）
```

### ローカルファースト原則

- ノート本文の正本はローカルのMarkdownファイルとする
- SQLiteは検索・一覧・同期キューのためのインデックスとして使い、ファイル内容と整合するよう更新する
- 同期はバックグラウンドで行い、UIをブロックしない
- オフライン時も完全に動作すること

### プラグインAPI

- AI・同期バックエンドはすべて`plugins/`に分離し、コアに依存させない
- プラグインは`packages/core`のPublic APIのみ使用可能
- プラグインからRustコードを直接呼び出さない

### SyncProvider インターフェース

**コアはストレージを知らない。** `packages/sync/`の同期エンジンは`SyncProvider`インターフェースのみに依存し、R2・iCloud・Google Driveなどの具体実装を参照しない。

```typescript
// packages/core/src/sync.ts

export type SyncEntry = {
  path: string
  hash: string
  updatedAt: Date
  size: number
}

export interface SyncProvider {
  readonly id: string
  readonly name: string
  upload(path: string, data: Uint8Array): Promise<void>
  download(path: string): Promise<Uint8Array>
  list(prefix?: string): Promise<SyncEntry[]>
  delete(path: string): Promise<void>
  isAvailable(): Promise<boolean>
}

export function definePlugin(plugin: {
  id: string
  name: string
  provides: { syncProvider?: SyncProvider }
}): GrovePlugin { ... }
```

**暗号化は`packages/sync/`が担当する。** `SyncProvider`に渡すデータは常に暗号化済みバイト列。プラグインは暗号文しか触れないため、どのストレージを使っても平文は漏れない。

**同期はデフォルト無効。** R2・iCloudも同梱しない。プラグインストアの「おすすめ」として表示し、ユーザーが選択してインストールする。

---

## コーディング規約

### 全般

- **言語**: TypeScript strict mode（`"strict": true`）
- **`any`型禁止** — 代わりに`unknown`を使い型ガードで絞る
- **コメント**: 「何をしているか」ではなく「なぜそうするか」を書く
- **関数**: 1関数1責務。20行を超えたら分割を検討する

### React（デスクトップ・共通）

```typescript
// ✅ Good — named export + Props型を明示
type NoteCardProps = {
  note: Note
  onSelect: (id: string) => void
}

export function NoteCard({ note, onSelect }: NoteCardProps) {
  // ...
}

// ❌ Bad — default export + 暗黙的Props
export default ({ note, onSelect }) => { ... }
```

- コンポーネントはnamed exportのみ（default export禁止）
- カスタムフックは`use`プレフィックス必須
- `useEffect`の依存配列は省略しない

### React Native固有

- スタイルは`NativeWind`のユーティリティクラスを使う
- プラットフォーム分岐は`Platform.select()`を使い、ファイル分割（`.ios.tsx`）は最小限に
- `ScrollView`内で`FlatList`をネストしない

### Rust（Tauri バックエンド）

- ファイルI/Oは必ず`async`で行う
- 内部エラーは`anyhow::Result`で扱い、Tauri commandの境界では`Serialize`可能なアプリケーションエラーへ変換して返す
- `unwrap()`・`expect()`は禁止（テストコードを除く）

### 状態管理（Zustand）

```typescript
// stores/useNoteStore.ts
type NoteTab = {
  id: string
  noteId: string
}

type NotePane = {
  id: string
  tabs: NoteTab[]
  activeTabId: string | null
}

type NoteStore = {
  notes: Note[]
  panes: NotePane[]
  activePaneId: string | null
  activeNoteId: string | null
  openNoteIds: string[]
  openNoteInActivePane: (id: string) => void
  openNoteInNewPane: (id: string) => void
  moveTabToPane: (tabId: string, targetPaneId: string) => void
  reorderTabs: (paneId: string, tabIds: string[]) => void
  closeNote: (id: string) => void
  closeTab: (paneId: string, tabId: string) => void
  closePane: (paneId: string) => void
  setActivePane: (paneId: string) => void
  setActiveNote: (id: string) => void
  setActiveTab: (paneId: string, tabId: string) => void
  addNote: (note: Note) => void
}
```

- `panes`を正本にし、各ペインは`tabs`と`activeTabId`を持つ。表示中のノートはアクティブタブから導出する
- `openNoteIds`は全ペイン横断の派生データとして保ち、重複オープン制御やグローバル検索結果との整合に使う
- `activePaneId`と`activeNoteId`は分ける。空ペインや空タブ列を許可するため、アクティブペインにノートがない状態を表現できるようにする
- `openNoteInActivePane()`はアクティブペイン内に既存タブがあればそれをアクティブ化し、なければ末尾に追加する
- `openNoteInNewPane()`は新しいペインを作り、最初のタブとしてノートを追加してからそのペインをアクティブにする
- `closeTab()`は対象タブを閉じ、同じペイン内で隣接タブをアクティブにする。最後のタブを閉じた場合は空ペインにする
- `closeNote()`は該当ノートを表示している全タブを閉じる
- `closePane()`で最後の1ペインを消さない。最低1つの空ペインを残す
- タブのドラッグ移動が必要になったら、`moveTabToPane()`と`reorderTabs()`を使い、ペインレイアウト自体が必要になった時点で`NotePane`に`width`や`groupId`を追加して対応する

- 1ファイル1ストア、ストア名は`use[Name]Store`
- TanStack Queryはサーバー/非同期状態のみ。ローカルUIステートはZustand

### SQLite

- マイグレーションは`packages/db/migrations/`に連番で管理（`001_init.sql`, `002_add_tags.sql`）
- `packages/db/`のPublic APIを通じてのみDBアクセス。直接SQLを書かない
- インデックスを忘れない（`note_id`, `updated_at`は必須）

---

## ドメインモデル

```typescript
// packages/core/src/types.ts

type Note = {
  id: string           // UUID v4
  title: string
  content: string      // Markdownテキスト
  filePath: string     // ローカルファイルパス
  tags: string[]
  links: NoteLink[]    // [[WikiLink]]の解析結果
  createdAt: Date
  updatedAt: Date
  syncedAt: Date | null
}

type NoteLink = {
  fromId: string
  toId: string
  alias: string | null  // [[タイトル|エイリアス]]
}

type Tag = {
  id: string
  name: string
  noteCount: number
}
```

---

## ファイル命名規則

| 種類 | 規則 | 例 |
|---|---|---|
| Reactコンポーネント | PascalCase | `NoteCard.tsx` |
| カスタムフック | camelCase + `use` prefix | `useNoteSearch.ts` |
| ストア | camelCase + `Store` suffix | `useNoteStore.ts` |
| ユーティリティ | camelCase | `parseWikiLinks.ts` |
| 型定義 | camelCase | `types.ts` |
| テスト | 同名 + `.test.ts` | `parseWikiLinks.test.ts` |
| Rustモジュール | snake_case | `file_watcher.rs` |

---

## テスト方針

- **ユニットテスト**: Vitest。`packages/core`・`packages/sync`は80%以上のカバレッジを目標
- **コンポーネントテスト**: React Testing Library
- **E2Eテスト**: MVP対象外（v1.0以降）
- テストファイルはソースと同じディレクトリに置く（`__tests__/`フォルダ禁止）

---

## 同期・暗号化の実装注意点

- 暗号化キーは端末のKeychain（iOS）/ Keystore（Android）/ OS Keychain（macOS/Windows）に保存。クラウドに送信しない
- `SyncProvider`に渡すデータは必ず暗号化してから渡す。プロバイダ側で暗号化しない
- 同期ロジックは`packages/sync/`に完全に閉じ込める。`apps/`から同期の実装詳細を参照しない
- `packages/sync/`から特定の`plugins/sync-*/`を直接importしない（インターフェース経由のみ）

---

## 禁止事項

- `any`型の使用
- `console.log`の本番コードへの混入（`console.error`はOK）
- `packages/core`からアプリ固有コード（`apps/`）のimport
- Rustコードでの`unwrap()`・`expect()`（テスト除く）
- ノートデータの平文クラウド送信
- プラグインAPIを経由しないAI・同期機能の実装
- `SyncProvider`インターフェースを実装せずにストレージを直接操作すること

---

## 意思決定ログ

| 日付 | 決定事項 | 理由 |
|---|---|---|
| 2026-04 | デスクトップはTauri（Electronではなく） | 起動速度・メモリ消費・バンドルサイズ |
| 2026-04 | モバイルはReact Native Expo Bare（Capacitorではなく） | Obsidianのモバイル体験の根本原因がCapacitorのデスクトップ流用のため |
| 2026-04 | AI機能はプラグインに分離 | コアの複雑性を下げる・API費用を任意にする |
| 2026-04 | FSD（Feature Sliced Design）採用 | デスクトップ・モバイルで同一アーキテクチャを維持するため |
| 2026-04 | 同期バックエンドをすべてプラグイン化（R2含む） | コアをストレージ非依存にする。R2だけ特別扱いする理由がない |
| 2026-04 | iCloudはAPIではなくフォルダ共有方式で対応 | iCloudはアプリから強制同期できず、Markdownファイルとの相性に技術的課題がある |
| 2026-04 | 同期なしをデフォルトにする | R2は一般ユーザーに馴染みがない。ローカルファーストの哲学に忠実に「まず使える」を優先する |
| 2026-04 | R2・iCloudも同梱せずおすすめプラグインとして表示 | 同梱すること自体がR2を特別扱いすることになり、プラグインアーキテクチャの一貫性を損なう |
