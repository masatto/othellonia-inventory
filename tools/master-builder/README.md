# master-builder

駒マスターデータ（`public/master/*.json`）とPWA独自アイコン（`public/icons/*.png`）を、
Webアプリ本体とは分離して生成するためのツール群です。GitHub Pagesへの公開物には、
ここで生成した「事実情報・特徴量・独自素材」のみを含め、攻略サイトの生アイコンは含めません。

## 現状（重要）

このプロジェクトの開発環境（サンドボックス）は `game8.jp` を含む外部サイトへの
アクセスが遮断されており、`robots.txt` ・利用規約・二次利用条件を確認できませんでした。
仕様書6章の方針（「問題があると断定しないが、確認できるまでは安全側に倒す」）に従い、
**本リポジトリには game8.jp 等からの自動取得（画像・テキストのスクレイピング）は実装していません。**

現在 `public/master/` にあるデータは、ユーザーが過去に目視確認した駒名一覧
（属性・ランク・スキル等は未確認のため `"不明"`）のみを含む seed データです
（`seedKnownPieces.mjs` が生成）。

## 実行可能なスクリプト

- `node tools/master-builder/seedKnownPieces.mjs`
  ネットワークアクセスなし。既知の駒名一覧から `public/master/*.json` を再生成します。
- `node tools/master-builder/generate-icons.mjs`
  ネットワークアクセスなし。`public/icons/source.svg`（自作のUI素材）からPWA用PNGアイコンを生成します。

## 攻略サイトからの事実情報取得を実装する場合の手順（将来対応）

このリポジトリのメンテナが実際に取得作業を行う場合は、必ず以下を先に行ってください。

1. 対象サイトの利用規約・`robots.txt`・著作権表示・二次利用条件・自動取得に関する制約を確認する
2. 再配布可能なのは「事実情報（駒名・属性・ランク・スキルの構造化データ）」と
   「そこから生成した特徴量」のみであり、生画像やスキル説明文の丸ごと転載はしないと決める
3. 取得は開発環境またはGitHub Actionsの一時ディレクトリ内でのみ行い、
   生画像はGit・Pages配信物・Actions Artifact/Cacheのいずれにも残さない
4. アクセス頻度・リトライ回数を制限し、User-Agent/Refererと出典URLを適切に記録する
5. 取得失敗時は既存のマスターを壊さず、差分をPull Requestとして提示する
   （`.github/workflows/master-update.yml` の構成を参照）

上記が確認・実装できるまでは、`seedKnownPieces.mjs` による手動データのみを使用してください。
