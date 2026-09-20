import './style.css'
import workletUrl from './audio/worklet.ts?worker&url'
import { compile } from './mml/compile.ts'
import { SoundEngine } from './audio/engine.ts'
import { MmlError } from './mml/ast.ts'

const demo = `// 小さな音から、はじめよう。
track0 {
    @e1 {31,12,4,8,10,2}
    @e2 {31,18,8,12,8,0}
}

track1 {
    @s0 @e1 t128 o5 l8 q6 v12 p3
    [c e g >c< : g e]2
    (ce)4&(eg)4 g4 r4
}

track2 {
    @s0 @e2 t128 o3 l4 q5 v9 p5
    [c g]3 c2 r2
}`
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header class="masthead"><a class="brand" href="./"><span class="mark">m</span><span>MML <b>sound planter</b></span></a><span class="version">VERSION 0.1 <span class="dot"></span> SSG</span></header>
<main><section class="intro"><div class="eyebrow">WRITE A LITTLE. PLAY A LITTLE.</div><h1>文字から、音が芽吹く。</h1><p>思いついたメロディを、MMLで。小さな音の実験を楽しもう。</p></section>
<section class="workspace" aria-label="MMLサウンドエディタ"><div class="editor-heading"><div><span class="index">01</span><label for="source">メインMML</label><span class="sub">YOUR COMPOSITION</span></div><div class="files"><button id="load">↥ 読み込み</button><button id="save">↧ 保存</button></div></div>
<div class="source-wrap"><textarea id="source" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="source-hint"></textarea></div>
<div class="transport"><div class="transport-buttons"><button class="primary" id="play">▶ <span>再生</span></button><button id="stop">■ <span>停止</span></button></div><span id="source-hint">プレーンテキスト / 最大11トラック</span></div></section>
<section class="test-workspace"><div class="editor-heading"><div><span class="index">02</span><label for="test">テストMML</label><span class="sub">A SPACE TO EXPERIMENT</span></div><button id="test-play">▷ テスト再生</button></div><textarea id="test" rows="3" spellcheck="false" autocomplete="off" autocapitalize="off">@s0 @e1 o5 l8 c e g >c</textarea><div class="test-hint">短いフレーズを気軽に試奏。track0の定義を使えます。<span>保存には含まれません</span></div></section>
<div id="status" role="status" aria-live="polite"><span class="status-led"></span><span id="status-text">準備完了。再生してみましょう。</span></div>
<footer><span>気軽にMMLで楽しむ。</span><span>TEXT IN. SOUND OUT.</span></footer></main><input id="file" type="file" accept="text/plain,.txt,.mml" hidden>`
const source=document.querySelector<HTMLTextAreaElement>('#source')!
const test=document.querySelector<HTMLTextAreaElement>('#test')!
source.value=demo
const status=document.querySelector<HTMLDivElement>('#status')!
const statusText=document.querySelector<HTMLSpanElement>('#status-text')!
export function showStatus(text: string, error=false) { statusText.textContent=text; status.classList.toggle('error',error) }
let stop = () => {}; let generation=0
async function play(isTest: boolean) {
  const ticket=++generation; stop()
  try {
    const song=compile(source.value,isTest ? test.value : undefined)
    showStatus('音源を準備しています…')
    if (ticket !== generation) return
    const engine=new SoundEngine(workletUrl); stop=()=>engine.stop()
    await engine.play(song,()=>{if (ticket===generation) showStatus('演奏が終了しました。')},message=>{if(ticket===generation) showStatus(message,true)})
    if (ticket !== generation) { engine.stop(); return }
    showStatus(isTest ? 'テスト再生中' : 'メインMMLを再生中')
  } catch (error) {
    if (ticket !== generation) return
    stop()
    showStatus(error instanceof MmlError ? `${error.position.line}行 ${error.position.column}列：${error.message}` : error instanceof Error ? error.message : String(error),true)
  }
}
document.querySelector('#play')!.addEventListener('click',()=>void play(false))
document.querySelector('#test-play')!.addEventListener('click',()=>void play(true))
document.querySelector('#stop')!.addEventListener('click',()=>{generation++;stop();showStatus('停止しました。')})
const file=document.querySelector<HTMLInputElement>('#file')!
document.querySelector('#load')!.addEventListener('click',()=>file.click())
file.addEventListener('change',async()=>{const selected=file.files?.[0]; if (!selected) return; try { source.value=await selected.text(); showStatus(`${selected.name}を読み込みました。`) } catch { showStatus('ファイルを読み込めませんでした。',true) } file.value='' })
document.querySelector('#save')!.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([source.value],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='sound-planter.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showStatus('メインMMLを保存しました。')})
window.addEventListener('pagehide',()=>{generation++;stop()})
