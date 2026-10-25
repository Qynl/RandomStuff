import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, Sparkles, Coins, RefreshCw, Package, Target, MessageSquareText, Clapperboard } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Field, Chip, EmptyState } from '../components/ui.jsx'
import { PromptBox, ImageUpload } from '../components/studio.jsx'
import { AssetCard } from '../components/shell.jsx'
import { AVATARS, UGC_HOOKS } from '../data/catalog.js'
import { seedImg } from '../lib/engine.js'

export default function Influencer() {
  const { enqueue, assets, credits, toast, liveMode } = useApp()
  const nav = useNavigate()
  const [inf, setInf] = useState(AVATARS[2])
  const [product, setProduct] = useState('Aurora Glow Serum')
  const [category, setCategory] = useState('Skincare')
  const [audience, setAudience] = useState('Gen Z')
  const [hook, setHook] = useState('')
  const [scene, setScene] = useState('')
  const [productImg, setProductImg] = useState(null)
  const [format, setFormat] = useState('UGC Review')
  const [variants, setVariants] = useState(3)
  const cost = variants * 9
  const mine = assets.filter(a=>a.source==='ugc')

  const genHook = () => {
    const t = UGC_HOOKS[Math.floor(Math.random()*UGC_HOOKS.length)]
    setHook(t.replaceAll('{product}', product || 'this product').replaceAll('{problem}','bad skin days').replaceAll('{audience}', audience).replaceAll('{category}', category.toLowerCase()))
  }
  const generate = () => {
    if (!liveMode && credits < cost) { toast(`UGC batch needs ${cost} credits`, 'warn'); return }
    const finalHook = hook || `POV: you finally found the ${product} that actually works`
    const id = enqueue({ type:'video', modelId:'genjutsu', modelName:'UGC Builder',
      prompt:`${format}: ${inf.name} (${inf.role}) films a vertical UGC ad for ${product}. Hook: “${finalHook}” ${scene?`Scene: ${scene}. `:''}Authentic phone-camera energy, ${audience} audience.`,
      motionId:'handheld-docu', ratio:'9:16', w:720, h:1280, duration:10, res:'1080p', count:variants, cost,
      seed: product.length*97 + Date.now()%997, source:'ugc', character: inf.name })
    if (id) toast(`${variants} ad variants rendering — A/B test like a media empire`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <header className="flex flex-wrap items-center gap-3">
        <span className="h-11 w-11 grid place-items-center rounded-2xl bg-lime text-black"><Megaphone size={21}/></span>
        <div className="flex-1"><h1 className="font-black text-2xl tracking-tight" style={{fontFamily:'Archivo'}}>AI INFLUENCER STUDIO</h1>
        <p className="text-[12px] text-zinc-500">Build your next hype machine: persistent AI creators + product ads + hook factories.</p></div>
        <Btn onClick={()=>nav('/soul')}>Create custom influencer</Btn>
      </header>

      <div className="grid lg:grid-cols-[1fr_420px] gap-5 mt-6">
        <div>
          <Field label="Choose your influencer">
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {AVATARS.map(a=>(
                <button key={a.id} onClick={()=>setInf(a)} className={cx('shrink-0 w-[110px] rounded-2xl border overflow-hidden text-left transition', inf.id===a.id ? 'border-lime ring-1 ring-lime' : 'border-line hover:border-zinc-500')}>
                  <img src={a.img} alt={a.name} className="h-[110px] w-full object-cover" />
                  <span className="block p-2 bg-panel2"><b className="text-[11px] block truncate">{a.name}</b><span className="text-[9px] text-zinc-500 line-clamp-1">{a.role}</span></span>
                </button>))}
            </div>
          </Field>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Product"><input value={product} onChange={e=>setProduct(e.target.value)} className="w-full rounded-xl bg-panel2 border border-line px-3.5 py-2.5 text-sm" /></Field>
            <Field label="Category"><input value={category} onChange={e=>setCategory(e.target.value)} className="w-full rounded-xl bg-panel2 border border-line px-3.5 py-2.5 text-sm" /></Field>
            <Field label="Audience"><div className="flex gap-1.5 flex-wrap">{['Gen Z','Millennials','Founders','Gamers','Moms','Fitness'].map(a=><Chip key={a} active={audience===a} onClick={()=>setAudience(a)} className="!px-2.5 !py-1 !text-[12px]">{a}</Chip>)}</div></Field>
          </div>
          <Field label="Opening hook" right={<button onClick={genHook} className="inline-flex items-center gap-1 text-[11px] font-bold text-lime hover:underline"><RefreshCw size={12}/> Generate hook</button>}>
            <input value={hook} onChange={e=>setHook(e.target.value)} placeholder="Generate one, or write your own scroll-stopper…" className="w-full rounded-xl bg-panel2 border border-line px-4 py-3 text-[15px] font-medium placeholder:text-zinc-600" />
          </Field>
          <Field label="Scene direction (optional)"><PromptBox value={scene} onChange={setScene} mode="video" rows={3} placeholder="Bathroom mirror GRWM, natural light, holds product to camera at 0:03, before/after at the end…" /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Ad format"><div className="flex flex-wrap gap-1.5">{['UGC Review','Unboxing','GRWM','Before / After','POV Demo','Street Interview','Unboxing ASMR'].map(f=><Chip key={f} active={format===f} onClick={()=>setFormat(f)}>{f}</Chip>)}</div></Field>
            <Field label={`Variants for A/B testing · ×${variants}`}><input type="range" min={1} max={6} value={variants} onChange={e=>setVariants(+e.target.value)} className="w-full" /></Field>
          </div>
        </div>

        <div>
          <div className="relative rounded-[28px] overflow-hidden border border-line aspect-[9/13] bg-panel2 grain">
            <img src={seedImg('ugc-'+category, 720, 1040)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/50" />
            <div className="absolute top-4 inset-x-4 flex items-center gap-2.5">
              <img src={inf.img} alt="" className="h-11 w-11 rounded-full object-cover border-2 border-lime" />
              <div><p className="font-bold text-sm leading-none">@{inf.name.toLowerCase().replace(/\s/g,'')}</p><p className="text-[10px] text-zinc-400 mt-0.5">{inf.role} · AI creator</p></div>
              <span className="ml-auto text-[10px] font-extrabold bg-red-600 rounded-md px-2 py-1 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white" style={{animation:'pulse-dot 1s infinite'}}/> LIVE PREVIEW</span>
            </div>
            {productImg && <img src={productImg} alt="" className="absolute right-4 top-24 w-24 h-24 object-cover rounded-2xl border-2 border-white/25 rotate-3 shadow-2xl" />}
            <div className="absolute bottom-0 inset-x-0 p-5">
              <p className="text-xl font-black leading-tight drop-shadow" style={{fontFamily:'Archivo'}}>{hook || `POV: you finally found the ${product || 'product'} that actually works`}</p>
              <p className="text-[12px] text-zinc-300 mt-1.5">{format} · 9:16 · captions on · hook in first 0.8s</p>
            </div>
          </div>
          <div className="mt-3"><Field label="Product photo (optional)"><ImageUpload label="Product shot" value={productImg} onChange={setProductImg} compact /></Field></div>
          <Btn kind="lime" className="w-full !py-3.5 !text-[15px]" onClick={generate}><Sparkles size={16}/> Generate {variants} ad{variants>1?'s':''} · <Coins size={13}/>{cost}</Btn>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            {[['Hook rate','38%'],['Avg. CTR','2.4×'],['Cost / ad','~$0.40']].map(([k,v])=>(<div key={k} className="rounded-2xl bg-panel2 border border-line py-2.5"><b className="text-lime">{v}</b><p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wide">{k}</p></div>))}
          </div>
        </div>
      </div>

      <h3 className="font-extrabold mt-8 mb-3 flex items-center gap-2"><Target size={16} className="text-zinc-500"/> Campaign renders <span className="text-zinc-600 text-sm">{mine.length}</span></h3>
      {mine.length===0 ? <EmptyState icon={Megaphone} title="No ads yet" sub="Configure a creator + product + hook above and print scroll-stopping variants in minutes." />
        : <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-6 gap-3">{mine.map(a=><AssetCard key={a.id} asset={a} ratioClass="aspect-[3/4]" />)}</div>}
    </div>
  )
}
