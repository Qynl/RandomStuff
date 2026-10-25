import React, { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderOpen, Search, Film, Image as ImageIcon, Heart, Upload, Grid2x2, List, Download, Trash2 } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Chip, EmptyState } from '../components/ui.jsx'
import { AssetCard } from '../components/shell.jsx'
import { fileToDataURL, fmtTime, downloadImage } from '../lib/engine.js'

export default function Library() {
  const { assets, addAsset, openPlayer, deleteAsset, toggleFav, toast, jobs } = useApp()
  const [q, setQ] = useState(''); const [type, setType] = useState('all'); const [src, setSrc] = useState('all')
  const [favOnly, setFavOnly] = useState(false); const [view, setView] = useState('grid'); const [sort, setSort] = useState('new')
  const fileRef = useRef(null)
  const sources = useMemo(()=> ['all', ...new Set(assets.map(a=>a.source||'studio'))], [assets])
  const list = useMemo(()=>{
    let l = assets.filter(a =>
      (type==='all' || a.type===type) &&
      (src==='all' || (a.source||'studio')===src) &&
      (!favOnly || a.fav) &&
      (a.prompt+' '+(a.modelName||'')).toLowerCase().includes(q.toLowerCase()))
    if (sort==='old') l = [...l].reverse()
    if (sort==='fav') l = [...l].sort((a,b)=>(b.fav?1:0)-(a.fav?1:0))
    return l
  },[assets,q,type,src,favOnly,sort])
  const stats = { v: assets.filter(a=>a.type==='video').length, i: assets.filter(a=>a.type==='image').length, f: assets.filter(a=>a.fav).length, r: jobs.filter(j=>j.status==='rendering').length }

  const upload = async (e) => {
    for (const f of [...(e.target.files||[])]) {
      const url = await fileToDataURL(f)
      addAsset({ type: f.type.startsWith('video') ? 'video':'image', url, prompt: f.name, modelName:'Upload', motionId:'slow-push-in', filter:'none', overlay:'none', seed: f.size, ratio:'16:9', duration: f.type.startsWith('video')?6:undefined, source:'upload' })
    }
    toast('Added to your library')
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1700px] mx-auto">
      <header className="flex flex-wrap items-center gap-3">
        <span className="h-11 w-11 grid place-items-center rounded-2xl bg-lime text-black"><FolderOpen size={21}/></span>
        <div className="flex-1 min-w-[180px]"><h1 className="font-black text-2xl tracking-tight" style={{fontFamily:'Archivo'}}>MY LIBRARY</h1>
        <p className="text-[12px] text-zinc-500">{stats.v} videos · {stats.i} images · {stats.f} favorites{stats.r ? ` · ${stats.r} rendering` : ''} · stored locally, forever yours</p></div>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={upload} />
        <Btn onClick={()=>fileRef.current.click()}><Upload size={15}/> Upload media</Btn>
        <Link to="/video"><Btn kind="lime">Create video</Btn></Link>
      </header>

      <div className="flex flex-wrap items-center gap-2 mt-6">
        <div className="flex items-center gap-2 rounded-full bg-panel2 border border-line px-4 py-2.5 flex-1 min-w-[200px] max-w-sm"><Search size={16} className="text-zinc-500"/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search prompts & models…" className="flex-1 bg-transparent text-sm placeholder:text-zinc-600 border-none"/></div>
        <Chip active={type==='all'} onClick={()=>setType('all')}>All</Chip>
        <Chip active={type==='video'} onClick={()=>setType('video')}><Film size={12} className="inline mr-1"/>Videos</Chip>
        <Chip active={type==='image'} onClick={()=>setType('image')}><ImageIcon size={12} className="inline mr-1"/>Images</Chip>
        <Chip active={favOnly} onClick={()=>setFavOnly(!favOnly)}><Heart size={12} className="inline mr-1"/>Favorites</Chip>
        {sources.length>2 && <select value={src} onChange={e=>setSrc(e.target.value)} className="rounded-full bg-panel2 border border-line px-3 py-2 text-[13px] font-semibold capitalize">
          {sources.map(s=><option key={s} value={s}>{s==='all'?'All sources':s}</option>)}
        </select>}
        <select value={sort} onChange={e=>setSort(e.target.value)} className="rounded-full bg-panel2 border border-line px-3 py-2 text-[13px] font-semibold">
          <option value="new">Newest first</option><option value="old">Oldest first</option><option value="fav">Favorites first</option>
        </select>
        <div className="ml-auto flex rounded-full bg-panel2 border border-line p-1">
          <button onClick={()=>setView('grid')} className={cx('h-7 w-8 grid place-items-center rounded-full', view==='grid' && 'bg-white text-black')}><Grid2x2 size={14}/></button>
          <button onClick={()=>setView('list')} className={cx('h-7 w-8 grid place-items-center rounded-full', view==='list' && 'bg-white text-black')}><List size={14}/></button>
        </div>
      </div>

      {assets.length===0
        ? <EmptyState icon={FolderOpen} title="Your library is empty" sub="Everything you generate — videos, images, Speak renders, Cinema shots, UGC ads — collects here automatically." action={<Link to="/video"><Btn kind="lime">Make your first video</Btn></Link>} />
        : list.length===0
        ? <p className="text-center text-zinc-500 py-16 text-sm">Nothing matches those filters.</p>
        : view==='grid'
          ? <div className="masonry mt-5">{list.map(a=><AssetCard key={a.id} asset={a} ratioClass={a.ratio==='9:16'?'aspect-[3/4]':a.type==='image'?(a.ratio==='1:1'?'aspect-square':'aspect-[4/3]'):'aspect-video'} />)}</div>
          : <div className="mt-5 rounded-3xl border border-line overflow-hidden">
              {list.map((a,i)=>(
                <div key={a.id} className={cx('flex items-center gap-3.5 p-3 hover:bg-white/[0.03] cursor-pointer transition', i>0 && 'border-t border-line')} onClick={()=>openPlayer(a)}>
                  <img src={a.url} alt="" className="h-14 w-24 rounded-xl object-cover shrink-0" style={{filter:a.filter!=='none'?a.filter:undefined}} />
                  <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{a.prompt || 'Untitled'}</p>
                  <p className="text-[11px] text-zinc-500">{a.modelName} · {a.source} · {fmtTime(a.createdAt)}</p></div>
                  <span className="hidden sm:inline text-[10px] font-extrabold uppercase bg-panel3 rounded-md px-2 py-1">{a.type}</span>
                  <span className="flex gap-1" onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>toggleFav(a.id)} className={cx('h-8 w-8 grid place-items-center rounded-full border border-line bg-panel2 hover:border-zinc-500', a.fav && 'text-red-400')}><Heart size={13} fill={a.fav?'currentColor':'none'}/></button>
                    <button onClick={()=>downloadImage(a.url,'higgsfield-'+a.id+'.jpg')} className="h-8 w-8 grid place-items-center rounded-full border border-line bg-panel2 hover:border-zinc-500"><Download size={13}/></button>
                    <button onClick={()=>deleteAsset(a.id)} className="h-8 w-8 grid place-items-center rounded-full border border-line bg-panel2 hover:text-red-300 hover:border-red-500/40"><Trash2 size={13}/></button>
                  </span>
                </div>))}
            </div>}
    </div>
  )
}
