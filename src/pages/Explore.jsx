import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Heart, Sparkles, ArrowRight, ArrowUpRight, Flame, Wand2, ChevronLeft, ChevronRight, Eye, Repeat2, BadgeCheck } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, MotionImage, FxOverlay, Chip, Btn } from '../components/ui.jsx'
import { COMMUNITY_PROMPTS, AUTHORS, EXPLORE_TABS, VIDEO_MODELS, EFFECTS } from '../data/catalog.js'
import { seedImg, hash } from '../lib/engine.js'

const SLIDES = [
  { tag:'NEW MODEL', titleA:'Seedance', titleB:'2.5', sub:'The most advanced video model on Earth. Native audio, real physics, 1080p — now live.', cta:'Try Seedance 2.5', to:'/video?model=seedance-2-5', seed:'hero-seedance25', motion:'fpv-dive', accent:'#8b5cf6' },
  { tag:'HIGGSFIELD ORIGINAL', titleA:'Genjutsu', titleB:'Lite', sub:'Recast any motion with your characters, locations and products. Faster, lighter, cheaper.', cta:'Recreate for free', to:'/video?model=genjutsu-lite', seed:'hero-genjutsu', motion:'bullet-time', accent:'#d9ff4a' },
  { tag:'CINEMA STUDIO 4.0', titleA:'Direct', titleB:'Everything', sub:'70+ camera moves, real lenses, Mr. Higgs shot breakdowns. A film set that fits in a prompt.', cta:'Open Cinema Studio', to:'/cinema', seed:'hero-cinema4', motion:'crane-up-reveal', accent:'#ffb84a' },
  { tag:'SOUL V2', titleA:'Your face.', titleB:'Everywhere.', sub:'Train a Soul ID once. Star in infinite photos, films and ads without a single shoot day.', cta:'Create your Soul', to:'/soul', seed:'hero-soulv2', motion:'slow-push-in', accent:'#4ac8ff' },
]

function Hero() {
  const [i, setI] = useState(0)
  useEffect(()=>{ const iv=setInterval(()=>setI(v=>(v+1)%SLIDES.length), 6500); return ()=>clearInterval(iv) },[])
  const s = SLIDES[i]
  return (
    <section className="relative rounded-[28px] overflow-hidden border border-line grain min-h-[380px] sm:min-h-[440px] flex">
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.7}} className="absolute inset-0">
          <MotionImage src={seedImg(s.seed, 1600, 900)} motionId={s.motion} duration={9} className="absolute inset-0" imgClassName="brightness-[.62]" />
        </motion.div>
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="relative z-10 flex flex-col justify-end p-6 sm:p-10 max-w-3xl">
        <AnimatePresence mode="wait"><motion.div key={i} initial={{y:18,opacity:0}} animate={{y:0,opacity:1}} exit={{y:-12,opacity:0}} transition={{duration:.45}}>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold tracking-wider text-black" style={{background:s.accent}}><Sparkles size={12}/>{s.tag}</span>
          <h1 className="mt-4 font-black leading-[.92] tracking-tight text-[52px] sm:text-[84px]" style={{fontFamily:'Archivo'}}>{s.titleA} <span className="text-stroke">{s.titleB}</span></h1>
          <p className="mt-3 text-zinc-300 text-[15px] sm:text-lg leading-relaxed max-w-xl">{s.sub}</p>
          <div className="flex flex-wrap gap-2.5 mt-6">
            <Link to={s.to}><Btn kind="lime" className="!px-6 !py-3">{s.cta} <ArrowRight size={16}/></Btn></Link>
            <Link to="/pricing"><Btn className="!px-6 !py-3 !bg-white/10 backdrop-blur border-white/20">Get extra discount</Btn></Link>
          </div>
        </motion.div></AnimatePresence>
      </div>
      <div className="absolute z-10 right-5 bottom-5 flex items-center gap-2">
        <button onClick={()=>setI((i-1+SLIDES.length)%SLIDES.length)} className="h-9 w-9 grid place-items-center rounded-full bg-black/55 border border-white/15 hover:bg-black"><ChevronLeft size={16}/></button>
        <div className="flex gap-1.5">{SLIDES.map((_,ix)=><button key={ix} onClick={()=>setI(ix)} className={cx('h-1.5 rounded-full transition-all', ix===i?'w-7 bg-lime':'w-2.5 bg-white/30')} />)}</div>
        <button onClick={()=>setI((i+1)%SLIDES.length)} className="h-9 w-9 grid place-items-center rounded-full bg-black/55 border border-white/15 hover:bg-black"><ChevronRight size={16}/></button>
      </div>
    </section>
  )
}

const LAUNCH_CARDS = [
  { title:'Kling 4.0', sub:'Create & edit with references', to:'/video?model=kling-4', seed:'card-kling4', motion:'gimbal-chase' },
  { title:'Supercomputer', sub:'Agent powered by GPT-6 Astra', to:'/agent', seed:'card-super', motion:'through-object' },
  { title:'Content Factory', sub:'Trending styles in. Series out.', to:'/influencer', seed:'card-factory', motion:'rapid-zoom-burst' },
  { title:'Speak', sub:'Talking video in 40+ voices', to:'/speak', seed:'card-speak', motion:'anamorphic-breathing' },
  { title:'Canvas', sub:'Moodboard where films begin', to:'/canvas', seed:'card-canvas', motion:'slow-pan' },
]

function feedItems() {
  return COMMUNITY_PROMPTS.map(([prompt, model, ratio, fx], i) => {
    const [rw, rh] = ratio.split(':').map(Number)
    const h = hash(prompt)
    const effect = EFFECTS.find(e=>e.id===fx)
    return {
      id:'c'+i, prompt, modelName:model, type: i%6===4 ? 'image':'video',
      author: AUTHORS[h % AUTHORS.length], likes: 120 + (h % 48000), views: ((h%900)+40)+'K',
      duration: 4 + (h % 9), seed: 'comm'+h, ratio,
      url: seedImg('comm'+h, rw>=rh?880:620, rw>=rh? Math.round(880*rh/rw) : Math.round(620*rh/rw)),
      motionId: effect?.motion || ['slow-push-in','360-orbit','crane-up-reveal','bullet-time','dolly-in','hero-low-angle-arc'][h%6],
      filter: effect?.filter || 'none', overlay: effect?.overlay || 'none', effectId: fx==='none'?null:fx,
      ratioClass: ratio==='9:16'||ratio==='4:5' ? 'aspect-[3/4]' : ratio==='1:1' ? 'aspect-square' : ratio==='21:9' ? 'aspect-[21/9]' : 'aspect-video',
      res:'1080p', createdAt: Date.now() - h%800000000, source:'community',
    }
  })
}

function FeedCard({ item }) {
  const [hover,setHover] = useState(false)
  const { openPlayer, liked, toggleLike, toast } = useApp()
  const nav = useNavigate()
  const isLiked = liked.includes(item.id)
  return (
    <motion.article initial={{opacity:0,y:16}} whileInView={{opacity:1,y:0}} viewport={{once:true, margin:'-40px'}} transition={{duration:.4}}
      className="group relative rounded-3xl overflow-hidden border border-line bg-panel2 cursor-pointer"
      onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onClick={()=>openPlayer(item)}>
      <MotionImage src={item.url} motionId={item.motionId} playing={hover} duration={item.duration} filter={item.filter} className={cx('w-full', item.ratioClass)} />
      {hover && <FxOverlay overlay={item.overlay} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25 opacity-90 z-[6]" />
      <div className="absolute top-3 left-3 right-3 z-[7] flex items-center gap-2">
        <span className="h-7 w-7 rounded-full bg-gradient-to-br from-zinc-200 to-zinc-500 grid place-items-center text-[11px] font-black text-black">{item.author[0].toUpperCase()}</span>
        <span className="text-[12px] font-bold flex items-center gap-1 drop-shadow">{item.author} <BadgeCheck size={13} className="text-lime"/></span>
        <span className="ml-auto text-[10px] font-mono font-bold bg-black/55 rounded-md px-1.5 py-0.5">{item.type==='video' ? `0:${String(item.duration).padStart(2,'0')}` : 'IMG'}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3.5 z-[7]">
        <p className="text-[13px] font-medium leading-snug line-clamp-2 text-zinc-100">{item.prompt}</p>
        <div className="flex items-center gap-2 mt-2.5">
          <span className="text-[10px] font-extrabold bg-white text-black rounded-md px-1.5 py-0.5">{item.modelName}</span>
          <button onClick={e=>{e.stopPropagation(); toggleLike(item.id)}} className={cx('inline-flex items-center gap-1 text-[11px] font-bold rounded-full bg-black/55 border border-white/10 px-2 py-1 transition', isLiked ? 'text-red-400' : 'text-zinc-300')}>
            <Heart size={11} fill={isLiked?'currentColor':'none'}/>{(item.likes + (isLiked?1:0)).toLocaleString()}
          </button>
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400"><Eye size={11}/>{item.views}</span>
          <button onClick={e=>{e.stopPropagation(); nav('/video',{state:{prompt:item.prompt, motionId:item.motionId, effectId:item.effectId}}); toast('Prompt & settings loaded — make it yours')}} className="ml-auto inline-flex items-center gap-1 text-[11px] font-extrabold bg-lime text-black rounded-full px-2.5 py-1 opacity-0 group-hover:opacity-100 transition"><Repeat2 size={11}/> Remix</button>
        </div>
      </div>
      {item.type==='video' && !hover && <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[7] h-11 w-11 grid place-items-center rounded-full bg-black/45 border border-white/25 backdrop-blur"><Play size={17} className="ml-0.5"/></span>}
    </motion.article>
  )
}

export default function Explore() {
  const [tab, setTab] = useState('For You')
  const [quick, setQuick] = useState('')
  const nav = useNavigate()
  const items = useMemo(()=> {
    const all = feedItems()
    if (tab==='Trending') return [...all].sort((a,b)=>b.likes-a.likes)
    if (tab==='Effects') return all.filter(i=>i.effectId)
    if (tab==='Soul') return all.filter(i=>i.modelName.includes('Soul'))
    if (tab==='Cinema Studio') return all.filter(i=>['Seedance 2.5','Sora 2','Veo 3.1','DoP Turbo'].includes(i.modelName))
    if (tab==='UGC & Ads') return all.filter(i=>['Genjutsu Lite','Kling 4.0','Hailuo 2.3'].includes(i.modelName))
    if (tab==='Anime') return all.filter(i=>['Wan 2.6','Hailuo 2.3'].includes(i.modelName))
    if (tab==='Music Videos') return all.filter(i=>i.prompt.match(/jazz|dance|breakdance|perform/i))
    if (tab==='Following') return all.slice(0,0)
    return all
  },[tab])

  return (
    <div className="p-3 sm:p-5 space-y-5 max-w-[1700px] mx-auto">
      <Hero />

      {/* quick create */}
      <form onSubmit={e=>{e.preventDefault(); nav('/video',{state:{prompt:quick}})}} className="flex items-center gap-2 rounded-full border border-line bg-panel2 p-1.5 pl-5 focus-within:border-lime/50 transition shadow-xl">
        <Wand2 size={18} className="text-lime shrink-0" />
        <input value={quick} onChange={e=>setQuick(e.target.value)} placeholder="Describe anything… “a cyberpunk geisha in acid rain, bullet time”" className="flex-1 bg-transparent text-sm sm:text-[15px] placeholder:text-zinc-600 border-none min-w-0" />
        <button className="rounded-full bg-lime text-black font-extrabold text-sm px-5 py-2.5 hover:bg-[#eaff85] transition shrink-0">Create</button>
      </form>

      {/* launch cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {LAUNCH_CARDS.map((c,i)=>(
          <Link key={c.title} to={c.to} className={cx('group relative rounded-3xl overflow-hidden border border-line h-[132px]', i===4 && 'col-span-2 md:col-span-1')}>
            <MotionImage src={seedImg(c.seed, 700, 420)} motionId={c.motion} duration={7} className="absolute inset-0" imgClassName="brightness-[.55] group-hover:brightness-[.7] transition" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3.5 flex items-end gap-2">
              <div className="flex-1 min-w-0"><h3 className="font-extrabold text-[15px] leading-tight">{c.title}</h3><p className="text-[11px] text-zinc-400 leading-tight mt-0.5">{c.sub}</p></div>
              <span className="h-7 w-7 grid place-items-center rounded-full bg-white text-black shrink-0 group-hover:bg-lime transition"><ArrowUpRight size={14}/></span>
            </div>
          </Link>
        ))}
      </div>

      {/* model marquee */}
      <div className="relative overflow-hidden rounded-full border border-line bg-panel2 py-2.5 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
        <div className="flex w-max gap-8 pr-8" style={{animation:'marquee 36s linear infinite'}}>
          {[...VIDEO_MODELS, ...VIDEO_MODELS].map((m,i)=><span key={i} className="flex items-center gap-2 text-[13px] font-bold text-zinc-400 whitespace-nowrap"><span className={cx('h-2 w-2 rounded-full bg-gradient-to-br', m.grad)} />{m.name}<span className="text-zinc-600 font-semibold">{m.vendor}</span></span>)}
        </div>
      </div>

      {/* feed */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
        <Flame size={17} className="text-lime shrink-0" />
        {EXPLORE_TABS.map(t=><Chip key={t} active={tab===t} onClick={()=>setTab(t)}>{t}</Chip>)}
      </div>
      {items.length===0 ? (
        <div className="text-center py-20 text-zinc-500 text-sm">You’re not following anyone yet — the <b className="text-zinc-300">For You</b> feed is where the magic is.</div>
      ) : (
        <div className="masonry">{items.map(it=><FeedCard key={it.id} item={it} />)}</div>
      )}

      <section className="rounded-[28px] border border-lime/25 bg-gradient-to-br from-lime/12 via-panel2 to-violet-700/15 p-7 sm:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
        <div className="flex-1">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight" style={{fontFamily:'Archivo'}}>Sign up and get your <span className="text-lime">extra discount</span></h2>
          <ul className="mt-3 space-y-1 text-sm text-zinc-300">{['Unlimited Nano Banana Pro windows','Access to Seedance 2.5 & Sora 2','Every new model drop, day one'].map(x=><li key={x} className="flex gap-2"><span className="text-lime">✦</span>{x}</li>)}</ul>
        </div>
        <Link to="/pricing"><Btn kind="lime" className="!px-7 !py-3.5 !text-[15px]">Get your discount <ArrowRight size={16}/></Btn></Link>
      </section>
    </div>
  )
}
