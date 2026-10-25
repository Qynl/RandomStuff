import React, { useMemo, useRef, useState } from 'react'
import { ChevronDown, Wand2, Dices, Bookmark, X, Check, Upload, ImagePlus, Search, Gauge, Trophy, Coins } from 'lucide-react'
import { cx, Modal, MotionImage, Chip } from './ui.jsx'
import { CAMERA_PRESETS, CAMERA_CATEGORIES } from '../data/catalog.js'
import { seedImg, enhancePrompt, fileToDataURL, hash } from '../lib/engine.js'
import { useApp } from '../store/AppContext.jsx'

const SURPRISE = [
  'A lighthouse keeper discovers the light attracts flying whales at midnight',
  'Cyberpunk street food vendor serves glowing noodles to a robot monk',
  'A fox made of autumn fire runs across a frozen mirror lake',
  'Victorian inventor demonstrates a mechanical butterfly swarm in her greenhouse',
  'Deep-sea diver finds a neon-lit Tokyo inside a giant bioluminescent shell',
  'Grand prix racer made of liquid glass takes the final corner at sunset',
  'A tiny astronaut gardener waters a bonsai galaxy on the ISS',
  'Jazz drummer performs on a rooftop as the city lights sync to his beat',
]

export function PromptBox({ value, onChange, mode='video', rows=4, placeholder }) {
  const { savePrompt, savedPrompts, toast, askLLM } = useApp()
  const [showSaved, setShowSaved] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const doEnhance = async () => {
    setEnhancing(true)
    const out = await askLLM([
      { role:'system', content:`You are a world-class ${mode} director rewriting prompts for AI ${mode} generation. Return ONLY the rewritten prompt, one paragraph, vivid and specific: subject, action, environment, lighting, camera/lens language, texture, mood. No preamble.` },
      { role:'user', content: value },
    ])
    onChange(out?.trim() || enhancePrompt(value, mode))
    setEnhancing(false)
    toast(out ? 'Enhanced by your connected LLM' : 'Prompt enhanced with cinematic direction')
  }
  return (
    <div>
      <div className="relative rounded-2xl bg-panel2 border border-line focus-within:border-lime/50 transition">
        <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows}
          placeholder={placeholder || (mode==='video' ? 'Describe your shot… a subject, an action, a world. “@mySoul” tags your character.' : 'Describe the image you imagine…')}
          className="w-full bg-transparent resize-none p-4 text-[15px] leading-relaxed placeholder:text-zinc-600 border-none" />
        <div className="flex items-center gap-1.5 px-3 pb-3">
          <button onClick={doEnhance} disabled={!value.trim() || enhancing} className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-full bg-lime/12 text-lime border border-lime/25 px-3 py-1.5 hover:bg-lime/20 disabled:opacity-40 transition"><Wand2 size={13}/> {enhancing ? 'Directing…' : 'Enhance'}</button>
          <button onClick={()=>onChange(SURPRISE[Math.floor(Math.random()*SURPRISE.length)])} className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-full bg-panel3 border border-line px-3 py-1.5 hover:border-zinc-500 transition"><Dices size={13}/> Surprise me</button>
          <button onClick={()=>savePrompt(value)} className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-full bg-panel3 border border-line px-3 py-1.5 hover:border-zinc-500 transition"><Bookmark size={13}/> Save</button>
          {savedPrompts.length>0 && <button onClick={()=>setShowSaved(!showSaved)} className="text-[12px] font-bold text-zinc-400 hover:text-white px-2 py-1.5">Saved ({savedPrompts.length})</button>}
          <span className="ml-auto text-[11px] text-zinc-600 tabular-nums">{value.length} / 1500</span>
        </div>
      </div>
      {showSaved && savedPrompts.length>0 && (
        <div className="mt-2 rounded-2xl border border-line bg-panel2 p-2 max-h-44 overflow-y-auto space-y-1">
          {savedPrompts.map((p,i)=><button key={i} onClick={()=>{onChange(p); setShowSaved(false)}} className="w-full text-left text-[13px] rounded-xl px-3 py-2 hover:bg-white/5 text-zinc-300 line-clamp-2">{p}</button>)}
        </div>
      )}
    </div>
  )
}

export function ModelPicker({ models, value, onChange, label='Model' }) {
  const [open, setOpen] = useState(false); const [q,setQ] = useState('')
  const cur = models.find(m=>m.id===value) || models[0]
  const list = models.filter(m=> (m.name+' '+m.vendor).toLowerCase().includes(q.toLowerCase()))
  return (<>
    <button onClick={()=>setOpen(true)} className="w-full flex items-center gap-3 rounded-2xl bg-panel2 border border-line px-3.5 py-3 hover:border-zinc-500 transition text-left">
      <span className={cx('h-9 w-9 rounded-xl bg-gradient-to-br grid place-items-center font-black text-[13px] text-white shrink-0', cur.grad)}>{cur.name.trim()[0]}</span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2"><b className="text-sm truncate">{cur.name}</b>{cur.badge && <span className="text-[9px] font-extrabold bg-lime text-black rounded px-1.5 py-0.5 shrink-0">{cur.badge}</span>}</span>
        <span className="block text-[11px] text-zinc-500 truncate">{cur.vendor} · {cur.credits} credits{cur.unit?`/ ${cur.unit}`:' / image'}</span>
      </span>
      <ChevronDown size={17} className="text-zinc-500" />
    </button>
    <Modal open={open} onClose={()=>setOpen(false)} wide>
      <div className="p-6">
        <h3 className="text-xl font-black" style={{fontFamily:'Archivo'}}>Choose a {label.toLowerCase()}</h3>
        <p className="text-sm text-zinc-500 mt-1">Every frontier model, one subscription. Credits vary by model & duration.</p>
        <div className="flex items-center gap-2 mt-4 rounded-full bg-panel2 border border-line px-4 py-2.5"><Search size={16} className="text-zinc-500"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search models…" className="flex-1 bg-transparent text-sm placeholder:text-zinc-600 border-none"/></div>
        <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
          {list.map(m=>(
            <button key={m.id} onClick={()=>{onChange(m.id); setOpen(false)}} className={cx('text-left rounded-2xl border p-4 transition group', m.id===value ? 'border-lime bg-lime/5' : 'border-line bg-panel2 hover:border-zinc-500')}>
              <div className="flex items-center gap-3">
                <span className={cx('h-10 w-10 rounded-xl bg-gradient-to-br grid place-items-center font-black text-white', m.grad)}>{m.name.trim()[0]}</span>
                <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><b className="text-sm">{m.name}</b>{m.badge && <span className="text-[9px] font-extrabold bg-lime text-black rounded px-1.5 py-0.5">{m.badge}</span>}</div><div className="text-[11px] text-zinc-500">{m.vendor}</div></div>
                {m.id===value && <Check size={17} className="text-lime"/>}
              </div>
              <p className="text-[12px] text-zinc-400 mt-2 leading-snug">{m.desc}</p>
              <div className="flex items-center gap-3 mt-3 text-[11px] font-bold text-zinc-500">
                <span className="inline-flex items-center gap-1"><Coins size={11} className="text-lime"/>{m.credits}{m.unit?` / ${m.unit}`:' / img'}</span>
                <span className="inline-flex items-center gap-1"><Gauge size={11}/>Speed {m.speed}</span>
                <span className="inline-flex items-center gap-1"><Trophy size={11}/>Quality {m.quality}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  </>)
}

export function CameraPicker({ value, onChange }) {
  const [open, setOpen] = useState(false); const [cat,setCat] = useState('All'); const [q,setQ] = useState('')
  const cur = CAMERA_PRESETS.find(c=>c.id===value) || CAMERA_PRESETS[1]
  const list = CAMERA_PRESETS.filter(c=> (cat==='All'||c.category===cat) && c.name.toLowerCase().includes(q.toLowerCase()))
  return (<>
    <button onClick={()=>setOpen(true)} className="w-full rounded-2xl bg-panel2 border border-line hover:border-zinc-500 transition overflow-hidden text-left">
      <MotionImage src={seedImg('cam-'+cur.id, 640, 300)} motionId={cur.id} duration={3.2} className="h-[86px] w-full" />
      <span className="flex items-center gap-2 px-3.5 py-2.5"><span className="flex-1 min-w-0"><b className="text-sm block truncate">{cur.name}</b><span className="text-[11px] text-zinc-500">{cur.category} · DoP preset</span></span><ChevronDown size={16} className="text-zinc-500"/></span>
    </button>
    <Modal open={open} onClose={()=>setOpen(false)} wide>
      <div className="p-6">
        <h3 className="text-xl font-black" style={{fontFamily:'Archivo'}}>DoP Camera Library</h3>
        <p className="text-sm text-zinc-500 mt-1">{CAMERA_PRESETS.length} cinematic moves. Hover any card to preview the move live.</p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <div className="flex items-center gap-2 rounded-full bg-panel2 border border-line px-3.5 py-2 flex-1 min-w-[180px]"><Search size={15} className="text-zinc-500"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search moves…" className="flex-1 bg-transparent text-sm placeholder:text-zinc-600 border-none"/></div>
          {['All',...CAMERA_CATEGORIES].map(c=><Chip key={c} active={cat===c} onClick={()=>setCat(c)}>{c}</Chip>)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 mt-4 max-h-[52vh] overflow-y-auto pr-1">
          {list.map(c=><CamCard key={c.id} c={c} active={c.id===value} onPick={()=>{onChange(c.id); setOpen(false)}} />)}
        </div>
      </div>
    </Modal>
  </>)
}
function CamCard({ c, active, onPick }) {
  const [h,setH] = useState(false)
  return <button onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onClick={onPick} className={cx('rounded-2xl border overflow-hidden text-left transition', active ? 'border-lime' : 'border-line hover:border-zinc-500')}>
    <MotionImage src={seedImg('cam-'+c.id, 480, 270)} motionId={c.id} playing={h} duration={2.6} className="aspect-video w-full" />
    <span className="block p-2.5 bg-panel2"><b className="text-[12px] block truncate">{c.name}</b><span className="text-[10px] text-zinc-500 line-clamp-1">{c.desc}</span></span>
  </button>
}

export function ImageUpload({ label, value, onChange, compact }) {
  const ref = useRef(null)
  const pick = async (e) => { const f = e.target.files?.[0]; if (f) onChange(await fileToDataURL(f)) }
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={pick} />
      {value ? (
        <div className="relative rounded-2xl overflow-hidden border border-line group">
          <img src={value} alt="" className={cx('w-full object-cover', compact ? 'h-24' : 'h-36')} />
          <button onClick={()=>onChange(null)} className="absolute top-2 right-2 h-7 w-7 grid place-items-center rounded-full bg-black/70 border border-white/15 hover:bg-black"><X size={13}/></button>
          <span className="absolute bottom-2 left-2 text-[10px] font-bold bg-black/65 rounded-md px-2 py-1">{label}</span>
        </div>
      ) : (
        <button onClick={()=>ref.current.click()} className={cx('w-full rounded-2xl border border-dashed border-zinc-700 hover:border-lime/60 hover:bg-lime/5 transition grid place-items-center text-zinc-500', compact ? 'h-24' : 'h-36')}>
          <span className="flex flex-col items-center gap-1.5 text-[12px] font-bold"><ImagePlus size={20}/>{label}<span className="font-medium text-zinc-600 text-[11px]">Click to upload · JPG/PNG</span></span>
        </button>
      )}
    </div>
  )
}

export function useQueryState() {
  return useMemo(()=> new URLSearchParams(window.location.search), [])
}
export const promptSeed = (p) => 'hf' + hash(p || 'higgs')
