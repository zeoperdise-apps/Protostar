# 最終QA・納品記録

検証日時: 2026-11-15T12:48:22.406Z（UTC）

## 結果

必須の未解決不具合なし。`npm run typecheck`、`npm test`（24件）、`npm run build` が成功しました。先行工程では19件のエンジン/保存テスト、63対戦のバランス検証、開発サーバーの18項目のブラウザQAも成功しています。今回はシミュレーションを変更していないため、63対戦の再実行はしていません。

本番ビルドを `npm run preview -- --port 4174 --strictPort` と、Python静的サーバーの `/lab/protostar/` サブパス（4175）で実測しました。Viteの `base: './'` によりJS・CSS・faviconも相対URLで配信されます。独立した本番ブラウザQAは16項目すべて成功、ページ例外・予期しないconsole error・HTTPエラーは0件です。

## 最終修正

- センサーを現在実行中の命令と対戦開始時のプログラムへ連動。前方は設定半角/600、近距離は設定距離、左は600以内かつ相対角 −π〜−0.001、障害物は88の中心線と拡張された障害物・敵機の境界、壁の中心座標限界を表示します。命令を実行する前と他の命令では非表示です。
- YES/NOはエンジンの実行トレースから取得。範囲図を遮蔽で切り抜かないことと、敵センサーの結果には遮蔽が反映されることを明記。空リンクでbooleanが失われたときは「結果未記録」と表示します。異なる角度・距離、命令切替、空リンクを5件の追加テストで確認しました。
- UIの `60 TICK / SEC` / `ORTHOGRAPHIC / 2D` を `90秒制限` / `自律対戦` に変更しました。
- pagehideでBFCacheに入った場合に描画を破棄しないよう調整しました（戻る/進むの実ブラウザ検証は今回対象外）。
- `npm ci` 推奨、production previewとHTTP配信の手順、相対アセットURLのVite設定を追加しました。

## 本番ブラウザ確認

- npm preview serves final build
- production subpath assets, initial WebGL2 arena, six presets and player-facing labels
- AI cell parameter auto-save survives production reload
- parameter-adjusted real sensor range and YES appear on paused instruction
- active battle sensor uses starting program until the next match
- new battle sensor follows edited half-angle
- WEBGL_lose_context shows recovery notice and restores paused scene
- production preset match reaches result; WebAudio shot/hit/end initialization has no exceptions
- reopening result does not duplicate victory records
- production custom-versus-custom executes independent robots
- JSON name escaped; selected imported robot deletion persists valid selections
- battle keyboard shortcuts preserve form focus
- 390px palette exposes all 19 chips through scrolling, categories and search
- 390px zoomed chip edit and inspector work with no page horizontal overflow
- localStorage denial shows memory mode and still runs the game
- zero unexpected browser console/page/HTTP errors

## ソース確認

実行状態・再描画・破棄処理、JSON名を挿入するDOMのescape、削除後の自機/相手の選択修復と保存、勝利記録の一度だけの処理、editorのparameter型、フォーム入力時のSpace保護と選択セルDeleteを読みました。新センサー表示では試合開始時にプログラムをコピーするため、対戦途中の編集を過去の判定に混ぜません。ソース確認と代表経路の実測で追加の重大不具合は見つかりませんでした。

## 画像・ログ

以下はローカルQA成果物（Gitには含めません）です。絶対パスは検証したCloud作業環境内の場所を示します。作業用の検証記録はソースZIPにも含めていません。

- `/workspace/Protostar/artifacts/final-qa-report.json`: 16項目の機械可読記録
- `/workspace/Protostar/artifacts/final-desktop-initial.png`: 初期画面
- `/workspace/Protostar/artifacts/final-sensor-60.png`、`final-sensor-12.png`: 実パラメーターによる範囲変更。両画像をview_imageで確認しました。
- `/workspace/Protostar/artifacts/final-context-lost.png`、`final-context-restored.png`: 中断説明と復旧。復旧後の停止盤面は中断前の画像と一致しました。
- `/workspace/Protostar/artifacts/final-result.png`: 対戦結果。view_imageで確認しました。
- `/workspace/Protostar/artifacts/final-mobile-editor.png`、`final-mobile-inspector.png`: 390pxの全体盤・拡大盤とinspector。両画像をview_imageで確認しました。
- `/workspace/Protostar/artifacts/final-mobile-memory.png`: localStorage拒否時の表示

## 制約

Linux headless Chromium / SwiftShaderによる確認です。物理GPU、iOS/Safari、実機タッチの聴感・操作感は未実測です。WebAudioの生成と対戦中の例外なしを確認していますが、音質の聴感は未評価です。context lossは `WEBGL_lose_context` で発生・復旧させました。ビルド時にThree.jsを含む約586KB（gzip約157KB）のチャンクサイズ警告がありますが、ビルド/配信は成功しています。センサー範囲図は遮蔽で切り抜きません。

## 配布物

以下は日英対応前のQA工程で作成したローカル配布物の記録です。Gitには含めず、現在のPRから生成した配布物ではありません。

`/workspace/deliverables/Protostar-source.zip` はソース、public、docs、tests、scripts、package.json/lock、設定、READMEです。node_modules、.git、原作ZIP、個人設定、保存データ、作業用artifactsを含めません。

`/workspace/deliverables/Protostar-web.zip` は最終distの内容と日本語の配信READMEです。解凍後に静的HTTPサーバーで配信してください。

両ZIPのCRC、展開後ファイル一覧・内容一致、不要パス除外を検証しました。SHA256は `/workspace/deliverables/SHA256SUMS`、ファイル一覧は `/workspace/deliverables/package-manifest.json` に記録しています。ソースZIPへ配布物を再帰包含しません。

開発サーバー（port 5173）は起動したままです。検証用4174/4175は終了します。commit/push/公開はしていません。
