# 衛星配置プランナー

地点・時刻ごとのGNSS衛星配置を調べるWebアプリです。地図選択、現在地取得、前後24時間の比較に対応します。

## GitHub Pagesで使う

GitHub Pagesで公開するため、利用者も管理者もRenderのアカウントは不要です。衛星計算はブラウザのWeb Worker内で実行します。座標・計算条件は計算サーバーへ送信しません。住所取得では国土地理院（接続失敗時HeartRails）、地図表示では国土地理院へアクセスします。

- `.github/workflows/pages.yml`：masterへのpush・手動実行・6時間ごとの更新と公開。
- GitHubの Settings → Pages → Source は **GitHub Actions** に設定します。
- `node gnss-planner/scripts/build-pages.mjs`：公開用 `_site/` を作成します。
- 配布元への接続失敗時は前回公開データ、初回は同梱の公開軌道データを使います。取得日時は更新せず、画面で警告します。軌道が3日より古ければ計算から除外します。
- スケジュールには遅延・停止があり得ます。公開リポジトリが60日間更新されないと定期実行が無効になる場合があるため、Actionsで状態を確認してください。
- 自治体名の対応表は国土地理院の muni.js から作成した同梱データです。住所は町丁目程度の参考値です。

現在地は端末・ブラウザの許可が必要です。外付けRTK受信機には直接接続しません。衛星配置だけの参考評価であり、RTK FIXや走行可否の判定には使えません。

## ローカル版

Node.js 24で `node gnss-planner/server.mjs` を実行し、http://localhost:3000 を開きます。従来のローカル計算APIも維持しています。

## 検証・詳細

`node --test gnss-planner/test/*.test.mjs`

[操作方法・計算の前提](gnss-planner/README.md) / [検証記録](gnss-planner/VALIDATION.md)

[GitHub Pages公式説明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

`render.yaml` は別途Nodeサーバーをホストしたい場合の任意設定です。GitHub Pagesでは使用しません。
