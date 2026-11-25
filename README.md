# GitHub Actions リモートデスクトップ

GitHub Actions で Chrome をブラウザから利用するリポジトリです。
(???????????)

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

chromeのみ、ログイン状態を次回の実行に引き継ぐ機能があります。利用にはリポジトリの **Settings → Secrets and variables → Actions → Repository secrets** で `CHROME_STATE_ENCRYPTION_KEY` を登録してください。

キーは次のサイトなどで生成できます
https://generate-random.org/base64-string

出力された32バイトのBase64文字列をそのままシークレット値に設定します。実行ごとにキーを変更しないでください
