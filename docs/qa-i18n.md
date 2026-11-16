# 日英対応の実装検証

検証日: 2026-11-15。実装と録画なしQAのみ。commit/push/PR/mergeはこの作業では実行していない。英語の初回通しプレイ録画はPR作成後の別工程として残している。検証で `recordVideo` は使用していない。

## 実装境界

- `src/i18n/` の型付き日英辞書、補間、カタログ/preset表示アダプター、静的DOM文言の対応付けを追加。日本語メッセージを正規表現で翻訳する処理は使用していない。
- ヘッダーとmodal内のJA/ENが常時言語変更に使える。document.lang、title、meta description、UI、aria/title/placeholder、装備、全19chip、preset、診断、保存/入力エラー、結果、sensor、描画fallbackが対応する。
- 戦闘エンジン・描画インスタンス・animation loop・Workbenchインスタンスを言語切替で作り直さない。program変更は診断用の補間metadata追加だけで、命令実行・幾何・バランス数値は変更していない。
- 保存versionは1、keyは`protostar.save.v1`のまま。欠落localeはja補完、明示不正localeは拒否。新規ブラウザ保存は`ja*`ならja、それ以外en。純TS APIの既定値はja。
- 機体名は利用者データ。既存/入力名は保持し、新しい初期機体と新規template複製だけ作成時の言語で名付ける。preset表示はIDと対戦開始時の参加者種別で解決し、利用者の名前を推測して翻訳しない。

## 実行結果

| 確認 | 結果 |
| --- | --- |
| `npm run typecheck` | 成功 |
| `npm test` | 29/29成功（既存24＋日英互換5） |
| `npm run build` | 成功。Three.jsを含む単一JSチャンク637.79 kBの既存種別のサイズ警告あり |
| `node scripts/i18n-playtest.cjs` | 13項目成功、11状態の英語漏れscanは空、page/console errorなし |
| `node scripts/i18n-edge-playtest.cjs` | 追加3項目成功、page/console errorなし |

63対戦のbalanceは、ゲーム挙動を変更していないため今回再実行していない。先行の63対戦成功は`docs/qa-final.md`等の既存記録を参照する。この日英QAは開発サーバー上のChromiumで実施し、本番配布先の実機検証は行っていない。

Unitでは旧保存の機体/勝利保持＋ja補完、ja/en round trip、不正locale拒否、利用者名保持、新規locale名、browserLocale、保存済みlocale優先、辞書key集合と全カタログ/presetの英語化、不変preset保持、動的診断と保存エラーのcode/params補間、表示済みエラーtoastのラベルを含む再翻訳を確認した。

Chromiumでは新規en-US初期英語、JA↔ENでpause時刻/canvas保持、装備と未確定機体名保持、選択cell/盤scroll/parameter/undo保持、diagnosticと開始阻止modalのlive翻訳、reload永続化、19chip guideとdetails保持、JSON英語エラー、局所対戦の結果、context-loss表示中の言語追随を確認した。旧保存の日本語機体名と勝利記録が英語切替後も保持される。保存拒否時の切替でもメモリ保存状態と説明が言語に追随する。

英語漏れscanはbody全体（非表示画面も含む）、title、aria-label/title/placeholder/value属性を対象とした。fresh EN保存で不必要な日本語は0件。旧保存の利用者名は意図的に翻訳しない。閉じた日本語guideの残存DOMをscanで発見し、modalを閉じる際に内容を破棄する修正後に再確認した。

390pxではJA/ENそれぞれbattle/editor/library/help/resultでdocument横幅390を確認した。英語palette/inspector/result/guideは改行・wrapを使い、主要説明は11px以上で読めるよう調整。スクリーンショットを`view_image`で実見し、playfieldがUIで隠れないこと、翻訳文が主要欄からはみ出さないことを確認した。実見で見つけたchip件数ラベルの誤置換とmobile palette説明の文間詰まりも修正・再撮影した。

## 証拠

以下はローカルQA成果物（Gitには含めません）です。リンク先はこの作業環境内で生成したファイルであり、GitHub上のPRには同梱しません。

機械可読の結果: [`artifacts/i18n-report.json`](../artifacts/i18n-report.json)。追加QAはこのreportへ`edgeChecks`/`edgeErrors`を追記するため、再実行は上表の2スクリプトを順に実行する。

代表画像:

- [英語battle](../artifacts/i18n-en-battle.png)、[editor](../artifacts/i18n-en-editor.png)、[library](../artifacts/i18n-en-library.png)、[guide](../artifacts/i18n-en-help.png)、[result](../artifacts/i18n-en-result.png)
- [英語390px editor](../artifacts/i18n-en-mobile-editor.png)、[日本語390px editor](../artifacts/i18n-ja-mobile-editor.png)
- [英語390px result](../artifacts/i18n-en-mobile-result.png)、[日本語390px result](../artifacts/i18n-ja-mobile-result.png)
- [英語context-loss fallback](../artifacts/i18n-en-fallback.png)

音の聴感検証と動画録画は行っていない。今回確認した範囲で未解決の機能不具合はない。
