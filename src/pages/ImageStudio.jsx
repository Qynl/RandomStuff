import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Image as ImageIcon, Sparkles, Coins, Fingerprint } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Field, Seg, Chip, EmptyState, AspectIcon } from '../components/ui.jsx'
import { PromptBox, ModelPicker, ImageUpload } from '../components/studio.jsx'
import { AssetCard } from '../components/shell.jsx'
import { IMAGE_MODELS, IMAGE_STYLES, ASPECTS_IMAGE } from '../data/catalog.js'
import { hash } from '../lib/engine.js'

export default function ImageStudio() {
  const { enqueue, assets, credits, jobs, souls, toast } = useApp()
  const loc = useLocation()
  const qs = useMemo(()=> new URLSearchParams(loc.search), [loc.search])
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('nano-banana-pro')
  const [style, setStyle] = useState('Photorealistic')
  const [aspect, setAspect] = useState(ASPECTS_IMAGE[0])
  const [count, setCount] = useState(4)
  const [refImg, setRefImg] = useState(null)
  const [soulId, setSoulId] = useState(null)
  const [quality, setQuality] = useState('2K')
  const model = IMAGE_MODELS.find(m=>m.id===modelId) || IMAGE_MODELS[0]
  const cost = model.credits * count * (quality==='4K'?2:1)
  const myImages = assets.filter(a=>a.type==='image')
  const running = jobs.filter(j=>j.status==='rendering' && j.type==='image')
  const soul = souls.find(s=>s.id===soulId)

  useEffect(()=>{
    const s = loc.state || {}
    if (s.prompt !== undefined) setPrompt(s.prompt || '')
    const m = qs.get('model'); if (m && IMAGE_MODELS.some(x=>x.id===m)) setModelId(m)
    if (s.soulId) setSoulId(s.soulId)
  },[loc.key])

  const generate = () => {
    if (!prompt.trim() && !refImg) { toast('Describe the image first', 'warn'); return }
    if (credits < cost) { toast(`Needs ${cost} credits — you have ${credits}.`, 'warn'); return }
    const id = enqueue({ type:'image', modelId, modelName:model.name, prompt:`${prompt.trim()}${style?` — ${style} style`:''}`,
      ratio:aspect.id, w:aspect.w, h:aspect.h, count, cost, style, res:quality, baseImage: refImg, characterImg: soul?.cover, character: soul?.name,
      seed: hash(prompt+Date.now()), source:'image studio' })
    if (id) toast(`${model.name} generating ×${count}…`)
  }

  return (
    <div className="flex flex-col xl:flex-row min-h-full">
      <div className="xl:w-[420px] shrink-0 border-r border-line bg-[#0c0c0e] p-5 xl:h-[calc(100vh-60px)] xl:sticky xl:top-[60px] xl:overflow-y-auto">
        <div className="flex items-center gap-2.5 mb-1"><span className="h-9 w-9 grid place-items-center rounded-xl bg-lime text-black"><ImageIcon size={18}/></span>
          <div><h1 className="font-black text-lg leading-none" style={{fontFamily:'Archivo'}}>CREATE IMAGE</h1><p className="text-[11px] text-zinc-500 mt-0.5">Nano Banana Pro · Soul V2 · FLUX.2 & more</p></div></div>

        <div className="mt-5"><Field label="Prompt"><PromptBox value={prompt} onChange={setPrompt} mode="image" /></Field></div>
        <Field label="Model"><ModelPicker models={IMAGE_MODELS} value={modelId} onChange={setModelId} label="Image model" /></Field>

        <Field label="Soul ID character" right={<Link to="/soul" className="text-[11px] font-bold text-lime hover:underline">Manage Souls →</Link>}>
          {souls.length===0
            ? <Link to="/soul" className="flex items-center gap-2.5 rounded-2xl border border-dashed border-zinc-700 hover:border-lime/60 px-4 py-3 text-sm text-zinc-400 transition"><Fingerprint size={16} className="text-lime"/> Train a Soul to star in every image</Link>
            : <div className="flex gap-2 flex-wrap">
                <Chip active={!soulId} onClick={()=>setSoulId(null)}>None</Chip>
                {souls.map(s=><button key={s.id} onClick={()=>setSoulId(s.id)} className={cx('flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-[13px] font-semibold transition', soulId===s.id ? 'bg-lime text-black border-lime' : 'bg-panel2 border-line hover:border-zinc-500')}><img src={s.cover} alt="" className="h-6 w-6 rounded-full object-cover"/>{s.name}</button>)}
              </div>}
        </Field>

        <Field label="Style preset">
          <div className="flex flex-wrap gap-1.5">{IMAGE_STYLES.map(s=><Chip key={s} active={style===s} onClick={()=>setStyle(s)}>{s}</Chip>)}</div>
        </Field>

        <Field label="Reference image (optional)"><ImageUpload label="Reference / edit target" value={refImg} onChange={setRefImg} compact /></Field>

        <Field label="Aspect ratio">
          <div className="flex gap-1.5 flex-wrap">{ASPECTS_IMAGE.map(a=>(
            <button key={a.id} onClick={()=>setAspect(a)} className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-bold transition', aspect.id===a.id ? 'bg-white text-black border-white' : 'bg-panel2 border-line text-zinc-300 hover:border-zinc-500')}>
              <AspectIcon ratio={a.id} active={aspect.id===a.id} />{a.id}
            </button>))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Batch size"><Seg options={[1,2,4,8].map(n=>({id:n,label:'×'+n}))} value={count} onChange={setCount} size="sm" /></Field>
          <Field label="Output"><Seg options={['1K','2K','4K']} value={quality} onChange={setQuality} size="sm" /></Field>
        </div>

        <div className="sticky bottom-0 bg-[#0c0c0e] pt-3 pb-1 -mx-1 px-1">
          <Btn kind="lime" className="w-full !py-3.5 !text-[15px]" onClick={generate}><Sparkles size={17}/> Generate ×{count} <span className="inline-flex items-center gap-1 bg-black/15 rounded-full px-2 py-0.5 text-[12px] font-extrabold"><Coins size={12}/>{cost}</span></Btn>
          <p className="text-center text-[11px] text-zinc-600 mt-2">{credits.toLocaleString()} credits · unlimited windows apply on Plus/Ultra</p>
        </div>
      </div>

      <div className="flex-1 p-5 min-w-0">
        <div className="flex items-center gap-2 mb-4"><ImageIcon size={17} className="text-zinc-500"/><h2 className="font-extrabold">Your images</h2><span className="text-zinc-600 text-sm">{myImages.length}</span>
          <Link to="/library" className="ml-auto text-[12px] font-bold text-lime hover:underline">Open library →</Link></div>
        {running.length>0 && <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-3 mb-4">
          {running.map(j=><div key={j.id} className="rounded-2xl border border-lime/30 aspect-square shimmer grid place-items-center"><div className="text-center"><div className="text-2xl font-black tabular-nums" style={{fontFamily:'Archivo'}}>{Math.round(j.progress)}%</div><p className="text-[11px] text-lime font-bold">{j.modelName}</p></div></div>)}
        </div>}
        {myImages.length===0 && running.length===0
          ? <EmptyState icon={ImageIcon} title="No images yet" sub="Generate keyframes, posters, product shots and Soul portraits. Send any image straight into Create Video as a start frame." />
          : <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-3">{myImages.map(a=><AssetCard key={a.id} asset={a} ratioClass={a.ratio==='9:16'||a.ratio==='2:3'||a.ratio==='4:5'?'aspect-[4/5]':a.ratio==='16:9'||a.ratio==='3:2'||a.ratio==='21:9'?'aspect-video':'aspect-square'} />)}</div>}
      </div>
    </div>
  )
}
