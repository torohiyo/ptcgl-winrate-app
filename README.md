# PTCGL Winrate Tracker

PTCGL の勝敗リザルト画面スクリーンショットとバトルログから、対戦履歴・先攻後攻・相手デッキ別勝率を管理するローカル Web アプリです。

## Features

- リザルト画面スクリーンショットを OCR して `VICTORY` / `DEFEAT` を自動判定
- バトルログから自分の先攻 / 後攻を自動判定
- 自分のデッキ登録
- 相手デッキ登録・プルダウン選択
- 対戦履歴をトランザクションヒストリー風に表示
- 全体勝率、自分デッキ別勝率、相手デッキ別勝率、自分デッキ × 相手デッキ別勝率を表示
- localStorage 保存
- CSV エクスポート / インポート

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
npm run preview
```

## GitHub push example

```bash
git init
git add .
git commit -m "Initial PTCGL winrate tracker"
git branch -M main
git remote add origin git@github.com:YOUR_NAME/ptcgl-winrate-tracker.git
git push -u origin main
```

## Notes

OCR は `tesseract.js` をブラウザ内で実行しています。スクリーンショットによっては OCR が失敗する可能性があるため、結果は手動で上書きできます。

バトルログは以下のような行を優先して解析します。

- `PLAYER decided to go first.`
- `PLAYER decided to go second.`
- `Opponent conceded. PLAYER wins.`
- `You conceded.`

