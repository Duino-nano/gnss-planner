# 衛星配置プランナー

地点・時刻ごとのGNSS衛星配置とDOPを比較するWebアプリです。現在地、地図選択、前後24時間のグラフに対応します。実際のRTK FIXや走行可否を判定するものではありません。

## ローカル起動

Node.js 24で `node gnss-planner/server.mjs` を実行し、http://localhost:3000 を開きます。依存ライブラリは同梱しています。

## Web公開（Render）

1. このリポジトリをGitHubへアップロードします。アプリの公開とソースの公開は別なので、非公開リポジトリでも構いません。
2. Renderにログインし、New → Blueprintからこのリポジトリを接続します。
3. `render.yaml` に設定済みのFreeプランを確認してデプロイします。
4. 発行されたHTTPS URLで画面と衛星データの取得を確認します。

無料プランは非アクセス時に停止し、次のアクセス時に再起動するため、初回表示に時間がかかります。常時利用の本番運用には適しません。利用枠やプラン変更はRenderの管理画面で確認してください。

公開先で衛星・住所の外部APIへの接続が必要です。キャッシュが消えた場合は自動で再取得します。配布元に接続できない場合は結果を取得できません。GitHub PagesのみではNode.jsの計算APIを動かせません。

公開モードは `RENDER_EXTERNAL_HOSTNAME` または `PUBLIC_HOSTNAME` で有効になります。独自環境では `PUBLIC_HOSTNAME` に公開ホスト名（スキーム・パスなし）、`PORT` に待受ポートを設定し、前段でHTTPSを提供してください。未設定ならローカル接続のみです。

## 位置情報

ブラウザの許可が必要です。評価座標はアプリのサーバー、住所検索時は国土地理院（接続失敗時HeartRails）へ送信します。アプリは座標のログを保存しませんが、公開サービス側のログ設定は別途確認してください。

## 検証・詳細

`node --test gnss-planner/test/*.test.mjs`

[操作方法・計算の前提](gnss-planner/README.md) / [検証記録](gnss-planner/VALIDATION.md)

[RenderのNodeアプリ公開手順](https://render.com/docs/deploy-node-express-app) / [無料プランの制約](https://render.com/docs/free)
