# ちぎりノート

箇条書きの「書く」と、メモをカードにして並べる「ひろげる」を切り替えられるメモ帳です。

- 「書く」でメモを選び、元の文章と連動させてボードに置けます。完了した項目は一覧の下に移り、ボードのカードは小さくなります。
- 「ひろげる」でカードの余白をドラッグすると移動できます。選択枠の角でサイズを変え、丸いハンドルで回転できます。
- カードを線でつなぐ、ペンやマーカーで書く、紙や背景の色を変える、素材を貼るといった操作ができます。カードの上から書いた描画はカードについて動きます。固定用テープをカードに重ねると、その位置に留められます。

## 手元で開く

ZIPを展開し、`index.html` をブラウザで開くと試せます。メモを継続して使う場合は、フォルダー内で以下を実行し、同じURLで開いてください。依存パッケージのインストールやビルドは不要です。

```sh
python -m http.server 8000 --bind 127.0.0.1
```

ブラウザで `http://127.0.0.1:8000/` を開きます。メモはブラウザのローカルストレージに保存されます。利用するブラウザや公開先のURLが変わると、保存先も変わります。

## GitHub Pagesで公開する

1. ZIPを展開し、`index.html`、`src/`、`assets/`、`.nojekyll` などをリポジトリのルートに配置してコミットします。
2. リポジトリの **Settings** → **Pages** → **Build and deployment** を開き、**Source** で **Deploy from a branch** を選びます。
3. ファイルを置いたブランチ（例 `main`）と **/ (root)** を選んで **Save** を押します。公開後は同じ画面に表示されるURLから開けます。

[GitHub Pages の公開元を設定する（GitHub Docs）](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## ファイル構成

- `index.html` にメモ帳の画面があります。
- `src/styles.css` に画面のスタイル、`src/app.js` に操作と保存の処理、`src/catalog.js` にデコ素材のカタログがあります。
- `assets/` に透過SVG素材195点があり、[素材の内訳と出典](ASSETS.md)で確認できます。
