import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings as SettingsIcon, LogOut, Crown, Coins, Trash2, KeyRound, Bell, Globe, ShieldCheck, Copy, RefreshCw, ExternalLink, PlugZap, Check, X, Loader2, Wallet, Eye, EyeOff } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Field, Seg } from '../components/ui.jsx'
import { PROVIDERS, testKey, money } from '../lib/providers.js'

function ProviderCard({ p }) {
  const { keys, setKeys, toast } = useApp()
  const [val, setVal] = useState('')
  const [base, setBase] = useState(keys.customBase || '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [show, setShow] = useState(false)
  const connected = p.id==='custom' ? !!(keys.customKey && keys.customBase) : !!keys[p.id]

  const saveAndTest = async () => {
    const next = { ...keys }
    if (p.id==='custom') { next.customKey = val.trim() || keys.customKey; next.customBase = base.trim() }
    else next[p.id] = val.trim()
    if (p.id!=='custom' && !next[p.id]) { toast('Paste a key first', 'warn'); return }
    setBusy(true); setResult(null)
    const r = await testKey(p.id, next)
    setBusy(false); setResult(r)
    if (r.ok) { setKeys(next); setVal(''); toast(`${p.name} connected — live generations will bill your ${p.name} account`) }
    else toast(`${p.name}: ${r.msg}`, 'warn')
  }
  const disconnect = () => {
    const next = { ...keys }; if (p.id==='custom') { delete next.customKey; delete next.customBase } else delete next[p.id]
    setKeys(next); setResult(null); toast(`${p.name} disconnected — key erased from this browser`)
  }

  return (
    <div className={cx('rounded-3xl border bg-panel p-5', connected ? 'border-lime/50' : 'border-line')}>
      <div className="flex items-start gap-3">
        <span className={cx('h-10 w-10 rounded-xl bg-gradient-to-br grid place-items-center font-black text-white shrink-0', p.grad)}>{p.name[0]}</span>
        <div className="flex-1 min-w-0">
          <h4 className="font-extrabold flex items-center gap-2 flex-wrap">{p.name}
            <span className={cx('text-[9px] font-black rounded-md px-1.5 py-0.5 tracking-wide', connected ? 'bg-lime text-black' : 'bg-panel3 text-zinc-500 border border-line')}>{connected ? 'CONNECTED' : 'NOT CONNECTED'}</span>
            {p.caps.map(c=><span key={c} className="text-[9px] font-bold bg-panel3 border border-line text-zinc-400 rounded-md px-1.5 py-0.5 uppercase">{c}</span>)}
          </h4>
          <p className="text-[12px] text-zinc-400 leading-relaxed mt-1">{p.blurb}</p>
        </div>
      </div>
      {connected ? (
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-lime"><Check size={13}/> Key saved locally{p.id==='custom' && <> · <span className="font-mono text-zinc-400 truncate max-w-[200px]">{keys.customBase}</span></>}</span>
          <span className="flex-1" />
          <Btn className="!py-1.5 !px-3 !text-[12px]" disabled={busy} onClick={async ()=>{ setBusy(true); const r = await testKey(p.id, keys); setBusy(false); setResult(r) }}>{busy ? <Loader2 size={13} className="animate-spin"/> : 'Test again'}</Btn>
          <Btn kind="danger" className="!py-1.5 !px-3 !text-[12px]" onClick={disconnect}>Disconnect</Btn>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {p.id==='custom' && <input value={base} onChange={e=>setBase(e.target.value)} placeholder="Base URL — e.g. https://api.together.xyz/v1" className="w-full rounded-xl bg-panel2 border border-line px-3.5 py-2.5 text-sm placeholder:text-zinc-600 font-mono text-[12px]" />}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input type={show?'text':'password'} value={val} onChange={e=>setVal(e.target.value)} placeholder={p.keyHint} autoComplete="off" className="w-full rounded-xl bg-panel2 border border-line px-3.5 py-2.5 text-sm placeholder:text-zinc-600 font-mono text-[12px] pr-9" />
              <button onClick={()=>setShow(!show)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">{show ? <EyeOff size={15}/> : <Eye size={15}/>}</button>
            </div>
            <Btn kind="lime" className="!py-2 shrink-0" disabled={busy} onClick={saveAndTest}>{busy ? <Loader2 size={14} className="animate-spin"/> : <PlugZap size={14}/>} Connect</Btn>
          </div>
          {p.getKey && <a href={p.getKey} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-bold text-lime hover:underline">Get a key at {p.name} <ExternalLink size={11}/></a>
          }
          {p.id==='custom' && <span className="text-[11px] text-zinc-500">Works with any OpenAI-compatible /chat/completions + /images/generations API you pay for.</span>}
        </div>
      )}
      {result && <p className={cx('mt-3 rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed border', result.ok ? 'bg-lime/8 border-lime/30 text-zinc-200' : 'bg-red-500/10 border-red-500/30 text-red-200')}>{result.msg}</p>}
    </div>
  )
}

function ProviderVault() {
  const { liveMode, setLiveMode, keys, setKeys, providerPrefs, setProviderPrefs, spendCap, setSpendCap, ledger, setLedger, monthSpend, toast } = useApp()
  const spent = monthSpend()
  return (
    <section className="mt-6">
      <div className="rounded-3xl border border-lime/30 bg-gradient-to-br from-lime/10 via-panel to-violet-700/10 p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[260px]">
            <h2 className="font-black text-xl tracking-tight flex items-center gap-2" style={{fontFamily:'Archivo'}}><PlugZap size={19} className="text-lime"/> REAL AI — YOU HOLD THE KEYS</h2>
            <p className="text-[13px] text-zinc-300 leading-relaxed mt-2 max-w-2xl">
              Connect <b>your own</b> provider account and every generation runs <b>for real</b> — straight from your browser to the provider, <b className="text-lime">billed to you</b> at their list prices (images from ~$0.003, video from ~$0.15).
              This app charges nothing and never sees your keys: they live only in this browser’s localStorage. No key? Demo mode below keeps the simulated engine.
            </p>
            <ol className="text-[12px] text-zinc-400 mt-3 space-y-1 list-none">
              {['Create an account at fal.ai (video+image), Google AI Studio (Nano Banana), and/or OpenRouter (brain+image)','Add billing / a few dollars of balance there — that’s who you pay, per generation','Paste the key below → flip to LIVE → generate real AI media'].map((s,i)=>(
                <li key={s} className="flex gap-2"><span className="h-[18px] w-[18px] shrink-0 grid place-items-center rounded-full bg-lime text-black text-[10px] font-black mt-px">{i+1}</span>{s}</li>))}
            </ol>
          </div>
          <div className="text-center">
            <Seg options={[{id:'demo',label:'Demo (app credits)'},{id:'live',label:'● LIVE AI (your keys)'}]} value={liveMode?'live':'demo'} onChange={v=>{ setLiveMode(v==='live'); toast(v==='live' ? 'Live mode — real generations on your accounts' : 'Demo mode — simulated generations') }} />
            <p className="text-[11px] text-zinc-500 mt-2">Current mode also toggles in the top bar</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3.5 mt-4">{PROVIDERS.map(p=><ProviderCard key={p.id} p={p} />)}</div>

      <div className="grid lg:grid-cols-2 gap-3.5 mt-4">
        <div className="rounded-3xl border border-line bg-panel p-5">
          <h4 className="font-extrabold text-sm mb-3">Routing preferences</h4>
          <Field label="Preferred image provider">
            <Seg size="sm" options={[{id:'fal',label:'fal.ai'},{id:'gemini',label:'Gemini'},{id:'openrouter',label:'OpenRouter'},{id:'custom',label:'Custom'}]} value={providerPrefs.image} onChange={v=>setProviderPrefs({...providerPrefs, image:v})} />
          </Field>
          <Field label="Preferred brain (agent · enhancer · Mr. Higgs)">
            <Seg size="sm" options={[{id:'openrouter',label:'OpenRouter'},{id:'gemini',label:'Gemini'},{id:'custom',label:'Custom'}]} value={providerPrefs.llm} onChange={v=>setProviderPrefs({...providerPrefs, llm:v})} />
          </Field>
          <Field label="OpenRouter chat model slug">
            <input value={keys.orModel||''} onChange={e=>setKeys({...keys, orModel:e.target.value})} placeholder="google/gemini-2.5-flash (default)" className="w-full rounded-xl bg-panel2 border border-line px-3.5 py-2.5 text-[12px] font-mono placeholder:text-zinc-600" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Custom image model"><input value={keys.customImageModel||''} onChange={e=>setKeys({...keys, customImageModel:e.target.value})} placeholder="gpt-image-1" className="w-full rounded-xl bg-panel2 border border-line px-3 py-2.5 text-[12px] font-mono placeholder:text-zinc-600" /></Field>
            <Field label="Custom chat model"><input value={keys.customChatModel||''} onChange={e=>setKeys({...keys, customChatModel:e.target.value})} placeholder="gpt-4o-mini" className="w-full rounded-xl bg-panel2 border border-line px-3 py-2.5 text-[12px] font-mono placeholder:text-zinc-600" /></Field>
          </div>
          <p className="text-[11px] text-zinc-600 leading-relaxed">Video always routes to fal.ai (the only browser-CORS-safe video API with Kling/Veo/Seedance-class models). If your chosen model isn’t on a provider, Higgsfield fails over to the closest real model automatically and labels it.</p>
        </div>

        <div className="rounded-3xl border border-line bg-panel p-5">
          <h4 className="font-extrabold text-sm flex items-center gap-2"><Wallet size={15} className="text-lime"/> Spend guard & ledger</h4>
          <div className="flex items-center gap-3 mt-3">
            <div className="rounded-2xl bg-panel2 border border-line px-4 py-3 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Est. this month</p><b className="text-xl">{money(spent)}</b></div>
            <div className="rounded-2xl bg-panel2 border border-line px-4 py-3 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Live generations</p><b className="text-xl">{ledger.length}</b></div>
          </div>
          <div className="mt-3"><Field label={`Monthly cap · $${spendCap} (0 = unlimited)`}>
            <input type="range" min={0} max={500} step={5} value={spendCap} onChange={e=>setSpendCap(+e.target.value)} className="w-full" />
          </Field></div>
          <div className="h-2 rounded-full bg-panel3 overflow-hidden"><div className="h-full bg-lime rounded-full" style={{width: spendCap? `${Math.min(100, spent/spendCap*100)}%` : '4%'}} /></div>
          <p className="text-[11px] text-zinc-600 mt-2">Estimates use public list prices; your provider dashboard is the source of truth. The cap blocks new live gens before you overspend.</p>
          {ledger.length>0 && (<>
            <div className="mt-3 space-y-1 max-h-36 overflow-y-auto pr-1">
              {ledger.slice(0,10).map((l,i)=>(<div key={i} className="flex items-center gap-2 text-[11.5px] border-b border-line/60 pb-1.5"><span className="font-bold">{l.provider}</span><span className="text-zinc-500 flex-1 truncate">{l.model} · {l.type}</span><span className="text-zinc-600">{new Date(l.ts).toLocaleDateString()}</span><b className="text-lime">{money(l.usd||0)}</b></div>))}
            </div>
            <button onClick={()=>setLedger([])} className="text-[11px] font-bold text-zinc-500 hover:text-red-300 mt-2">Clear ledger</button>
          </>)}
        </div>
      </div>
    </section>
  )
}

export default function Settings() {
  const { user, setUser, setAuthOpen, credits, plan, assets, setAssets, toast, jobs } = useApp()
  const [name, setName] = useState(user?.name || '')
  const [apiKey, setApiKey] = useState(()=> localStorage.getItem('hf_apikey') || 'hf_live_' + Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10))
  const [prefs, setPrefs] = useState(()=>{ try { return JSON.parse(localStorage.getItem('hf_prefs')||'{}') } catch { return {} } })
  const setPref = (k,v) => setPrefs(p=>{ const n={...p,[k]:v}; localStorage.setItem('hf_prefs', JSON.stringify(n)); return n })
  const toggle = (label, key, def=true) => (
    <button onClick={()=>setPref(key, !(prefs[key] ?? def))} className="w-full flex items-center gap-3 rounded-2xl bg-panel2 border border-line px-4 py-3 text-left hover:border-zinc-500 transition">
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span className={cx('h-6 w-11 rounded-full p-1 transition shrink-0', (prefs[key] ?? def) ? 'bg-lime' : 'bg-panel3')}><span className={cx('block h-4 w-4 rounded-full bg-white transition', (prefs[key] ?? def) && 'translate-x-5 bg-black')} /></span>
    </button>
  )

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <header className="flex items-center gap-3">
        <span className="h-11 w-11 grid place-items-center rounded-2xl bg-lime text-black"><SettingsIcon size={21}/></span>
        <div><h1 className="font-black text-2xl tracking-tight" style={{fontFamily:'Archivo'}}>SETTINGS</h1>
        <p className="text-[12px] text-zinc-500">AI providers, profile & preferences — everything stays in this browser.</p></div>
      </header>

      <ProviderVault />

      {!user ? (
        <div className="mt-6 rounded-3xl border border-line bg-panel p-8 text-center">
          <p className="font-bold text-lg">You’re browsing as a guest</p>
          <p className="text-sm text-zinc-500 mt-1">Provider keys work without an account. Sign in only if you want a name on your creations.</p>
          <Btn kind="lime" className="mt-4" onClick={()=>setAuthOpen(true)}>Sign in</Btn>
        </div>
      ) : (<>
        <section className="mt-6 rounded-3xl border border-line bg-panel p-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="h-16 w-16 rounded-full bg-gradient-to-br from-lime to-emerald-500 grid place-items-center font-black text-black text-2xl">{(user.name||'U')[0].toUpperCase()}</span>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2"><b className="text-lg">{user.name}</b><span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-lime text-black rounded-md px-2 py-0.5 uppercase"><Crown size={10}/>{plan.replace('-trial',' trial')}</span></div>
              <p className="text-[12px] text-zinc-500">{user.email}</p>
              <p className="text-[12px] text-zinc-500 flex items-center gap-1.5 mt-1"><Coins size={12} className="text-lime"/><b className="text-zinc-200">{credits.toLocaleString()}</b> demo credits · {assets.length} assets in library</p>
            </div>
            <Link to="/pricing"><Btn kind="lime">Manage plan</Btn></Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            <Field label="Display name"><input value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-xl bg-panel2 border border-line px-4 py-3 text-sm" /></Field>
            <Field label="Email"><input value={user.email||''} readOnly className="w-full rounded-xl bg-panel2 border border-line px-4 py-3 text-sm opacity-60" /></Field>
          </div>
          <Btn kind="white" className="!py-2" onClick={()=>{ setUser({ ...user, name: name.trim() || user.name }); toast('Profile updated') }}>Save changes</Btn>
        </section>

        <section className="mt-4 rounded-3xl border border-line bg-panel p-6">
          <h3 className="font-extrabold flex items-center gap-2"><KeyRound size={16} className="text-lime"/> Higgsfield API <span className="text-[10px] font-bold bg-panel3 border border-line text-zinc-400 rounded-md px-1.5 py-0.5">DEMO KEY</span></h3>
          <p className="text-[12px] text-zinc-500 mt-1">For MCP/automation experiments. Live generation above uses your provider keys, not this one.</p>
          <div className="flex gap-2 mt-3">
            <code className="flex-1 rounded-xl bg-black border border-line px-4 py-3 text-[12px] font-mono text-lime truncate">{apiKey}</code>
            <Btn className="!py-2" onClick={()=>{ navigator.clipboard?.writeText(apiKey); toast('API key copied') }}><Copy size={14}/> Copy</Btn>
            <Btn className="!py-2" onClick={()=>{ const k='hf_live_'+Math.random().toString(36).slice(2,18); setApiKey(k); localStorage.setItem('hf_apikey',k); toast('New API key issued — old one revoked') }}><RefreshCw size={14}/> Rotate</Btn>
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-line bg-panel p-6 space-y-2">
          <h3 className="font-extrabold flex items-center gap-2 mb-1"><Bell size={16} className="text-lime"/> Preferences</h3>
          {toggle('Email me when long renders finish', 'emailDone')}
          {toggle('New model drop announcements', 'modelDrops')}
          {toggle('Auto-enhance prompts by default', 'autoEnhance')}
          {toggle('Public profile on Explore (community visibility)', 'publicProfile')}
          {toggle('Allow anonymous usage analytics', 'analytics', false)}
          {toggle('Never train on my generations', 'noTrain')}
        </section>

        <section className="mt-4 rounded-3xl border border-red-500/25 bg-red-500/[0.04] p-6">
          <h3 className="font-extrabold text-red-300 flex items-center gap-2"><ShieldCheck size={16}/> Danger zone</h3>
          <div className="flex flex-wrap gap-2 mt-4">
            <Btn kind="danger" onClick={()=>{ if (confirm('Delete ALL assets in your library? This cannot be undone.')) { setAssets([]); toast('Library wiped clean') } }}><Trash2 size={14}/> Delete all assets</Btn>
            <Btn kind="danger" onClick={()=>{ setUser(null); toast('Signed out. Your local library & keys stay on this device.') }}><LogOut size={14}/> Sign out</Btn>
          </div>
          <p className="text-[11px] text-zinc-600 mt-3 flex items-center gap-1.5"><Globe size={11}/> Data residency: this browser’s localStorage. Session job count: {jobs.length}.</p>
        </section>
      </>)}
    </div>
  )
}
