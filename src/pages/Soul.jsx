import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Fingerprint, Plus, Trash2, ImagePlus, Loader2, Check, Shirt, Sparkles, X, RefreshCw, Coins } from 'lucide-react'
import { ImageUpload } from '../components/studio.jsx'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Field, Chip, Modal, ProgressBar, EmptyState } from '../components/ui.jsx'
import { fileToDataURL, seedImg } from '../lib/engine.js'

const PRESETS = [
  { name:'Nova', desc:'Androgynous fashion muse, platinum crop', cover:'https://randomuser.me/api/portraits/women/17.jpg' },
  { name:'Kai', desc:'Seoul streetwear model, soft features', cover:'https://randomuser.me/api/portraits/men/85.jpg' },
  { name:'Amara', desc:'Lagos editorial beauty, sculptural braids', cover:'https://randomuser.me/api/portraits/women/21.jpg' },
  { name:'Rocco', desc:'Napoli silver-fox leading man', cover:'https://randomuser.me/api/portraits/men/52.jpg' },
]
const WARDROBE = ['Signature look','Red carpet','Streetwear','Business','Athleisure','Vintage 90s','Cyberpunk','Beach editorial']
const TRAIN_STEPS = ['Aligning facial landmarks','Extracting identity embedding','Learning skin & hair texture','Locking wardrobe signatures','Calibrating expression range','Baking Soul ID checkpoint']

export default function Soul() {
  const { souls, setSouls, toast, assets, openPlayer, enqueue, credits } = useApp()
  const [swapSoul, setSwapSoul] = useState(null)
  const [swapTarget, setSwapTarget] = useState(null)
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [photos, setPhotos] = useState([])
  const [wardrobe, setWardrobe] = useState('Signature look')
  const [training, setTraining] = useState(0)
  const fileRef = useRef(null)

  const addPhotos = async (e) => {
    const files = [...(e.target.files||[])].slice(0, 8)
    const urls = await Promise.all(files.map(fileToDataURL))
    setPhotos(p=>[...p, ...urls].slice(0,8))
  }
  const train = () => {
    if (!name.trim()) { toast('Name your Soul first', 'warn'); return }
    const cover = photos[0] || seedImg('soul-'+name, 600, 750)
    let t = 0; setTraining(1)
    const iv = setInterval(()=>{
      t += 2 + Math.random()*4; setTraining(Math.min(100, t))
      if (t >= 100) {
        clearInterval(iv)
        setSouls(s=>[{ id: Math.random().toString(36).slice(2), name: name.trim(), cover, photos: photos.length || 5, wardrobe, gens: 0, createdAt: Date.now(), strength: 92 + Math.floor(Math.random()*7) }, ...s])
        setCreating(false); setTraining(0); setPhotos([]); setName('')
        toast(`${name.trim()} is trained — Soul ID locked at ${92+Math.floor(Math.random()*7)}% identity strength`)
      }
    }, 130)
  }
  const usePreset = (p) => { setSouls(s=>[{ id: Math.random().toString(36).slice(2), name:p.name, cover:p.cover, photos:12, wardrobe:'Signature look', gens: 300+Math.floor(Math.random()*4000), createdAt: Date.now(), strength: 95 }, ...s]); toast(`${p.name} added to your Souls`) }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <header className="flex flex-wrap items-center gap-3">
        <span className="h-11 w-11 grid place-items-center rounded-2xl bg-lime text-black"><Fingerprint size={21}/></span>
        <div className="flex-1"><h1 className="font-black text-2xl tracking-tight" style={{fontFamily:'Archivo'}}>SOUL ID</h1>
        <p className="text-[12px] text-zinc-500">One identity. Infinite shoots. Lock a face, body and wardrobe across every generation.</p></div>
        <Btn kind="lime" onClick={()=>setCreating(true)}><Plus size={16}/> Train new Soul</Btn>
      </header>

      <h3 className="font-extrabold mt-7 mb-3">Your Souls <span className="text-zinc-600 text-sm font-semibold">{souls.length}</span></h3>
      {souls.length===0
        ? <EmptyState icon={Fingerprint} title="No Souls yet" sub="Train your own from 3–5 photos, or adopt a studio preset below. Then tag them in Image, Video, Speak and UGC with perfect consistency." action={<Btn kind="lime" onClick={()=>setCreating(true)}><Plus size={15}/> Train your first Soul</Btn>} />
        : <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {souls.map(s=>{
              const gens = assets.filter(a=>a.character===s.name)
              return <div key={s.id} className="group rounded-3xl border border-line bg-panel overflow-hidden">
                <div className="relative">
                  <img src={s.cover} alt={s.name} className="aspect-[4/5] w-full object-cover group-hover:scale-[1.03] transition duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                  <span className="absolute top-2.5 left-2.5 text-[10px] font-extrabold bg-lime text-black rounded-md px-2 py-1">SOUL {s.strength}%</span>
                  <button onClick={()=>{ setSouls(x=>x.filter(y=>y.id!==s.id)); toast(`${s.name} deleted`) }} className="absolute top-2.5 right-2.5 h-8 w-8 grid place-items-center rounded-full bg-black/60 border border-white/15 opacity-0 group-hover:opacity-100 hover:text-red-300 transition"><Trash2 size={14}/></button>
                  <div className="absolute bottom-0 inset-x-0 p-3.5"><h4 className="font-black text-xl" style={{fontFamily:'Archivo'}}>{s.name}</h4>
                    <p className="text-[11px] text-zinc-400 flex items-center gap-2"><span>{s.photos} seed photos</span>·<span>{gens.length + (s.gens||0)} generations</span>·<span className="inline-flex items-center gap-1"><Shirt size={10}/>{s.wardrobe}</span></p></div>
                </div>
                {gens.length>0 && <div className="flex gap-1.5 p-2.5 overflow-x-auto no-scrollbar">{gens.slice(0,5).map(g=><img key={g.id} src={g.url} alt="" onClick={()=>openPlayer(g)} className="h-12 w-12 rounded-lg object-cover cursor-pointer hover:ring-2 ring-lime shrink-0" />)}</div>}
                <div className="flex gap-2 p-3 pt-1">
                  <Btn kind="lime" className="flex-1 !py-2" onClick={()=>nav('/image',{state:{soulId:s.id, prompt:`@${s.name} in an editorial photoshoot, `}})}><Sparkles size={13}/> Generate</Btn>
                  <Btn className="flex-1 !py-2" onClick={()=>nav('/video',{state:{prompt:`@${s.name} walks toward camera, cinematic slow motion`}})}>To Video</Btn>
                </div>
              </div>})}
          </div>}

      <h3 className="font-extrabold mt-9 mb-3">Studio presets — adopt instantly</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {PRESETS.map(p=>(
          <div key={p.name} className="group relative rounded-3xl overflow-hidden border border-line">
            <img src={p.cover} alt={p.name} className="aspect-[4/5] w-full object-cover group-hover:scale-105 transition duration-500" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-3.5">
              <h4 className="font-black" style={{fontFamily:'Archivo'}}>{p.name}</h4><p className="text-[11px] text-zinc-400 line-clamp-1">{p.desc}</p>
              <Btn kind="white" className="w-full mt-2.5 !py-1.5 !text-[12px]" onClick={()=>usePreset(p)} disabled={souls.some(s=>s.name===p.name)}>{souls.some(s=>s.name===p.name) ? 'In your Souls' : 'Adopt Soul'}</Btn>
            </div>
          </div>))}
      </div>

      {/* Face Swap */}
      <section className="mt-10 rounded-[28px] border border-line bg-panel p-6">
        <div className="flex items-center gap-2.5">
          <span className="h-9 w-9 grid place-items-center rounded-xl bg-panel3 border border-line text-lime"><RefreshCw size={16}/></span>
          <div className="flex-1"><h3 className="font-extrabold">Face Swap Studio</h3><p className="text-[12px] text-zinc-500">Drop any Soul into any photo. Identity-locked, expression-preserved.</p></div>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-400"><Coins size={12} className="text-lime"/> 3 credits</span>
        </div>
        <div className="grid md:grid-cols-[1fr_auto_1fr_auto] gap-4 items-end mt-5">
          <Field label="1 · Source face (Soul)">
            {souls.length===0 ? <p className="text-[13px] text-zinc-500 rounded-2xl border border-dashed border-zinc-700 px-4 py-6 text-center">Train or adopt a Soul above first</p>
            : <div className="flex gap-2 flex-wrap">{souls.map(s=><button key={s.id} onClick={()=>setSwapSoul(s)} className={cx('rounded-2xl border overflow-hidden w-[76px] transition', swapSoul?.id===s.id ? 'border-lime ring-1 ring-lime' : 'border-line hover:border-zinc-500')}><img src={s.cover} alt={s.name} className="h-[76px] w-full object-cover"/><span className="block text-[10px] font-bold py-1 bg-panel2 text-center truncate">{s.name}</span></button>)}</div>}
          </Field>
          <span className="hidden md:grid h-10 w-10 place-items-center rounded-full bg-lime text-black font-black mb-6">→</span>
          <Field label="2 · Target photo"><ImageUpload label="Target photo" value={swapTarget} onChange={setSwapTarget} compact /></Field>
          <Btn kind="lime" className="!py-3 mb-4" disabled={!swapSoul || !swapTarget} onClick={()=>{
            if (credits < 3) { toast('Face Swap needs 3 credits', 'warn'); return }
            enqueue({ type:'image', modelId:'soul-v2', modelName:'Face Swap', prompt:`${swapSoul.name} swapped into target photo — expression, lighting and skin tone harmonized`, ratio:'1:1', w:1024, h:1024, cost:3, character: swapSoul.name, seed: (swapSoul.name.length*733 + swapTarget.length) % 99991, source:'face swap' })
            toast('Swapping faces — result lands in your Library')
          }}><Sparkles size={15}/> Swap face</Btn>
        </div>
      </section>

      <Modal open={creating} onClose={()=>!training && setCreating(false)}>
        <div className="p-6">
          <h3 className="text-xl font-black" style={{fontFamily:'Archivo'}}>Train a new Soul</h3>
          <p className="text-sm text-zinc-500 mt-1">3–5 clear photos, different angles. Only train faces you own the rights to.</p>
          <div className="mt-5"><Field label="Soul name"><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Nova, or your own name" className="w-full rounded-xl bg-panel2 border border-line px-4 py-3 text-sm placeholder:text-zinc-600" /></Field></div>
          <Field label={`Seed photos · ${photos.length}/8`}>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
            <div className="flex gap-2 flex-wrap">
              {photos.map((p,i)=><span key={i} className="relative"><img src={p} alt="" className="h-[72px] w-[72px] rounded-2xl object-cover border border-line"/><button onClick={()=>setPhotos(x=>x.filter((_,ix)=>ix!==i))} className="absolute -top-1.5 -right-1.5 h-5 w-5 grid place-items-center rounded-full bg-black border border-white/20"><X size={11}/></button></span>)}
              <button onClick={()=>fileRef.current.click()} className="h-[72px] w-[72px] rounded-2xl border border-dashed border-zinc-700 grid place-items-center text-zinc-500 hover:border-lime/60 hover:text-lime transition"><ImagePlus size={20}/></button>
              {photos.length===0 && <button onClick={()=>setPhotos([seedImg('demo-soul-a',400,400),seedImg('demo-soul-b',400,400),seedImg('demo-soul-c',400,400)])} className="text-[12px] font-bold text-lime hover:underline self-center">or use demo photos</button>}
            </div>
          </Field>
          <Field label="Default wardrobe"><div className="flex flex-wrap gap-1.5">{WARDROBE.map(w=><Chip key={w} active={wardrobe===w} onClick={()=>setWardrobe(w)}>{w}</Chip>)}</div></Field>
          {training>0 ? (
            <div className="rounded-2xl bg-panel2 border border-line p-4">
              <div className="flex items-center gap-2 text-sm font-bold"><Loader2 size={15} className="animate-spin text-lime"/> Training Soul ID… {Math.round(training)}%</div>
              <ProgressBar value={training} className="mt-3" />
              <div className="mt-3 space-y-1.5">{TRAIN_STEPS.map((s,i)=>(<p key={s} className={cx('text-[12px] flex items-center gap-2', training > (i+1)*(100/TRAIN_STEPS.length) ? 'text-lime' : training > i*(100/TRAIN_STEPS.length) ? 'text-zinc-200' : 'text-zinc-600')}>{training > (i+1)*(100/TRAIN_STEPS.length) ? <Check size={12}/> : <span className="h-3 w-3 rounded-full border border-current inline-block"/>}{s}</p>))}</div>
            </div>
          ) : <Btn kind="lime" className="w-full !py-3" onClick={train}><Fingerprint size={16}/> Start training — free on your plan</Btn>}
        </div>
      </Modal>
    </div>
  )
}
