import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Film, Bot, Sparkles, Play, Plus, Trash2, Download, Coins, Camera, Aperture, ChevronDown, X, Loader2, Clapperboard, Save } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Field, Seg, Chip, Modal, MotionImage, ProgressBar } from '../components/ui.jsx'
import { CINEMA, CAMERA_PRESETS, VIDEO_MODELS } from '../data/catalog.js'
import { shotBreakdown, seedImg, hash, motionById, exportVideoWebM, downloadBlob, calcCost } from '../lib/engine.js'

const shotImg = (shot) => seedImg('hf'+hash(shot.seed), 960, 540)

export default function CinemaStudio() {
  const { enqueue, jobs, credits, toast } = useApp()
  const [title, setTitle] = useState(()=> localStorage.getItem('hf_cinema_title') || 'Untitled Short')
  const [story, setStory] = useState(()=> localStorage.getItem('hf_cinema_story') || '')
  const [genre, setGenre] = useState('General')
  const [body, setBody] = useState(CINEMA.bodies[0])
  const [lens, setLens] = useState(CINEMA.lenses[0])
  const [focal, setFocal] = useState(35)
  const [aperture, setAperture] = useState('T1.8')
  const [ramp, setRamp] = useState('None')
  const [modelId, setModelId] = useState('dop-turbo')
  const [shots, setShots] = useState(()=>{ try { return JSON.parse(localStorage.getItem('hf_cinema_shots')||'[]') } catch { return [] } })
  const [thinking, setThinking] = useState(false)
  const [playingSeq, setPlayingSeq] = useState(false)
  const [exporting, setExporting] = useState(0)
  const model = VIDEO_MODELS.find(m=>m.id===modelId)
  const totalDur = shots.reduce((a,s)=>a+s.duration,0)
  const readyCount = shots.filter(s=>s.status==='ready').length

  useEffect(()=>{ localStorage.setItem('hf_cinema_shots', JSON.stringify(shots)); localStorage.setItem('hf_cinema_title', title); localStorage.setItem('hf_cinema_story', story) },[shots,title,story])
  useEffect(()=>{
    setShots(prev => prev.map(s => {
      if (s.status!=='rendering' || !s.jobId) return s
      const j = jobs.find(x=>x.id===s.jobId)
      return j?.status==='done' ? { ...s, status:'ready' } : s
    }))
  },[jobs])

  const breakdown = () => {
    if (!story.trim()) { toast('Give Mr. Higgs a story first — one paragraph is plenty', 'warn'); return }
    setThinking(true)
    setTimeout(()=>{ setShots(shotBreakdown(story, genre, focal)); setThinking(false); toast(`Mr. Higgs broke “${title}” into ${shotBreakdown(story,genre).length} shots`) }, 1300)
  }

  const genShot = (shot) => {
    const cost = calcCost(model, shot.duration, '1080p', 1)
    if (credits < cost) { toast(`Shot ${shot.n} needs ${cost} credits`, 'warn'); return }
    const jobId = enqueue({ type:'video', modelId, modelName:model.name, prompt:`[${title} · Shot ${shot.n}: ${shot.name}] ${shot.prompt} — ${body}, ${lens} ${shot.focal}mm ${aperture}, ${genre} genre${ramp!=='None'?`, speed ramp: ${ramp}`:''}`,
      motionId: shot.motionId, ratio:'21:9', w:1344, h:576, duration: shot.duration, res:'1080p', cost, seed: hash(shot.seed), source:'cinema studio', label:`Shot ${shot.n}` })
    if (jobId) setShots(prev=>prev.map(s=>s.id===shot.id?{...s,status:'rendering',jobId}:s))
  }
  const genAll = () => shots.filter(s=>s.status!=='ready').forEach((s,i)=> setTimeout(()=>genShot(s), i*350))

  const exportFilm = async () => {
    const ready = shots.filter(s=>s.status==='ready')
    if (!ready.length) { toast('Generate at least one shot first', 'warn'); return }
    try {
      setExporting(1)
      const blob = await exportVideoWebM({ shots: ready.map(s=>({ imageUrl: shotImg(s), motion: motionById(s.motionId).motion, duration: Math.min(s.duration,5), caption: `${s.n}. ${s.name}` })), onProgress:setExporting })
      downloadBlob(blob, title.replace(/\s+/g,'-').toLowerCase()+'.webm'); setExporting(0); toast('Your film exported as a real .webm — all shots, one cut')
    } catch { setExporting(0); toast('Sequence export failed in this browser', 'warn') }
  }

  const upd = (id, patch) => setShots(prev=>prev.map(s=>s.id===id?{...s,...patch}:s))

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <header className="flex flex-wrap items-center gap-3">
        <span className="h-11 w-11 grid place-items-center rounded-2xl bg-lime text-black"><Film size={21}/></span>
        <div className="flex-1 min-w-[220px]">
          <input value={title} onChange={e=>setTitle(e.target.value)} className="bg-transparent font-black text-2xl w-full border-none tracking-tight" style={{fontFamily:'Archivo'}} />
          <p className="text-[12px] text-zinc-500">Cinema Studio 4.0 · {shots.length} shots · {totalDur}s runtime · {readyCount} rendered</p>
        </div>
        <Btn onClick={()=>toast('Project auto-saves locally as you work')}><Save size={15}/> Saved</Btn>
        <Btn kind="white" disabled={!readyCount} onClick={()=>setPlayingSeq(true)}><Play size={15}/> Play sequence</Btn>
        <Btn kind="lime" disabled={!readyCount || exporting>0} onClick={exportFilm}>{exporting>0 ? <><Loader2 size={15} className="animate-spin"/> {exporting}%</> : <><Download size={15}/> Export film .webm</>}</Btn>
      </header>

      <div className="grid lg:grid-cols-[400px_1fr] gap-5 mt-6">
        {/* left: story + camera */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-line bg-panel p-5">
            <div className="flex items-center gap-2 mb-3"><Bot size={17} className="text-lime"/><h3 className="font-extrabold">Mr. Higgs — Shot Breakdown</h3></div>
            <textarea value={story} onChange={e=>setStory(e.target.value)} rows={5} placeholder="Tell the story in a paragraph. A retired astronaut returns to her flooded hometown to ring the church bell one last time as a storm rolls in…"
              className="w-full rounded-2xl bg-panel2 border border-line p-3.5 text-sm leading-relaxed placeholder:text-zinc-600 resize-none" />
            <div className="mt-3"><Field label="Genre mode"><div className="flex flex-wrap gap-1.5">{CINEMA.genres.map(g=><Chip key={g} active={genre===g} onClick={()=>setGenre(g)}>{g}</Chip>)}</div></Field></div>
            <Btn kind="lime" className="w-full !py-3" disabled={thinking} onClick={breakdown}>{thinking ? <><Loader2 size={16} className="animate-spin"/> Mr. Higgs is storyboarding…</> : <><Sparkles size={16}/> Break into shots</>}</Btn>
            <p className="text-[11px] text-zinc-600 mt-2 text-center">Skeletal motion first, pixels second. That’s the Cinema Studio way.</p>
          </div>

          <div className="rounded-3xl border border-line bg-panel p-5">
            <div className="flex items-center gap-2 mb-4"><Camera size={17} className="text-lime"/><h3 className="font-extrabold">Camera Package</h3></div>
            <Field label="Camera body"><Select value={body} onChange={setBody} options={CINEMA.bodies} /></Field>
            <Field label="Lens set"><Select value={lens} onChange={setLens} options={CINEMA.lenses} /></Field>
            <Field label={`Focal length · ${focal}mm`}><input type="range" min={14} max={200} step={1} value={focal} onChange={e=>setFocal(+e.target.value)} className="w-full" />
              <div className="flex gap-1 mt-2 flex-wrap">{CINEMA.focals.map(f=><button key={f} onClick={()=>setFocal(f)} className={cx('text-[11px] font-bold rounded-md px-2 py-1 border', focal===f?'bg-white text-black border-white':'bg-panel2 border-line text-zinc-400')}>{f}mm</button>)}</div></Field>
            <Field label="Aperture"><Seg options={CINEMA.apertures} value={aperture} onChange={setAperture} size="sm" /></Field>
            <Field label="Speed ramp"><div className="flex flex-wrap gap-1.5">{CINEMA.ramps.map(r=><Chip key={r} active={ramp===r} onClick={()=>setRamp(r)}>{r}</Chip>)}</div></Field>
            <Field label="Render model"><Select value={modelId} onChange={setModelId} options={VIDEO_MODELS.map(m=>({id:m.id,label:`${m.name} · ${m.credits}cr/${m.unit}`}))} /></Field>
            <div className="rounded-2xl bg-panel2 border border-line p-3 flex items-center gap-2.5 text-[12px]"><Aperture size={15} className="text-lime shrink-0"/><span className="text-zinc-400">{body.split(' ')[0]} + {lens.split(' ').slice(0,2).join(' ')} @ {focal}mm {aperture} — {focal<24?'expansive, distorted energy':focal<50?'natural human field of view':focal<100?'compressed, intimate portraits':'flattened, voyeuristic telephoto'}.</span></div>
          </div>
        </div>

        {/* right: storyboard */}
        <div>
          <div className="flex items-center gap-2 mb-3"><Clapperboard size={16} className="text-zinc-500"/><h3 className="font-extrabold">Storyboard</h3>
            <span className="text-[12px] text-zinc-600">edit any card · drag your story into existence</span>
            <div className="ml-auto flex gap-2">
              <Btn className="!py-2" onClick={()=>setShots(s=>[...s,{id:Math.random().toString(36).slice(2), n:s.length+1, name:'New Shot', motionId:'slow-push-in', duration:4, prompt:'', direction:'', focal, status:'idle', seed:String(Date.now())}])}><Plus size={14}/> Add shot</Btn>
              {shots.length>0 && <Btn kind="lime" className="!py-2" onClick={genAll}><Sparkles size={14}/> Generate all · <Coins size={13}/>{shots.filter(s=>s.status!=='ready').reduce((a,s)=>a+calcCost(model,s.duration,'1080p',1),0)}</Btn>}
            </div>
          </div>
          {shots.length===0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-800 grid place-items-center py-20 text-center px-6">
              <Film size={34} className="text-zinc-700 mb-3"/><p className="font-bold">No shots yet</p>
              <p className="text-sm text-zinc-500 mt-1 max-w-md">Write your story on the left and let Mr. Higgs break it into a professional shot list — or add shots manually, auteur.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-3.5">
              {shots.map((s,i)=>(
                <div key={s.id} className="rounded-3xl border border-line bg-panel overflow-hidden flex flex-col">
                  <div className="relative">
                    <MotionImage src={shotImg(s)} motionId={s.motionId} playing={s.status==='ready'} duration={s.duration} className="aspect-video w-full" imgClassName={s.status==='ready'?'':'opacity-45 saturate-50'} />
                    <span className="absolute top-2.5 left-2.5 text-[10px] font-mono font-bold bg-black/65 border border-white/10 rounded-md px-2 py-1">SHOT {i+1} · {s.focal}mm · {s.duration}s</span>
                    <span className={cx('absolute top-2.5 right-2.5 text-[10px] font-extrabold rounded-md px-2 py-1 uppercase', s.status==='ready' ? 'bg-lime text-black' : s.status==='rendering' ? 'bg-amber-400 text-black' : 'bg-panel3 text-zinc-400 border border-line')}>{s.status}</span>
                    {s.status==='rendering' && <div className="absolute inset-x-0 bottom-0"><ProgressBar value={jobs.find(j=>j.id===s.jobId)?.progress || 4} /></div>}
                  </div>
                  <div className="p-3.5 flex flex-col gap-2 flex-1">
                    <input value={s.name} onChange={e=>upd(s.id,{name:e.target.value})} className="bg-transparent font-extrabold text-[15px] border-none w-full" />
                    <textarea value={s.prompt} rows={2} onChange={e=>upd(s.id,{prompt:e.target.value})} placeholder="What's in this shot?" className="w-full rounded-xl bg-panel2 border border-line p-2.5 text-[13px] resize-none placeholder:text-zinc-600" />
                    {s.direction && <p className="text-[11px] text-zinc-500 italic leading-snug">“{s.direction}”</p>}
                    <div className="flex gap-2">
                      <select value={s.motionId} onChange={e=>upd(s.id,{motionId:e.target.value})} className="flex-1 min-w-0 rounded-xl bg-panel2 border border-line px-2.5 py-2 text-[12px] font-semibold">
                        {CAMERA_PRESETS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select value={s.duration} onChange={e=>upd(s.id,{duration:+e.target.value})} className="rounded-xl bg-panel2 border border-line px-2.5 py-2 text-[12px] font-semibold">
                        {[2,3,4,5,6,8,10].map(d=><option key={d} value={d}>{d}s</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2 mt-auto pt-1">
                      <Btn kind={s.status==='ready'?'ghost':'lime'} className="flex-1 !py-2" disabled={s.status==='rendering'} onClick={()=>genShot(s)}>
                        {s.status==='rendering' ? <><Loader2 size={13} className="animate-spin"/> Rendering</> : s.status==='ready' ? <>Re-render</> : <><Sparkles size={13}/> Generate · {calcCost(model,s.duration,'1080p',1)}cr</>}
                      </Btn>
                      <button onClick={()=>setShots(prev=>prev.filter(x=>x.id!==s.id))} className="h-9 w-9 grid place-items-center rounded-full border border-line bg-panel2 text-zinc-500 hover:text-red-300 hover:border-red-500/40"><Trash2 size={14}/></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {shots.length>0 && (
            <div className="mt-4 rounded-3xl border border-line bg-panel p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2.5">Timeline · {totalDur}s</div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {shots.map((s,i)=>(<div key={s.id} className="shrink-0" style={{width: Math.max(70, s.duration*26)}}>
                  <div className={cx('h-12 rounded-xl border overflow-hidden relative', s.status==='ready'?'border-lime/60':'border-line')}><img src={shotImg(s)} alt="" className="h-full w-full object-cover opacity-80"/><span className="absolute bottom-1 left-1.5 text-[9px] font-black bg-black/60 rounded px-1">{i+1}</span></div>
                  <p className="text-[10px] text-zinc-500 mt-1 truncate">{s.name}</p></div>))}
              </div>
            </div>
          )}
        </div>
      </div>

      <SequencePlayer open={playingSeq} onClose={()=>setPlayingSeq(false)} shots={shots.filter(s=>s.status==='ready')} title={title} />
    </div>
  )
}

function Select({ value, onChange, options }) {
  return <div className="relative">
    <select value={value} onChange={e=>onChange(e.target.value)} className="w-full appearance-none rounded-xl bg-panel2 border border-line px-3.5 py-2.5 text-sm font-semibold pr-9">
      {options.map(o=>{ const id=typeof o==='string'?o:o.id, label=typeof o==='string'?o:o.label; return <option key={id} value={id}>{label}</option> })}
    </select>
    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
  </div>
}

function SequencePlayer({ open, onClose, shots, title }) {
  const [idx, setIdx] = useState(0); const [playing, setPlaying] = useState(true)
  useEffect(()=>{ setIdx(0); setPlaying(true) },[open])
  useEffect(()=>{
    if (!open || !playing || !shots[idx]) return
    const t = setTimeout(()=> setIdx(i => (i+1) % shots.length), shots[idx].duration*1000)
    return ()=>clearTimeout(t)
  },[open, idx, playing, shots])
  const shot = shots[idx]
  return <Modal open={open} onClose={onClose} wide>
    {shot ? <div className="bg-black">
      <div className="flex gap-1.5 p-4 pb-0">{shots.map((s,i)=><span key={s.id} className="flex-1 h-1 rounded-full bg-white/15 overflow-hidden"><span className={cx('block h-full bg-lime', i<idx && 'w-full', i>idx && 'w-0')} style={i===idx?{animation:`seqbar ${s.duration}s linear forwards`, animationPlayState: playing?'running':'paused'}:{}} /></span>)}</div>
      <style>{`@keyframes seqbar{from{width:0}to{width:100%}}`}</style>
      <div className="relative grain cursor-pointer" onClick={()=>setPlaying(!playing)}>
        <MotionImage key={shot.id} src={shotImg(shot)} motionId={shot.motionId} playing={playing} duration={shot.duration} className="aspect-video w-full" />
        <div className="absolute inset-x-0 top-0 h-[7%] bg-black z-[6]" /><div className="absolute inset-x-0 bottom-0 h-[7%] bg-black z-[6]" />
        {!playing && <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 grid place-items-center rounded-full bg-lime text-black z-[8]"><Play size={26} className="ml-1"/></span>}
        <div className="absolute bottom-[10%] inset-x-0 text-center z-[7] px-6">
          <span className="text-[11px] font-mono font-bold text-lime tracking-widest">SHOT {idx+1} / {shots.length} · {shot.name.toUpperCase()}</span>
          <p className="text-white/90 text-sm sm:text-base font-medium mt-1 drop-shadow">{shot.prompt}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 px-5 py-3.5 bg-panel">
        <b className="text-sm">{title}</b><span className="text-[11px] text-zinc-500">sequence playback · tap frame to pause</span>
        <div className="ml-auto flex gap-2">
          <Btn className="!py-1.5 !px-3" onClick={()=>setIdx((idx-1+shots.length)%shots.length)}>Prev</Btn>
          <Btn className="!py-1.5 !px-3" onClick={()=>setIdx((idx+1)%shots.length)}>Next</Btn>
        </div>
      </div>
    </div> : <div className="p-10 text-center text-zinc-500 text-sm">Generate shots to play the sequence.</div>}
  </Modal>
}
