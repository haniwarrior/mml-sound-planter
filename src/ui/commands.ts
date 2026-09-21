export interface CommandHelp { id:string; section:'definition'|'performance'; symbol:string; label:string; detail:string }
export const commands:CommandHelp[] = [
  {
    "id": "5-1",
    "section": "performance",
    "symbol": "t",
    "label": "テンポ",
    "detail": "書式\ntN\n\n設定範囲\n1〜255\n\nデフォルト\n128\n\n説明\n4分音符を基準としたBPMを指定します。\n\n例\nt120"
  },
  {
    "id": "5-2",
    "section": "performance",
    "symbol": "o",
    "label": "オクターブ",
    "detail": "書式\noN\n\n設定範囲\n1〜8\n\nデフォルト\n4\n\n説明\n以降の音符のオクターブを指定します。\n\n例\no5"
  },
  {
    "id": "5-3",
    "section": "performance",
    "symbol": ">",
    "label": "オクターブ上げ",
    "detail": "書式\n>\n>N\n\n設定範囲\n変更後のオクターブが1〜8に収まる範囲\n\n説明\nオクターブを上げます。\n数値を省略した場合は1オクターブ上げます。\n\n例\n>\n>2"
  },
  {
    "id": "5-4",
    "section": "performance",
    "symbol": "<",
    "label": "オクターブ下げ",
    "detail": "書式\n<\n<N\n\n設定範囲\n変更後のオクターブが1〜8に収まる範囲\n\n説明\nオクターブを下げます。\n数値を省略した場合は1オクターブ下げます。\n\n例\n<\n<2"
  },
  {
    "id": "5-5",
    "section": "performance",
    "symbol": "l",
    "label": "標準音長",
    "detail": "書式\nlN\n\n設定範囲\n1〜128\n\nデフォルト\n4\n\n説明\n音符・休符の音長指定を省略した場合に使われる標準音長です。\n\n例\nl8"
  },
  {
    "id": "5-6",
    "section": "performance",
    "symbol": "v",
    "label": "音量",
    "detail": "書式\nvN\n\n設定範囲\n0〜15\n\nデフォルト\n12\n\n説明\n音量を指定します。\n@v と v は同じ音量状態を変更し、後から指定した方が有効です。\n\n換算\nvN = @v(N × 8)\n\n例\nv12"
  },
  {
    "id": "5-7",
    "section": "performance",
    "symbol": "@v",
    "label": "詳細音量",
    "detail": "書式\n@vN\n\n設定範囲\n0〜127\n\nデフォルト\n@v96（v12相当）\n\n説明\nv より細かい単位で音量を指定します。\nv と @v は同じ音量状態を変更し、後から指定した方が有効です。\n\n例\n@v100"
  },
  {
    "id": "5-8",
    "section": "performance",
    "symbol": "q",
    "label": "ゲートタイム",
    "detail": "書式\nqN\n\n設定範囲\n1〜8\n\nデフォルト\n8\n\n説明\n音符の実際の発音時間を指定します。\n\nq1 = 12.5%\nq2 = 25%\nq3 = 37.5%\nq4 = 50%\nq5 = 62.5%\nq6 = 75%\nq7 = 87.5%\nq8 = 100%"
  },
  {
    "id": "5-9",
    "section": "performance",
    "symbol": "p",
    "label": "パン",
    "detail": "書式\npN\n\n設定範囲\n0〜8\n\nデフォルト\n4\n\n説明\n左右の定位を指定します。\n\n0 = 左\n4 = 中央\n8 = 右"
  },
  {
    "id": "5-10",
    "section": "performance",
    "symbol": "@d",
    "label": "デチューン",
    "detail": "書式\n@dN\n\n設定範囲\n-15〜+15\n\nデフォルト\n0\n\n説明\n音程を微調整します。\n正数の + は省略可能です。\n\n例\n@d-5\n@d5\n@d+5"
  },
  {
    "id": "5-11",
    "section": "performance",
    "symbol": "@s",
    "label": "SSG音源",
    "detail": "書式\n@sN\n\n設定範囲\n0\n1〜31\n101〜131\n\n説明\nSSGの発音モードを指定します。\n\n@s0\nトーン\n\n@s1〜@s31\nノイズ\n数値はNoise Periodです。\n音符の音程は使用しません。\n\n@s101〜@s131\nトーン + ノイズ\nN-100 がNoise Periodです。\nトーン側の音程は有効です。"
  },
  {
    "id": "5-12",
    "section": "performance",
    "symbol": "@e",
    "label": "エンベロープ",
    "detail": "書式\n@eN\n\nデフォルト\n@e0\n\n説明\ntrack0で定義したソフトウェアエンベロープを選択します。\n\n@e0\nエンベロープOFF\n\n未定義番号を指定するとエラーになります。"
  },
  {
    "id": "5-13",
    "section": "performance",
    "symbol": "@f",
    "label": "FM音色",
    "detail": "書式\n@fN\n\n設定範囲\n0〜127\n\n説明\ntrack0で定義したFM音色を選択します。\n\n未定義番号を使用するとエラーになります。"
  },
  {
    "id": "5-14",
    "section": "performance",
    "symbol": "@lv",
    "label": "ビブラート",
    "detail": "書式\n@lvN\n\nデフォルト\n@lv0\n\n説明\ntrack0で定義したビブラートLFOを選択します。\n\n@lv0\nビブラートOFF\n\nNoise onlyでは無効です。\nToneおよびFMでは有効です。\nTone + NoiseではTone側にのみ適用されます。"
  },
  {
    "id": "5-15",
    "section": "performance",
    "symbol": "@lt",
    "label": "トレモロ",
    "detail": "書式\n@ltN\n\nデフォルト\n@lt0\n\n説明\ntrack0で定義したトレモロLFOを選択します。\n\n@lt0\nトレモロOFF\n\nSSG Tone / Noise / Tone+Noise / FMすべてに適用できます。"
  },
  {
    "id": "5-16",
    "section": "performance",
    "symbol": "[]",
    "label": "ループ",
    "detail": "書式\n[ ... ]N\n\n設定範囲\n0〜255\n\n省略時\n2回\n\n説明\n括弧内を指定回数繰り返します。\n\nN=0\n無限ループ\n\nN=1\n1回だけ実行\n\n入れ子可能です。"
  },
  {
    "id": "5-17",
    "section": "performance",
    "symbol": ":",
    "label": "ループ脱出",
    "detail": "書式\n[ ... : ... ]N\n\n説明\n有限ループの最終回だけ、: 以降を飛ばしてループを終了します。\n\n1つのループ内で使用できる : は1個までです。\n無限ループ []0 では使用できません。"
  },
  {
    "id": "5-18",
    "section": "performance",
    "symbol": "&",
    "label": "タイ／レガート",
    "detail": "書式\nc4&c4\nc4&d4\n(ce)4&(ed)4\n\n説明\n前後の発音をkey-offせず接続します。\n\n同音程ではタイ、\n異なる音程ではレガートとして動作します。\n\n& が続く間は途中でqによるkey-offを行いません。\n休符またはトラック終了でkey-offします。"
  },
  {
    "id": "5-19",
    "section": "performance",
    "symbol": "()",
    "label": "ポルタメント",
    "detail": "書式\n(cd)4\n(ce)4.\n(ce)4&(ed)4\n\n説明\n開始音から終了音まで、指定音長の間に連続して音程を変化させます。\n\n音長を省略した場合は現在の l を使用します。\n付点指定も可能です。\n\n括弧内には開始音と終了音を指定します。"
  },
  {
    "id": "5-20",
    "section": "performance",
    "symbol": "+",
    "label": "シャープ",
    "detail": "書式\nc+\n\n説明\n直前の音符を半音上げます。\n1音につき1個まで指定できます。"
  },
  {
    "id": "5-21",
    "section": "performance",
    "symbol": "-",
    "label": "フラット",
    "detail": "書式\nd-\n\n説明\n直前の音符を半音下げます。\n1音につき1個まで指定できます。"
  },
  {
    "id": "5-22",
    "section": "performance",
    "symbol": ".",
    "label": "付点",
    "detail": "書式\nc4.\nc4..\n(ce)4.\n\n説明\n音長を付点音符にします。\n\n1個目 = 元の音長の1/2を追加\n2個目 = さらに1/4を追加\n3個目 = さらに1/8を追加\n\n複数指定可能です。"
  },
  {
    "id": "5-23",
    "section": "performance",
    "symbol": "//",
    "label": "コメント",
    "detail": "書式\n// コメント\n\n説明\n// から行末までをコメントとして無視します。\n\n行頭だけでなくMMLの後ろにも書けます。"
  },
  {
    "id": "5-24",
    "section": "performance",
    "symbol": "$name$",
    "label": "マクロ",
    "detail": "書式\n$name$\n\n説明\ntrack0で定義したマクロを呼び出します。\n\nマクロ内で変更されたオクターブ・音量・音源・LFO等の状態は、呼び出し後も継続します。\n\n& はマクロ境界を越えて接続できます。"
  },
  {
    "id": "6-1",
    "section": "definition",
    "symbol": "@e",
    "label": "エンベロープ定義",
    "detail": "書式\n@eN {AR,DR,SR,RR,SL,KS}\n\n定義場所\ntrack0\n\n番号\nN > 0\n0はOFF用のため定義不可\n\nパラメータ順\nAR, DR, SR, RR, SL, KS\n\n設定範囲\nAR  0〜31\nDR  0〜31\nSR  0〜31\nRR  0〜15\nSL  0〜15\nKS  0〜3\n\n説明\nSSG / Noise / FM最終出力に適用できるソフトウェアエンベロープを定義します。"
  },
  {
    "id": "6-2",
    "section": "definition",
    "symbol": "@lv",
    "label": "ビブラート定義",
    "detail": "書式\n@lvN {Depth,Period,Delay,Mode}\n\n定義場所\ntrack0\n\n番号\nN > 0\n0はOFF用のため定義不可\n\nパラメータ順\nDepth, Period, Delay, Mode\n\n設定範囲\nDepth  -127〜+127\nPeriod 1〜255\nDelay  0〜255\nMode   0〜1\n\nDepth\n正数の + は省略可能です。\n符号が開始方向を表します。\n絶対値が変調の深さです。\n\n最大変調量\n±1オクターブ\n\nPeriod / Delay\n1単位 = 0.025秒\n\nMode\n0 = repeat\n1 = hold"
  },
  {
    "id": "6-3",
    "section": "definition",
    "symbol": "@lt",
    "label": "トレモロ定義",
    "detail": "書式\n@ltN {Depth,Period,Delay,Mode}\n\n定義場所\ntrack0\n\n番号\nN > 0\n0はOFF用のため定義不可\n\nパラメータ順\nDepth, Period, Delay, Mode\n\n設定範囲\nDepth  -127〜+127\nPeriod 1〜255\nDelay  0〜255\nMode   0〜1\n\nDepth\n正数の + は省略可能です。\n符号が開始方向を表します。\n絶対値が変調の深さです。\n\nPeriod / Delay\n1単位 = 0.025秒\n\nMode\n0 = repeat\n1 = hold"
  },
  {
    "id": "6-4",
    "section": "definition",
    "symbol": "@f",
    "label": "FM音色定義",
    "detail": "書式\n@fN {\n  42個の数値\n}\n\n定義場所\ntrack0\n\n音色番号\n0〜127\n\nデータ順\nAL, FB,\n\nOP1:\nAR, DR, SR, RR, SL, TL, KS, ML, DT1, DT2,\n\nOP2:\nAR, DR, SR, RR, SL, TL, KS, ML, DT1, DT2,\n\nOP3:\nAR, DR, SR, RR, SL, TL, KS, ML, DT1, DT2,\n\nOP4:\nAR, DR, SR, RR, SL, TL, KS, ML, DT1, DT2\n\n実データ内にはOP1等のラベルは書きません。\n\nOP対応\nOP1 = M1\nOP2 = C1\nOP3 = M2\nOP4 = C2\n\n設定範囲\nAL  0〜7\nFB  0〜7\nAR  0〜31\nDR  0〜31\nSR  0〜31\nRR  0〜15\nSL  0〜15\nTL  0〜127\nKS  0〜3\nML  0〜15\nDT1 0〜7\nDT2 0〜3\n\n説明\nYM2151 / OPM相当の4オペレータFM音色を定義します。\nAL 0〜7の接続とFBはYM2151準拠です。"
  },
  {
    "id": "6-5",
    "section": "definition",
    "symbol": "$name$",
    "label": "マクロ定義",
    "detail": "書式\n$name$ {\n  ...\n}\n\n定義場所\ntrack0\n\n名前\n1〜16文字\n\n使用可能文字\nA-Z\na-z\n0-9\n_\n+\n-\n\n大文字小文字\n区別しません。\n\n説明\n繰り返し使用するMMLを定義します。\n\n別のマクロを呼び出すこともできますが、\n直接・間接を問わず循環参照は禁止です。\n\nマクロ内の状態変更は呼び出し後も継続します。"
  }
]
// Keep the explicit @command group first, then ordinary commands and Unicode-ordered symbols.
export function orderedCommands(section:CommandHelp['section']):CommandHelp[] {
  const group=(s:string)=>/^\d/.test(s) ? 0 : s.startsWith('@') ? 1 : /^[a-z]/i.test(s) ? 2 : 3
  const result=commands.filter(c=>c.section===section && c.symbol!==':').sort((a,b)=>{
    const rank=group(a.symbol)-group(b.symbol)
    const x=a.symbol.replace(/^@/,''),y=b.symbol.replace(/^@/,'')
    return rank || (x<y ? -1 : x>y ? 1 : 0)
  })
  const colon=commands.find(c=>c.section===section && c.symbol===':')
  if(colon) result.splice(result.findIndex(c=>c.symbol==='[]')+1,0,colon)
  return result
}
