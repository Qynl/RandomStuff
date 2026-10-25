import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Play, Square, Sparkles, Coins, Mic, Wand2, Captions } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Field, Chip, EmptyState } from '../components/ui.jsx'
import { AssetCard } from '../components/shell.jsx'
import { AVATARS, VOICES } from '../data/catalog.js'

const EMOTIONS = ['Natural','Excited','Calm','Serious','Whisper','Sales Energy','Deadpan','Inspirational']
const SCRIPTS = [
  'Hey, quick question — what if your next viral video didn’t need a camera, a crew, or even you on set? That’s exactly what we built.',
  'I’ve tried every productivity app on the store. This is the first one that survived my Monday. Let me show you why.',
  'Three years ago I was filming product videos on my kitchen table. Today my AI twin closes sales while I sleep.',
]

export default function Speak() {
  const { enqueue, assets, credits, toast, liveMode } = useApp()
  const [avatar, setAvatar] = useState(AVATARS[0])
  const [voiceId, setVoiceId] = useState('maya')
  const [script, setScript] = useState(SCRIPTS[0])
  const [emotion, setEmotion] = useState('Natural')
  const [speaking, setSpeaking] = useState(false)
  const [wordIdx, setWordIdx] = useState(-1)
  const [mouth, setMouth] = useState(0)
  const [bg, setBg] = useState('Studio')
  const [captions, setCaptions] = useState(true)
  const words = useMemo(()=> script.trim().split(/\s+/).filter(Boolean), [script])
  const secs = Math.max(3, Math.round(words.length / 2.5))
  const cost = Math.ceil(secs / 30) * 3 + 2
  const voice = VOICES.find(v=>v.id===voiceId) || VOICES[0]
  const myTalks = assets.filter(a=>a.source==='speak')

  useEffect(()=>{
    if (!speaking) { setMouth(0); return }
    const iv = setInterval(()=> setMouth(0.25 + Math.random()*0.75), 95)
    return ()=>clearInterval(iv)
  },[speaking])
  useEffect(()=>()=> window.speechSynthesis?.cancel(),[])

  const preview = () => {
    if (speaking) { window.speechSynthesis?.cancel(); setSpeaking(false); setWordIdx(-1); return }
    if (!('speechSynthesis' in window)) { toast('Your browser has no speech engine — generation still works', 'warn'); return }
    const u = new SpeechSynthesisUtterance(script)
    const vs = window.speechSynthesis.getVoices()
    const pick = vs.find(v=> voice.gender==='F' ? /female|samantha|zira|google us english/i.test(v.name) && v.lang.startsWith('en') : /male|david|daniel|google uk english male/i.test(v.name) && v.lang.startsWith('en'))
      || vs.find(v=>v.lang.startsWith('en')) || vs[0]
    if (pick) u.voice = pick
    u.pitch = voice.pitch * (emotion==='Whisper' ? .9 : emotion==='Excited' ? 1.15 : 1)
    u.rate = voice.rate * (emotion==='Excited' ? 1.12 : emotion==='Calm' ? .88 : 1)
    u.onboundary = (e) => { if (e.charIndex != null) setWordIdx(script.slice(0, e.charIndex).split(/\s+/).length - 1) }
    u.onend = u.onerror = () => { setSpeaking(false); setWordIdx(-1) }
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); setSpeaking(true); setWordIdx(0)
  }

  const generate = () => {
    if (!script.trim()) { toast('Write a script first', 'warn'); return }
    if (!liveMode && credits < cost) { toast(`Speak needs ${cost} credits`, 'warn'); return }
    const id = enqueue({ type:'video', modelId:'seedance-2-5', modelName:'Speak · Sync Engine', prompt:`${avatar.name} says: “${script.slice(0,120)}…” (${emotion.toLowerCase()} delivery, ${bg.toLowerCase()} background)`,
      motionId:'anamorphic-breathing', ratio:'9:16', w:720, h:1280, duration: Math.min(secs,15), res:'1080p', cost, seed: avatar.id.length*131 + words.length, source:'speak', character: avatar.name, baseImage: avatar.img })
    if (id) toast('Lip-sync render queued — audio, performance and captions included')
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <header className="flex items-center gap-3">
        <span className="h-11 w-11 grid place-items-center rounded-2xl bg-lime text-black"><AudioLines size={21}/></span>
        <div><h1 className="font-black text-2xl tracking-tight" style={{fontFamily:'Archivo'}}>SPEAK</h1>
        <p className="text-[12px] text-zinc-500">Talking videos with studio lip-sync. Preview uses your real browser voice engine.</p></div>
      </header>

      <div className="grid lg:grid-cols-[1fr_430px] gap-5 mt-6">
        <div>
          <Field label="Pick your presenter">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {AVATARS.map(a=>(
                <button key={a.id} onClick={()=>{setAvatar(a); setVoiceId(a.voice)}} className={cx('rounded-2xl border overflow-hidden text-left transition group', avatar.id===a.id ? 'border-lime ring-1 ring-lime' : 'border-line hover:border-zinc-500')}>
                  <img src={a.img} alt={a.name} className="aspect-square w-full object-cover group-hover:scale-105 transition" />
                  <span className="block p-2 bg-panel2"><b className="text-[12px] block truncate">{a.name}</b><span className="text-[10px] text-zinc-500 line-clamp-1">{a.role}</span></span>
                </button>))}
            </div>
          </Field>

          <Field label={`Script · ~${secs}s · ${words.length} words`} right={
            <button onClick={()=>setScript(s => s ? s.replace(/\.$/,'') + ' — and honestly, the results speak for themselves. Link is right there when you’re ready.' : SCRIPTS[1])} className="inline-flex items-center gap-1 text-[11px] font-bold text-lime hover:underline"><Wand2 size={12}/> Punch it up</button>}>
            <textarea value={script} onChange={e=>setScript(e.target.value)} rows={5} placeholder="Type what your presenter should say…" className="w-full rounded-2xl bg-panel2 border border-line p-4 text-[15px] leading-relaxed resize-none placeholder:text-zinc-600" />
            <div className="flex flex-wrap gap-1.5 mt-2">{SCRIPTS.map((s,i)=><button key={i} onClick={()=>setScript(s)} className="text-[11px] font-bold rounded-full bg-panel3 border border-line px-2.5 py-1 text-zinc-400 hover:text-white hover:border-zinc-500">Template {i+1}</button>)}</div>
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Voice"><div className="grid grid-cols-2 gap-1.5 max-h-[168px] overflow-y-auto pr-1">
              {VOICES.map(v=><button key={v.id} onClick={()=>setVoiceId(v.id)} className={cx('rounded-xl border px-2.5 py-2 text-left transition', voiceId===v.id?'bg-lime text-black border-lime':'bg-panel2 border-line hover:border-zinc-500')}><b className="text-[12px] block">{v.name}</b><span className={cx('text-[10px] line-clamp-1', voiceId===v.id?'text-black/60':'text-zinc-500')}>{v.desc}</span></button>)}
            </div></Field>
            <div>
              <Field label="Emotion"><div className="flex flex-wrap gap-1.5">{EMOTIONS.map(e=><Chip key={e} active={emotion===e} onClick={()=>setEmotion(e)}>{e}</Chip>)}</div></Field>
              <Field label="Background"><div className="flex flex-wrap gap-1.5">{['Studio','Loft','Street','Beach','Office','Neon City'].map(b=><Chip key={b} active={bg===b} onClick={()=>setBg(b)}>{b}</Chip>)}</div></Field>
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none"><input type="checkbox" checked={captions} onChange={e=>setCaptions(e.target.checked)} className="accent-[#d9ff4a] h-4 w-4"/> <Captions size={15} className="text-zinc-400"/> Burn-in animated captions</label>
            </div>
          </div>
        </div>

        {/* stage */}
        <div>
          <div className="relative rounded-[28px] overflow-hidden border border-line bg-gradient-to-b from-panel3 to-black aspect-[9/14] max-h-[640px] w-full grain">
            <img src={`https://picsum.photos/seed/bg-${bg}/720/1120`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 blur-[2px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
            <div className="absolute inset-x-0 top-7 flex flex-col items-center">
              <div className="relative">
                <img src={avatar.img} alt={avatar.name} className="h-44 w-44 sm:h-52 sm:w-52 rounded-full object-cover border-4 border-white/15 shadow-2xl" style={{ transform:`scale(${1 + mouth*0.012})` }} />
                <span className="absolute left-1/2 -translate-x-1/2 rounded-full bg-[#3a1d22] border border-black/50 transition-all duration-75" style={{ bottom:'24%', width: 26, height: 4 + mouth*13 }} />
                {speaking && <span className="absolute -inset-3 rounded-full border-2 border-lime/50" style={{animation:'pulse-dot 1s infinite'}} />}
              </div>
              <p className="mt-4 font-extrabold">{avatar.name}</p>
              <p className="text-[11px] text-zinc-400">{voice.name} · {emotion}</p>
              <div className="flex items-end gap-[3px] h-7 mt-4">{Array.from({length:24},(_,i)=><span key={i} className="w-[3px] rounded bg-lime origin-bottom" style={{height:'100%', transform:`scaleY(${speaking ? 0.25+Math.abs(Math.sin(i*1.7+mouth*9))*.75 : .14})`, opacity: speaking?1:.4}} />)}</div>
            </div>
            {captions && (
              <div className="absolute inset-x-0 bottom-0 p-5 text-center">
                <p className="text-[19px] leading-snug font-extrabold drop-shadow-[0_2px_10px_rgba(0,0,0,.9)]" style={{fontFamily:'Archivo'}}>
                  {words.slice(Math.max(0,wordIdx-2), Math.max(6, wordIdx+4)).map((w,i)=>{ const gi = Math.max(0,wordIdx-2)+i; return <span key={i} className={gi===wordIdx && speaking ? 'text-lime' : 'text-white'}>{w} </span> })}
                  {!speaking && words.length===0 && <span className="text-zinc-500">Your captions appear here</span>}
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <Btn kind="white" className="flex-1 !py-3" onClick={preview}>{speaking ? <><Square size={15}/> Stop preview</> : <><Play size={15}/> Preview voice</>}</Btn>
            <Btn kind="lime" className="flex-1 !py-3" onClick={generate}><Sparkles size={15}/> Generate · <Coins size={13}/>{cost}</Btn>
          </div>
          <p className="text-[11px] text-zinc-600 text-center mt-2">Preview = live browser TTS. Generate = full lip-sync video render.</p>
        </div>
      </div>

      <h3 className="font-extrabold mt-8 mb-3 flex items-center gap-2"><Mic size={16} className="text-zinc-500"/> Your talking videos <span className="text-zinc-600 font-semibold text-sm">{myTalks.length}</span></h3>
      {myTalks.length===0 ? <EmptyState icon={AudioLines} title="Nothing spoken yet" sub="Pick a presenter, write a script, preview the voice for real, then render the lip-synced video." />
        : <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-6 gap-3">{myTalks.map(a=><AssetCard key={a.id} asset={a} ratioClass="aspect-[3/4]" />)}</div>}
    </div>
  )
}
