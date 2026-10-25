import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Play, Pause, Download, Heart, Share2, Repeat2, Film, Image as ImageIcon, Wand2, Volume2, VolumeX, Maximize, Camera, Hash, Clock, MonitorPlay, Loader2, Check } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, MotionImage, FxOverlay, Btn, ProgressBar, Logo } from './ui.jsx'
import { motionById, exportVideoWebM, downloadBlob, downloadImage, fmtTime } from '../lib/engine.js'
import { EFFECTS } from '../data/catalog.js'

export function PlayerModal() {
  const { playerAsset: a, setPlayerAsset, toggleFav, toast, assets } = useApp()
  const nav = useNavigate()
  const [playing, setPlaying] = useState(true)
  const [t, setT] = useState(0)
  const [showFx, setShowFx] = useState(true)
  const [exporting, setExporting] = useState(0)
  const [muted, setMuted] = useState(true)
  const wrapRef = useRef(null)
  const asset = a ? (assets.find(x=>x.id===a.id) || a) : null
  const dur = asset?.duration || 6

  useEffect(()=>{ setT(0); setPlaying(true); setExporting(0); setShowFx(true) },[a?.id])
  useEffect(()=>{
    if (!playing || !asset) return
    const iv = setInterval(()=> setT(v => (v + 0.1) % dur), 100)
    return ()=>clearInterval(iv)
  },[playing, asset?.id, dur])

  if (!asset) return null
  const eff = EFFECTS.find(e=>e.id===asset.effectId)
  const cam = motionById(asset.motionId)

  const doExport = async () => {
    try {
      setExporting(1)
      const blob = await exportVideoWebM({ imageUrl: asset.url, motion: cam.motion, duration: Math.min(dur, 10), filter: showFx? asset.filter:'none', overlay: showFx? asset.overlay:'none', onProgress: setExporting })
      downloadBlob(blob, `higgsfield-${asset.id}.webm`)
      setExporting(0); toast('Real .webm exported — rendered locally in your browser')
    } catch(e) { setExporting(0); toast('Export failed in this browser — try downloading the still instead', 'warn') }
  }
  const share = async () => {
    const text = `${window.location.origin}${window.location.pathname}#creation/${asset.id}`
    try { await navigator.clipboard.writeText(text); toast('Share link copied to clipboard') } catch { toast(text) }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/88 backdrop-blur-md" onClick={()=>setPlayerAsset(null)} />
      <div className="relative w-full max-w-6xl bg-panel border border-line rounded-3xl overflow-hidden shadow-2xl grid lg:grid-cols-[1fr_340px] max-h-[94vh]">
        <div className="relative bg-black flex flex-col">
          <div ref={wrapRef} className="relative grain flex-1 min-h-[300px] sm:min-h-[420px]">
            <MotionImage src={asset.url} motionId={asset.motionId} playing={playing} duration={dur} filter={showFx? asset.filter:'none'} className="absolute inset-0" />
            {showFx && <FxOverlay overlay={asset.overlay} />}
            <div className="absolute inset-0 vignette pointer-events-none z-[5]" />
            {asset.type==='video' && (
              <button onClick={()=>setPlaying(!playing)} className="absolute inset-0 z-[8] grid place-items-center group">
                {!playing && <span className="h-16 w-16 grid place-items-center rounded-full bg-lime text-black shadow-2xl"><Play size={26} className="ml-1"/></span>}
              </button>
            )}
            <span className="absolute top-3 left-3 z-[9] text-[10px] font-mono font-bold bg-black/60 border border-white/10 rounded-md px-2 py-1 text-zinc-300">
              {asset.modelName} · {asset.res || '1080p'} · {cam.name}
            </span>
            {!showFx && <span className="absolute top-3 right-3 z-[9] text-[10px] font-bold bg-white text-black rounded-md px-2 py-1">BEFORE FX</span>}
          </div>
          {asset.type==='video' && (
            <div className="px-4 py-3 bg-[#0e0e10] border-t border-line">
              <div className="flex items-center gap-3">
                <button onClick={()=>setPlaying(!playing)} className="h-9 w-9 grid place-items-center rounded-full bg-white text-black shrink-0">{playing ? <Pause size={16}/> : <Play size={16} className="ml-0.5"/>}</button>
                <span className="text-[11px] font-mono text-zinc-400 tabular-nums">{t.toFixed(1)}s</span>
                <input type="range" min={0} max={dur} step={0.1} value={t} onChange={e=>setT(+e.target.value)} className="flex-1" />
                <span className="text-[11px] font-mono text-zinc-500 tabular-nums">{dur}s</span>
                <button onClick={()=>setMuted(!muted)} className="text-zinc-400 hover:text-white">{muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button>
                <button onClick={()=>wrapRef.current?.requestFullscreen?.()} className="text-zinc-400 hover:text-white"><Maximize size={16}/></button>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-y-auto p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-lime">{asset.type==='video'?<Film size={13}/>:<ImageIcon size={13}/>} {asset.type} · {asset.source}</span>
            <button onClick={()=>setPlayerAsset(null)} className="text-zinc-500 hover:text-white"><X size={19}/></button>
          </div>
          <p className="mt-3 text-[15px] font-medium leading-relaxed">{asset.prompt || asset.label || 'Untitled creation'}</p>
          {asset.character && <p className="mt-2 text-xs text-zinc-500">Soul ID: <span className="text-zinc-200 font-bold">{asset.character}</span></p>}

          <div className="grid grid-cols-2 gap-2 mt-5 text-[12px]">
            {[['Model', asset.modelName],['Camera move', cam.name],['Effect', eff?.name || '—'],['Aspect', asset.ratio || '16:9'],['Seed', '#'+asset.seed],['Created', fmtTime(asset.createdAt)]].map(([k,v])=>(
              <div key={k} className="rounded-xl bg-panel2 border border-line px-3 py-2"><div className="text-zinc-600 font-bold uppercase text-[9px] tracking-wider">{k}</div><div className="font-semibold truncate mt-0.5">{v}</div></div>
            ))}
          </div>

          <button onClick={()=>setShowFx(!showFx)} className={cx('mt-4 w-full flex items-center justify-center gap-2 rounded-full border py-2.5 text-sm font-bold transition', showFx ? 'bg-panel3 border-line hover:border-zinc-500' : 'bg-white text-black border-white')}>
            <Wand2 size={15}/> {showFx ? 'Compare: view before FX' : 'Showing original — tap for FX'}
          </button>

          <div className="grid grid-cols-4 gap-2 mt-3">
            <button onClick={()=>toggleFav(asset.id)} className={cx('flex flex-col items-center gap-1 rounded-2xl border border-line bg-panel2 py-2.5 text-[11px] font-bold hover:border-zinc-500 transition', asset.fav && 'text-red-400 border-red-500/40')}><Heart size={16} fill={asset.fav?'currentColor':'none'}/>Like</button>
            <button onClick={share} className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-panel2 py-2.5 text-[11px] font-bold hover:border-zinc-500 transition"><Share2 size={16}/>Share</button>
            <button onClick={()=>downloadImage(asset.url,'higgsfield-'+asset.id+'.jpg')} className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-panel2 py-2.5 text-[11px] font-bold hover:border-zinc-500 transition"><Download size={16}/>Still JPG</button>
            <button onClick={()=>{ setPlayerAsset(null); nav(asset.type==='video'?'/video':'/image', { state:{ prompt:asset.prompt, motionId:asset.motionId, effectId:asset.effectId } }) }} className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-panel2 py-2.5 text-[11px] font-bold hover:border-zinc-500 transition"><Repeat2 size={16}/>Remix</button>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <button onClick={()=>{
              if (credits < 4) { toast('Upscale needs 4 credits', 'warn'); return }
              enqueue({ type: asset.type, modelId: asset.type==='video' ? 'seedance-2-5' : 'nano-banana-pro', modelName:'Upscale 4K', prompt:(asset.prompt||'Untitled')+' — 4K detail-enhanced', motionId: asset.motionId, effectId: asset.effectId, filter: asset.filter, overlay: asset.overlay, ratio: asset.ratio, w:1600, h:900, duration: asset.duration, res:'4K', cost:4, baseImage: asset.url, seed: asset.seed, source:'upscale' })
              toast('4K upscale queued')
            }} className="rounded-full border border-line bg-panel2 py-2.5 text-[13px] font-bold hover:border-lime/60 transition">Upscale to 4K · 4cr</button>
            <button disabled={asset.type!=='video'} onClick={()=>{
              if (credits < 10) { toast('Extend needs 10 credits', 'warn'); return }
              enqueue({ type:'video', modelId:'seedance-2-5', modelName:'Video Extend', prompt:(asset.prompt||'Untitled')+' — extended cut, story continues', motionId: asset.motionId, effectId: asset.effectId, filter: asset.filter, overlay: asset.overlay, ratio: asset.ratio, w:1280, h:720, duration: Math.min(25,(asset.duration||5)+5), res: asset.res||'1080p', cost:10, baseImage: asset.url, seed: asset.seed+5, source:'extend' })
              toast('Extending your clip by 5 seconds…')
            }} className="rounded-full border border-line bg-panel2 py-2.5 text-[13px] font-bold hover:border-lime/60 transition disabled:opacity-35">{asset.type==='video' ? 'Extend +5s · 10cr' : 'Extend (video only)'}</button>
          </div>

          {asset.type==='video' && (
            <div className="mt-4 rounded-2xl border border-lime/30 bg-lime/5 p-3.5">
              <div className="flex items-center gap-2 text-sm font-bold"><MonitorPlay size={15} className="text-lime"/> Export real video file</div>
              <p className="text-[12px] text-zinc-400 mt-1 leading-snug">Renders the camera move + grade to an actual .webm in your browser. No watermark on your plan.</p>
              {exporting>0 ? (<div className="mt-3"><ProgressBar value={exporting}/><p className="text-[11px] text-zinc-400 mt-1.5 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin"/> Rendering frames… {exporting}%</p></div>)
                : <Btn kind="lime" className="w-full mt-3" onClick={doExport}><Download size={15}/> Download .WEBM</Btn>}
            </div>
          )}
          <div className="mt-auto pt-4 text-[11px] text-zinc-600 flex items-center gap-1.5"><Hash size={11}/> Job {asset.id} · Higgsfield render farm (browser node)</div>
        </div>
      </div>
    </div>
  )
}

export function AuthModal() {
  const { authOpen, setAuthOpen, setUser, setCredits, toast } = useApp()
  const [email, setEmail] = useState(''); const [name, setName] = useState('')
  if (!authOpen) return null
  const finish = (n, e) => { setUser({ name: n || e.split('@')[0] || 'Creator', email: e }); setCredits(c=>c+50); setAuthOpen(false); toast(`Welcome to Higgsfield — 50 bonus credits added`) }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={()=>setAuthOpen(false)} />
      <div className="relative w-full max-w-md bg-panel border border-line rounded-3xl p-7 shadow-2xl">
        <button onClick={()=>setAuthOpen(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X size={18}/></button>
        <Logo />
        <h2 className="text-2xl font-black mt-5" style={{fontFamily:'Archivo'}}>Create without limits</h2>
        <p className="text-sm text-zinc-500 mt-1">Sign up and get your extra discount + 50 bonus credits.</p>
        <button onClick={()=>finish('Alex Rivera','alex@example.com')} className="mt-6 w-full flex items-center justify-center gap-2.5 rounded-full bg-white text-black font-bold py-3 text-sm hover:bg-zinc-200 transition">
          <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.5h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-2 3.3-4.9 3.3-8.2Z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9Z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.3 1.6l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9c.9-2.6 3.3-4.5 6.2-4.5Z"/></svg>
          Continue with Google
        </button>
        <div className="flex items-center gap-3 my-5 text-[11px] font-bold text-zinc-600"><span className="flex-1 h-px bg-line"/>OR WITH EMAIL<span className="flex-1 h-px bg-line"/></div>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Display name" className="w-full rounded-xl bg-panel2 border border-line px-4 py-3 text-sm mb-2 placeholder:text-zinc-600" />
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@studio.com" type="email" className="w-full rounded-xl bg-panel2 border border-line px-4 py-3 text-sm placeholder:text-zinc-600" />
        <Btn kind="lime" className="w-full mt-4 !py-3" disabled={!email.includes('@')} onClick={()=>finish(name,email)}>Create free account</Btn>
        <p className="text-[11px] text-zinc-600 text-center mt-4 leading-relaxed">Demo auth — stored locally in your browser. By continuing you agree to make cool stuff only.</p>
      </div>
    </div>
  )
}
