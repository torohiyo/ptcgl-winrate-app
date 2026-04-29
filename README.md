# PTCGL Winrate Tracker

Vite + React で作った PTCGL 勝率管理アプリです。v13 では Supabase に対応し、PC・スマホ・別ブラウザから同じデッキ / 型 / 試合履歴を共有できます。

## ローカル起動

```bash
npm install
npm run dev
```

## Supabase 設定

1. Supabase で新しい Project を作成
2. Supabase の SQL Editor で `supabase/schema.sql` を実行
3. Project Settings → API から以下を取得
   - Project URL
   - anon public key
4. `.env.example` を `.env.local` にコピーして値を入れる

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

5. 起動

```bash
npm run dev
```

## Vercel 設定

Vercel の Environment Variables に以下を追加してください。

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Build 設定は以下です。

```text
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

## 注意

現版は「全員で1つの共通DBを見る」前提です。`supabase/schema.sql` では anon key から読み書き可能な public policy を設定しています。URLを知っている人全員が編集できるため、外部公開する場合は Supabase Auth を入れて RLS を絞ってください。


## v14 note

Vercel の `npm install` 失敗を避けるため、`@supabase/supabase-js` 依存を外し、標準 `fetch` で Supabase REST API に接続する構成に変更しています。

Vercel 設定:

- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
