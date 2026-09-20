# MML sound planter v0.1

「気軽にMMLで楽しむ」ための、TypeScript + Vite + Web Audio API製サウンドエディタ。
UIフレームワーク不要。MML・音声処理はUIに依存しません。

## 起動・テスト

Node.js 22.18以上（検証環境: 24.3）を使用します。

```sh
npm install
npm run dev
```

表示されたlocalhostのURLをブラウザで開きます。
音声再生にはAudioWorklet対応ブラウザとHTTPSまたはlocalhostが必要です。

```sh
npm test       # Parser / Sequencer / EG / DSP / ライフサイクル
npm run build # TypeScript検査と本番ビルド
node --experimental-strip-types scripts/check-build.mjs # 配布Workletの実行検証
npm run preview
```

## ファイル構成と責務

```text
src/
  main.ts                 UI、メイン/テスト切り替え、プレーンテキスト入出力
  style.css               レスポンシブな画面
  mml/
    lexer.ts              コメントを読み飛ばし元ソース位置を保持
    ast.ts                AST型、定義、位置付きエラー
    parser.ts             トラック、コマンド、ループ、ポルタメント構文
    validate.ts           値・参照・実行状態・無限ループの再生前検証
    compile.ts            メイン/テストのコンパイル入口
    sequencer.ts          独立したトラック状態 → 遅延生成TimedEvent
  audio/
    engine.ts             AudioContext / Workletの生成と破棄
    worklet.ts            Web Audioレンダースレッドとの接続
    render.ts             共通サンプル時間で複数トラックを演奏
    voice.ts              VoiceインターフェースとSSG Voice
    tone.ts               矩形波（PolyBLEPによる折り返し抑制）
    noise.ts              17ビットLFSR疑似ノイズ
    modulation.ts         音源非依存のVibrato / Tremolo変調
    envelope.ts           音源非依存のEnvelopeGenerator
    opm-rates.ts          OPM Rate / KS / EGクロック、デチューン定数
tests/
    mml.test.ts           構文、時間、状態、正常系・異常系
    audio.test.ts         EG、ノイズ、パン、q、タイ、サンプル時計、停止
hosting/worker.mjs        Sites用静的アセット転送
scripts/                 公開用成果物作成・配布Worklet検証
vite.config.ts           ViteとSitesビルド設定
```

Source → Lexer/Parser → AST → Validation → Sequencer → Timed Events → Voice/Envelope → AudioWorklet。
SequencerはWeb Audio APIを参照せず、音源もMML文字列を読みません。
1イベント先読みで`&`を解決し、ループはAST上に保持します。
複数トラックは共通のサンプル位置0から開始します。メインスレッドのタイマーによる発音予約はありません。
停止時はWorklet出力を切断し、MessagePortを閉じ、AudioContextを閉じます。
再生準備中の停止・再生連打も世代番号と音源のキャンセル状態で処理します。

## 実装したMML

- 必須のtrack0、任意のtrack1～11、重複チェック。
- 大文字小文字、空白、改行、`//`コメント。エラーに元ソースの行・列を表示。
- c～b / r、シャープ・フラット、1～128の任意整数音長、複数付点。
- t / o / > / < / l / v / @v / q / p / @d と指定された初期値・値域。
- @s0の矩形波、@s1～31の周期指定疑似ノイズ、@s101～131のTone + Noise。
- track0内の@eN定義、@eN選択、@e0無効化、6値の検証、KS。
- 有限・無限・入れ子ループ、有限ループの最終周回脱出`:`。
- 同音タイ・異音レガート、ループ境界を越える接続、休符/末尾でのキーオフ。
- 2音ポルタメント（複数付点対応）、内部のオクターブ変更保持、qと連続ポルタメント。
- メインを先頭から再生、停止、別欄のテスト再生。
- ローカルファイルから文字列を読み込み、メイン文字列だけをそのまま.txt保存。

## 内部実装上の判断

- テンポは各演奏トラックに属します。他トラックの`t`には影響しません。
- 音高は国際式表記（o4 c = C4、A4 = 440 Hz）。ポルタメントは半音尺度で連続的に移動します。
- `@s`は各トラックとテストで明示必須です。未指定の発音は再生前エラーです。
- デチューンは1単位=1 cent。`DETUNE_CENTS_PER_UNIT`一箇所で調整できます。
- SSGクロックは2 MHz。ノイズはx^17+x^14+1のLFSR、更新周波数はclock/(16×period)。
- ノイズの音高・デチューンは無視し、EGのKS評価も固定C4を使います。
- EGはymfmのOPM Rate/KS・増分表・10ビット減衰・状態遷移に準拠。3.579545 MHz / 64 / 3で更新します。AR/DR/SR=0の停止、SL=15の特殊値、AR最高速、RRの換算も共通モジュールで扱います。
- OPMのKC範囲を超える高音はKS計算のみ最大KCにクランプします。
- EGのゲインは減衰値を指数変換します。実機DACやFM演算のビット完全再現は目的にしていません。根拠・ライセンスはTHIRD_PARTY_NOTICES.md参照。
- キーオフ後はRRによるリリースを演奏し、手動停止は即時に出力を破棄します。無効EGではキーオフ時に消音します。
- テスト再生はメイン全体の構文を確認し、track0の定義とテスト本文だけを意味検証・演奏します。メイン演奏トラックの状態は継承しません。

## 現在の制約

- 防御的な上限として構造の入れ子は128段、発音/休符間の無時間処理は16,384ステップまで。上限を超える極端な入力は再生前エラーにします。
- 時間が進まない無限ループは再生前エラーです。通常の無限ループは終了時間・イベント配列を事前生成しません。
- 構文・意味エラーは最初の1件を表示します。リッチエディタや自動保存はありません。
- ブラウザ/OSがAudioContext自体を中断した場合は演奏も中断されます。
- この実装環境に接続されたブラウザがなかったため、実ブラウザの聴感・ファイルダイアログ・端末別表示は未確認です。DSP出力、Workletバンドル、音源ライフサイクルは自動テスト対象です。

## 意図的に実装しないもの

FM音源/音色、AI音色作成、コマンド一覧、構文ハイライト、独自拡張子・フォーマットバージョン管理。
ピアノロール、ミキサー、波形表示/編集、GUI音色エディタも実装しません。
FM追加時はVoiceを追加し、同じSequencerとEnvelopeGeneratorを再利用できます。

## マクロ・LFO・Tone + Noise

```text
track0 {
    $arp+$ {c8 e8 g8}
    $phrase$ {$arp+$ (ce)4.&(ed)4.}
    @lv1 {8,5,2,0}
    @lt1 {-20,8,0,0}
}
track1 {
    @s105 @lv1 @lt1 t120 o4 v10
    $phrase$ @lv0 @lt0 c4
}
```

マクロ名は1～16文字の英数字・`_+-`。大文字小文字を区別しません。track0のみで定義し、前方参照・入れ子呼び出しに対応します。状態・`&`は境界を越えて継続し、本文の元の行・列でエラーを表示します。未使用の定義も含め、参照グラフのDFSで未定義・循環参照を再生前に検出します。ASTを遅延走査し、再生側にも循環・深さ・無時間処理数の上限があります。マクロとループを合わせた深さは128段までです。

LFO定義は`@lvN {Depth,Period,Delay,Mode}`（Vibrato）または`@ltN {...}`（Tremolo）。種類ごとに独立した正整数番号を使います。Depthは-127～+127、Periodは1～255、Delayは0～255、時間単位は0.1秒。Depthの符号が開始方向を表し、正の`+`は省略可能です。Modeは`0`（repeat）/`1`（hold）です。演奏トラックで同コマンドの番号を選択し、0でOFFにします。定義番号0は禁止です。テスト再生もtrack0のマクロ・LFOを利用できます。

- repeatは指定Periodの正弦波。holdは指定Periodで四分の一正弦波をたどり、符号付き目標値を保持します。
- 通常のkey-onで位相・Delayをリセットします。`&`接続中は継続し、選択番号が変わったLFOのみ再開始します。
- `u = Depth/127 × sine`とし、Vibratoは`12 × u`半音（最大±1オクターブ）。ノート＋ポルタメント＋detune＋Vibratoを加算した音程から周波数を求めます。
- Tremoloは`gain = clamp(volume/127 × envelope × (1+u), 0, 1)`。変調係数は0～2、Delay中は1です。正方向は増幅側から始まり、上限ではclampするため正弦波の山が平らになる場合があります。EGが0なら必ず無音です。
- `@s101～131`ではNoise Period=N−100。Tone/Noiseをゲート結合し、NoiseがHighの間はTone、Lowの間はLowを出力します。Tone側のPolyBLEP補正を維持し、波形の単純加算は行いません。独立したTone/NoiseとMixerの構成は[GIデータシート](https://www.silicon-heaven.net/atom/howel/parts/ay3891x_datasheet.htm)を参考にしています。
- Tone + Noiseのpitch系処理はToneのみ、Noise Periodは固定。Noise onlyではVibratoも無効です。Tremoloは全モードの最終出力へ適用します。

実機のDAC・クロック量子化・共有ノイズ回路の完全再現ではありません。既存設計に合わせて各トラックが独立したLFSRを持ち、ゲート出力を±1へ写像します。Tone側は既存の連続周波数・PolyBLEPを維持し、Noiseエッジの追加の帯域制限やDC除去は行いません。新機能のDSP検証は`tests/extensions.test.ts`、配布Workletでの統合検証は`scripts/check-build.mjs`で実施します。

コマンドと番号の間にカンマは入れません（`@s0`、`@e1`、`@lv1`、`@lt1`）。旧カンマ書式・旧5パラメータLFO・旧Mode `r`/`h`はエラーです。定義内のパラメータ区切りカンマは維持します。`@d`は-15～+15、`@d5`と`@d+5`は同値です。detuneの1単位=1 centは変更しません。
