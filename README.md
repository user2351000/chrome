# GitHub Actions リモートデスクトップ

GitHub Actions で Chrome をブラウザから利用するリポジトリです。
(???????????)

## GitHub アカウント認証の設定

公開デスクトップURLへのアクセスには、ワークフローを起動したGitHubアカウントでの認証が必要です。初回利用前に、リポジトリ所有者が次の設定を行ってください。

1. GitHubでOAuth Appを作成し、Device Flowを有効にします。Homepage URLにはこのリポジトリのURLを、Authorization callback URLには `http://localhost` を指定します（Device Flowではcallback URLは使用しません）。
2. OAuth AppのClient IDをリポジトリの **Settings → Secrets and variables → Actions → Variables** に `GITHUB_OAUTH_CLIENT_ID` という名前で登録します。

Client IDは公開情報です。OAuth AppのClient Secretや権限の追加は不要です。アクセス時にGitHubのデバイス認証画面で表示されたコードを入力すると、ワークフローを起動したアカウントだけがデスクトップを利用できます。ジョブを停止するときはActionsから実行中のワークフローをキャンセルしてください。

## 利用方法

1. GitHub のリポジトリページで **Actions** を開きます。
2. **Chrome**をクリックします
3. **Run workflow** を押して起動します。
4. 実行中のジョブを開き、ログから `https://<ランダム文字列>.trycloudflare.com` をブラウザで開き、GitHubアカウントで認証します。

ジョブを手動でキャンセルすると停止できます。

## Chrome プロファイル

chromeのみ、ログイン状態を次回の実行に引き継ぐ機能があります。利用にはリポジトリの **Settings → Secrets and variables → Actions → Repository secrets** で `CHROME_STATE_ENCRYPTION_KEY` を登録してください。

キーは次のサイトなどで生成できます
https://generate-random.org/base64-string

出力された32バイトのBase64文字列をそのままシークレット値に設定します。実行ごとにキーを変更しないでください
