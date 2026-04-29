# PTCGL Winrate Tracker

PTCGLの対戦結果を手動入力で記録し、デッキ別・マッチアップ別の勝率を管理するローカルWebアプリです。

## 主な機能

- 勝敗を手動入力
- 先攻・後攻を手動入力
- 「不明 / ログ判定」を選んだ場合のみ、バトルログから先攻・後攻を判定
- マイデッキを登録・選択
- 相手デッキを画像付きで選択
- Limitless TCG形式の画像URLからデッキ画像を表示
- 対戦履歴の保存
- 勝率集計
- 画像付きの相性表
- 相性表は勝率の数値のみを表示（未対戦は0.0表示）
- 相性表の横軸は画像のみ、総合列は左側に固定
- CSV Export
- localStorage保存

## 起動方法

```bash
npm install
npm run dev
```

## GitHubにpushする場合

```bash
git init
git add .
git commit -m "Initial PTCGL winrate tracker"
git branch -M main
git remote add origin git@github.com:YOUR_NAME/ptcgl-winrate-tracker.git
git push -u origin main
```
