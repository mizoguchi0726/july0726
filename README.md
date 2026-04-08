# Networked Browser MMO Demo

## 使い方

1. Node.js 18以上を入れる
2. このフォルダで以下を実行

```bash
npm install
npm start
```

3. ブラウザで開く

```text
http://localhost:3000
```

## 別端末から入る方法

同じネットワーク内なら、サーバーPCのIPアドレスでアクセスできます。

例:
```text
http://192.168.1.50:3000
```

## Render / Railway などに置く場合

- そのまま Node.js アプリとしてデプロイできます
- 起動コマンドは `npm start`
- ポートは `process.env.PORT` を使うのでそのままで大丈夫です

## 入っているもの

- Node.js + Express
- WebSocket (`ws`)
- 共有ワールド
- 複数人移動
- チャット
- ルーム切り替え
- 簡単な障害物つきマップ