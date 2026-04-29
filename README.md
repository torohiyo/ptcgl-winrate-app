# PTCGL Winrate Tracker

PTCGL の対戦結果を手動で記録し、勝率を確認するためのローカル React アプリです。

## 仕様

- 勝敗は手動入力
- 先攻・後攻も手動入力
- 自分のデッキ / 相手のデッキをプルダウンで選択
- デフォルトデッキとして主要メタデッキを登録済み
- Transaction History 形式で対戦履歴を表示
- 全体勝率、先攻/後攻勝率、自分デッキ別、相手デッキ別、マッチアップ別勝率を表示
- localStorage に保存
- CSV Export 対応
- OCR は使っていません

## デフォルト登録デッキ

- Dragapult ex
- Crustle Mysterious Rock Inn
- Rocket's Mewtwo ex
- Ogerpon Meganium
- Festival Lead
- Cynthia's Garchomp ex
- Raging Bolt ex
- N's Zoroark ex
- Mega Lucario ex
- Alakazam Powerful Hand
- Ogerpon Box
- Mega Starmie ex
- Okidogi Adrena-Power
- Tera Box
- Rocket's Honchkrow
- Marnie's Grimmsnarl ex
- Lillie's Clefairy ex
- Slowking Seek Inspiration
- Mega Lopunny ex
- Hop's Trevenant
- Mega Absol Box
- Archaludon ex
- Ethan's Typhlosion
- Flareon ex
- Greninja ex
- Hydrapple ex

## 起動方法

```bash
npm install
npm run dev
```

## GitHub に push する例

```bash
git init
git add .
git commit -m "Initial PTCGL winrate tracker"
git branch -M main
git remote add origin git@github.com:YOUR_NAME/ptcgl-winrate-tracker.git
git push -u origin main
```

## 補足

対戦記録はブラウザの localStorage に保存されます。別ブラウザや別PCへ移す場合は CSV Export を使ってください。
