import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Clapperboard, Sparkles, Coins, ChevronDown, Lock, Film, Layers, Shuffle } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Field, Seg, Chip, EmptyState, AspectIcon } from '../components/ui.jsx'
import { PromptBox, ModelPicker, CameraPicker, ImageUpload } from '../components/studio.jsx'
import { AssetCard } from '../components/shell.jsx'
import { VIDEO_MODELS, ASPECTS_VIDEO, EFFECTS } from '../data/catalog.js'
import { calcCost, hash } from '../lib/engine.js'

const MODES = ['Text to Video','Image to Video','Start & End Frame','Genjutsu Recast']

export default function VideoStudio() {
  const { enqueue, assets, credits, jobs, toast, liveMode, liveEstimate } = useApp()
  const loc = useLocation()
  const qs = useMemo(()=> new URLSearchParams(loc.search), [loc.search])
  const [mode, setMode] = useState('Text to Video')
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('seedance-2-5')
  const [motionId, setMotionId] = useState('slow-push-in')
  const [effectId, setEffectId] = useState(null)
  const [aspect, setAspect] = useState(ASPECTS_VIDEO[0])
  const [duration, setDuration] = useState(5)
  const [res, setRes] = useState('1080p')
  const [count, setCount] = useState(1)
  const [startImg, setStartImg] = useState(null)
  const [endImg, setEndImg] = useState(null)
  const [refVideo, setRefVideo] = useState(null)
  const [negative, setNegative] = useState('')
  const [seedLock, setSeedLock] = useState(false)
  const [seed, setSeed] = useState(424242)
  const [intensity, setIntensity] = useState(65)
  const [showFx, setShowFx] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  useEffect(()=>{
    const s = loc.state || {}
    if (s.prompt !== undefined) setPrompt(s.prompt || '')
    if (s.motionId) setMotionId(s.motionId)
    if (s.effectId !== undefined) { setEffectId(s.effectId); const e=EFFECTS.find(x=>x.id===s.effectId); if(e) setMotionId(e.motion) }
    const m = qs.get('model'); if (m && VIDEO_MODELS.some(x=>x.id===m)) setModelId(m)
    const cam = qs.get('camera'); if (cam) setMotionId(cam)
    const fx = qs.get('effect'); if (fx) { setEffectId(fx); const e=EFFECTS.find(x=>x.id===fx); if(e){ setMotionId(e.motion); setPrompt(p=> p || `${e.name} effect applied to my scene`) } }
  },[loc.key])

  const model = VIDEO_MODELS.find(m=>m.id===modelId) || VIDEO_MODELS[0]
  const effRes = model.res.includes(res) ? res : model.res[model.res.length-1]
  const cost = calcCost(model, duration, effRes, count)
  const liveEst = liveMode ? liveEstimate({ type:'video', modelId, duration, count, baseImage: startImg }) : null
  const effect = EFFECTS.find(e=>e.id===effectId)
  const myVideos = assets.filter(a=>a.type==='video')
  const running = jobs.filter(j=>j.status==='rendering' && j.type==='video')

  const generate = () => {
    if (!prompt.trim() && !startImg) { toast('Describe your shot first — or hit “Surprise me”', 'warn'); return }
    if (!liveMode && credits < cost) { toast(`This render needs ${cost} credits — you have ${credits}.`, 'warn'); return }
    const id = enqueue({
      type:'video', modelId, modelName:model.name, prompt: prompt.trim(), motionId, effectId,
      filter: effect?.filter, overlay: effect?.overlay, ratio: aspect.id, w: aspect.w, h: aspect.h,
      duration, res: effRes, count, cost, baseImage: startImg,
      seed: seedLock ? seed : hash(prompt + Date.now()), source: mode.toLowerCase(),
    })
    if (id) toast(liveMode ? `${model.name} is generating for REAL on your ${liveEst?.providerName || 'provider'} account (~$${liveEst?.usd?.toFixed(2) || '?'} est.)` : `${model.name} is rendering — ${cost} credits · ~${Math.max(20, Math.round(14000/model.speed))}s ETA`)
  }

  return (
    <div className="flex flex-col xl:flex-row min-h-full">
      {/* controls */}
      <div className="xl:w-[420px] shrink-0 border-r border-line bg-[#0c0c0e] p-5 xl:h-[calc(100vh-60px)] xl:sticky xl:top-[60px] xl:overflow-y-auto">
        <div className="flex items-center gap-2.5 mb-1"><span className="h-9 w-9 grid place-items-center rounded-xl bg-lime text-black"><Clapperboard size={18}/></span>
          <div><h1 className="font-black text-lg leading-none" style={{fontFamily:'Archivo'}}>CREATE VIDEO</h1><p className="text-[11px] text-zinc-500 mt-0.5">14 frontier models · 70+ camera moves</p></div></div>

        <div className="flex gap-1.5 mt-5 overflow-x-auto no-scrollbar">
          {MODES.map(m=><Chip key={m} active={mode===m} onClick={()=>setMode(m)}>{m}</Chip>)}
        </div>

        <div className="mt-5"><Field label="Prompt"><PromptBox value={prompt} onChange={setPrompt} mode="video" /></Field></div>

        {(mode==='Image to Video' || mode==='Start & End Frame') && (
          <div className={cx('grid gap-3', mode==='Start & End Frame' ? 'grid-cols-2' : '')}>
            <div><Field label="Start frame"><ImageUpload label="Start frame" value={startImg} onChange={setStartImg} compact={mode==='Start & End Frame'} /></Field></div>
            {mode==='Start & End Frame' && <div><Field label="End frame"><ImageUpload label="End frame" value={endImg} onChange={setEndImg} compact /></Field></div>}
          </div>
        )}
        {mode==='Genjutsu Recast' && (
          <Field label="Reference motion clip">
            <ImageUpload label="Reference clip poster" value={refVideo} onChange={setRefVideo} />
            <p className="text-[11px] text-zinc-500 mt-1.5 leading-snug">Genjutsu keeps the motion & camera — swaps characters, locations and products per your prompt.</p>
          </Field>
        )}

        <Field label="Model"><ModelPicker models={VIDEO_MODELS} value={modelId} onChange={(id)=>{setModelId(id); const m=VIDEO_MODELS.find(x=>x.id===id); if(m && duration>m.maxDur) setDuration(m.maxDur)}} label="Video model" /></Field>

        <Field label="Camera movement" right={<span className="text-[10px] font-bold text-lime bg-lime/10 border border-lime/25 rounded-md px-1.5 py-0.5">DoP ENGINE</span>}>
          <CameraPicker value={motionId} onChange={setMotionId} />
        </Field>

        <Field label="Effect" right={<Link to="/effects" className="text-[11px] font-bold text-lime hover:underline">Browse all 60+ →</Link>}>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={!effectId} onClick={()=>setEffectId(null)}>None</Chip>
            {EFFECTS.filter(e=>e.hot).map(e=><Chip key={e.id} active={effectId===e.id} onClick={()=>{setEffectId(e.id); setMotionId(e.motion)}}>{e.name}</Chip>)}
            <Chip onClick={()=>setShowFx(!showFx)}>{showFx ? 'Show fewer' : '+ More'}</Chip>
          </div>
          {showFx && <div className="flex flex-wrap gap-1.5 mt-2">{EFFECTS.filter(e=>!e.hot).slice(0,24).map(e=><Chip key={e.id} active={effectId===e.id} onClick={()=>{setEffectId(e.id); setMotionId(e.motion)}}>{e.name}</Chip>)}</div>}
        </Field>

        <Field label="Aspect ratio">
          <div className="flex gap-1.5 flex-wrap">{ASPECTS_VIDEO.map(a=>(
            <button key={a.id} onClick={()=>setAspect(a)} className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-bold transition', aspect.id===a.id ? 'bg-white text-black border-white' : 'bg-panel2 border-line text-zinc-300 hover:border-zinc-500')}>
              <AspectIcon ratio={a.id} active={aspect.id===a.id} />{a.id}
            </button>))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={`Duration · ${duration}s`}><input type="range" min={3} max={model.maxDur} step={1} value={duration} onChange={e=>setDuration(+e.target.value)} className="w-full" /></Field>
          <Field label={`Motion intensity · ${intensity}%`}><input type="range" min={0} max={100} value={intensity} onChange={e=>setIntensity(+e.target.value)} className="w-full" /></Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Resolution"><Seg options={model.res} value={effRes} onChange={setRes} size="sm" /></Field>
          <Field label="Variations"><Seg options={[1,2,4].map(n=>({id:n,label:'×'+n}))} value={count} onChange={setCount} size="sm" /></Field>
        </div>

        <button onClick={()=>setAdvanced(!advanced)} className="flex items-center gap-1.5 text-[12px] font-bold text-zinc-400 hover:text-white mb-3">Advanced <ChevronDown size={14} className={cx('transition', advanced && 'rotate-180')}/></button>
        {advanced && (<>
          <Field label="Negative prompt"><input value={negative} onChange={e=>setNegative(e.target.value)} placeholder="blurry, watermark, extra fingers…" className="w-full rounded-xl bg-panel2 border border-line px-3.5 py-2.5 text-sm placeholder:text-zinc-600" /></Field>
          <Field label="Seed">
            <div className="flex gap-2">
              <input type="number" value={seed} disabled={!seedLock} onChange={e=>setSeed(+e.target.value)} className="flex-1 rounded-xl bg-panel2 border border-line px-3.5 py-2.5 text-sm disabled:opacity-40" />
              <button onClick={()=>setSeedLock(!seedLock)} className={cx('flex items-center gap-1.5 rounded-xl border px-3 text-[12px] font-bold', seedLock ? 'bg-lime text-black border-lime' : 'bg-panel2 border-line')}><Lock size={12}/> Lock</button>
              <button onClick={()=>setSeed(Math.floor(Math.random()*999999))} className="rounded-xl border border-line bg-panel2 px-3 hover:border-zinc-500"><Shuffle size={14}/></button>
            </div>
          </Field>
        </>)}

        <div className="sticky bottom-0 bg-[#0c0c0e] pt-3 pb-1 -mx-1 px-1">
          <Btn kind="lime" className="w-full !py-3.5 !text-[15px]" onClick={generate}><Sparkles size={17}/> {liveMode ? 'Generate · REAL AI' : 'Generate'} <span className="inline-flex items-center gap-1 bg-black/15 rounded-full px-2 py-0.5 text-[12px] font-extrabold">{liveMode ? (liveEst ? `~$${liveEst.usd.toFixed(2)}` : 'no key') : <><Coins size={12}/>{cost}</>}</span></Btn>
          <p className="text-center text-[11px] text-zinc-600 mt-2">{liveMode ? (liveEst ? `Bills your ${liveEst.providerName} account · ${liveEst.endpoint} · app credits untouched` : 'Live video needs a fal.ai key — Settings → AI Providers') : `${credits.toLocaleString()} credits available`} · {running.length} rendering now</p>
        </div>
      </div>

      {/* results */}
      <div className="flex-1 p-5 min-w-0">
        <div className="flex items-center gap-2 mb-4"><Film size={17} className="text-zinc-500"/><h2 className="font-extrabold">Your renders</h2><span className="text-zinc-600 text-sm">{myVideos.length} videos</span>
          <Link to="/library" className="ml-auto text-[12px] font-bold text-lime hover:underline">Open library →</Link></div>
        {running.length>0 && (
          <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-3 mb-4">
            {running.map(j=>(
              <div key={j.id} className="relative rounded-2xl overflow-hidden border border-lime/30 aspect-video shimmer grid place-items-center">
                <div className="text-center px-5"><div className="text-3xl font-black tabular-nums" style={{fontFamily:'Archivo'}}>{Math.round(j.progress)}%</div>
                <p className="text-[12px] text-zinc-400 font-semibold mt-1 line-clamp-1">{j.prompt}</p>
                <p className="text-[11px] text-lime font-bold mt-0.5">{j.modelName} is dreaming…</p></div>
                <div className="absolute left-0 right-0 h-px bg-lime/70 shadow-[0_0_18px_#d9ff4a]" style={{animation:'scanline 2.2s linear infinite'}} />
              </div>
            ))}
          </div>
        )}
        {myVideos.length===0 && running.length===0
          ? <EmptyState icon={Clapperboard} title="No videos yet" sub="Write a prompt, pick a camera move, hit Generate. Your renders land here and in your Library — playable, remixable, exportable as real .webm files." />
          : <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-3">{myVideos.map(a=><AssetCard key={a.id} asset={a} ratioClass={a.ratio==='9:16'?'aspect-[4/5]':'aspect-video'} />)}</div>}
      </div>
    </div>
  )
}
