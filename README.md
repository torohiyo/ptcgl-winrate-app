# PTCGL Winrate Tracker

PTCGL の対戦結果を手動で記録する勝率管理アプリです。

## 主な機能

- 勝敗は手動入力
- 先攻・後攻は手動入力
- 先攻・後攻で「不明 / ログ判定」を選ぶと、バトルログ内の `decided to go first.` から先攻後攻だけ補助判定
- マイデッキを登録し、対戦記録時に画像付きで選択
- 相手デッキも画像付きで選択
- Transaction History 形式の対戦履歴
- 全体勝率 / 先攻勝率 / 後攻勝率
- 自分デッキ別 / 相手デッキ別 / マッチアップ別勝率
- CSV Export
- localStorage 保存
- モバイル利用を想定したコンパクトUI

## デッキ画像

Limitless の画像形式に合わせて、以下の形式でフェッチします。

```html
<img class="pokemon" src="https://r2.limitlesstcg.net/pokemon/gen9/dragapult.png" alt="dragapult">
```

アプリ内では `imageId` を使って以下の URL を生成します。

```text
https://r2.limitlesstcg.net/pokemon/gen9/{imageId}.png
```

## 起動方法

```bash
npm install
npm run dev
```

## GitHub に push する場合

```bash
git init
git add .
git commit -m "Initial PTCGL winrate tracker"
git branch -M main
git remote add origin git@github.com:YOUR_NAME/ptcgl-winrate-tracker.git
git push -u origin main
```

## 注意

OCR は削除しています。スクリーンショットからの自動判定は行いません。
