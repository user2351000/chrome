# GitHub Actions リモートデスクトップ

GitHub Actions で Chrome、Firefox、Ubuntu KDE デスクトップ、または通常デスクトップをブラウザから利用するリポジトリです。

## 利用方法

1. GitHub のリポジトリページで **Actions** を開きます。
2. **Chrome**をクリックします
3. **Run workflow** を押して起動します。
4. 実行中のジョブを開き、ログから `https://<ランダム文字列>.trycloudflare.com` をブラウザで開きます。

停止するときは次の操作を行います。

- Chrome: デスクトップ画面で `http://127.0.0.1/` を開く
- Firefox / Desktop / Ubuntu KDE: アドレスバーで `x` または `x/` を開く

ジョブを手動でキャンセルすることでも停止できます。

## Chrome プロファイル

Chrome ワークフローには、ブラウザのプロファイルを次回の実行に引き継ぐ機能があります。利用にはリポジトリの **Settings → Secrets and variables → Actions → Repository secrets** で `CHROME_STATE_ENCRYPTION_KEY` を登録してください。

キーは次のコマンドで生成できます。

```sh
openssl rand -base64 32
```

出力された32バイトのBase64文字列をそのままシークレット値に設定します。実行ごとにキーを変更しないでください。

## 注意

- Cloudflare の URL は実行ごとに変わります。
- 公開環境であるため、アクセス情報を取り扱わないでください。
- GitHub Actions の利用時間とストレージに注意してください。
