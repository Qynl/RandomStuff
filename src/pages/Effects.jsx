import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Search, Flame, Play, TrendingUp } from 'lucide-react'
import { cx, MotionImage, FxOverlay, Chip } from '../components/ui.jsx'
import { EFFECTS, EFFECT_CATEGORIES } from '../data/catalog.js'
import { seedImg } from '../lib/engine.js'

function EffectCard({ e }) {
  const [hover,setHover] = useState(false); const nav = useNavigate()
  return (
    <button onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onClick={()=>nav('/video?effect='+e.id)}
      className="group relative rounded-3xl overflow-hidden border border-line text-left bg-panel2 hover:border-zinc-500 transition">
      <MotionImage src={seedImg('fx-'+e.id, 640, 800)} motionId={e.motion} playing={hover} duration={3.4} filter={e.filter} className="aspect-[4/5] w-full" />
      {hover && <FxOverlay overlay={e.overlay} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20 z-[6]" />
      <div className="absolute top-3 left-3 z-[7] flex gap-1.5">
        {e.hot && <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-red-500 text-white rounded-md px-2 py-1"><Flame size={10}/> HOT</span>}
        {e.isNew && <span className="text-[10px] font-extrabold bg-lime text-black rounded-md px-2 py-1">NEW</span>}
      </div>
      <span className={cx('absolute top-3 right-3 z-[7] h-8 w-8 grid place-items-center rounded-full bg-black/55 border border-white/15 transition', hover ? 'bg-lime text-black' : '')}><Play size={13} className="ml-0.5"/></span>
      <div className="absolute bottom-0 inset-x-0 p-3.5 z-[7]">
        <h3 className="font-extrabold text-[15px] leading-tight">{e.name}</h3>
        <p className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-1"><TrendingUp size={11} className="text-lime"/>{e.uses} creations · {e.category}</p>
        <span className="mt-2 hidden group-hover:inline-flex text-[11px] font-extrabold bg-lime text-black rounded-full px-3 py-1">Use this effect</span>
      </div>
    </button>
  )
}

export default function Effects() {
  const [cat, setCat] = useState('All'); const [q, setQ] = useState('')
  const list = useMemo(()=> EFFECTS.filter(e=> (cat==='All'||e.category===cat) && e.name.toLowerCase().includes(q.toLowerCase())), [cat,q])
  return (
    <div className="p-4 sm:p-6 max-w-[1700px] mx-auto">
      <header className="flex flex-wrap items-center gap-3">
        <span className="h-11 w-11 grid place-items-center rounded-2xl bg-lime text-black"><Sparkles size={21}/></span>
        <div className="flex-1 min-w-[200px]"><h1 className="font-black text-2xl tracking-tight" style={{fontFamily:'Archivo'}}>EFFECTS</h1>
        <p className="text-[12px] text-zinc-500">{EFFECTS.length} one-tap viral effects. Hover to preview live — click to make it yours.</p></div>
        <div className="flex items-center gap-2 rounded-full bg-panel2 border border-line px-4 py-2.5 w-full sm:w-72"><Search size={16} className="text-zinc-500"/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search effects…" className="flex-1 bg-transparent text-sm placeholder:text-zinc-600 border-none"/></div>
      </header>
      <div className="flex gap-2 mt-5 overflow-x-auto no-scrollbar">{EFFECT_CATEGORIES.map(c=><Chip key={c} active={cat===c} onClick={()=>setCat(c)}>{c}</Chip>)}</div>
      {list.length===0
        ? <p className="text-center text-zinc-500 py-20 text-sm">No effect matches “{q}”. Try “zoom”, “fire” or “anime”.</p>
        : <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5 mt-5">{list.map(e=><EffectCard key={e.id} e={e} />)}</div>}
    </div>
  )
}
