import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings as SettingsIcon, LogOut, Crown, Coins, Trash2, KeyRound, Bell, Globe, ShieldCheck, Copy, RefreshCw } from 'lucide-react'
import { useApp } from '../store/AppContext.jsx'
import { cx, Btn, Field } from '../components/ui.jsx'

export default function Settings() {
  const { user, setUser, setAuthOpen, credits, plan, assets, setAssets, toast, jobs } = useApp()
  const [name, setName] = useState(user?.name || '')
  const [apiKey, setApiKey] = useState(()=> localStorage.getItem('hf_apikey') || 'hf_live_' + Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10))
  const [prefs, setPrefs] = useState(()=>{ try { return JSON.parse(localStorage.getItem('hf_prefs')||'{}') } catch { return {} } })
  const setPref = (k,v) => setPrefs(p=>{ const n={...p,[k]:v}; localStorage.setItem('hf_prefs', JSON.stringify(n)); return n })
  const spentAll = jobs.length
  const toggle = (label, key, def=true) => (
    <button onClick={()=>setPref(key, !(prefs[key] ?? def))} className="w-full flex items-center gap-3 rounded-2xl bg-panel2 border border-line px-4 py-3 text-left hover:border-zinc-500 transition">
      <span className="flex-1 text-sm font-semibold">{label}</span>
      <span className={cx('h-6 w-11 rounded-full p-1 transition shrink-0', (prefs[key] ?? def) ? 'bg-lime' : 'bg-panel3')}><span className={cx('block h-4 w-4 rounded-full bg-white transition', (prefs[key] ?? def) && 'translate-x-5 bg-black')} /></span>
    </button>
  )

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <header className="flex items-center gap-3">
        <span className="h-11 w-11 grid place-items-center rounded-2xl bg-lime text-black"><SettingsIcon size={21}/></span>
        <div><h1 className="font-black text-2xl tracking-tight" style={{fontFamily:'Archivo'}}>SETTINGS</h1>
        <p className="text-[12px] text-zinc-500">Profile, plan, API & workspace preferences — all local to this browser.</p></div>
      </header>

      {!user ? (
        <div className="mt-8 rounded-3xl border border-line bg-panel p-8 text-center">
          <p className="font-bold text-lg">You’re browsing as a guest</p>
          <p className="text-sm text-zinc-500 mt-1">Sign in to sync your identity across Souls, Speak and billing.</p>
          <Btn kind="lime" className="mt-4" onClick={()=>setAuthOpen(true)}>Sign in</Btn>
        </div>
      ) : (<>
        <section className="mt-6 rounded-3xl border border-line bg-panel p-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="h-16 w-16 rounded-full bg-gradient-to-br from-lime to-emerald-500 grid place-items-center font-black text-black text-2xl">{(user.name||'U')[0].toUpperCase()}</span>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2"><b className="text-lg">{user.name}</b><span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-lime text-black rounded-md px-2 py-0.5 uppercase"><Crown size={10}/>{plan.replace('-trial',' trial')}</span></div>
              <p className="text-[12px] text-zinc-500">{user.email}</p>
              <p className="text-[12px] text-zinc-500 flex items-center gap-1.5 mt-1"><Coins size={12} className="text-lime"/><b className="text-zinc-200">{credits.toLocaleString()}</b> credits · {assets.length} assets in library</p>
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
          <h3 className="font-extrabold flex items-center gap-2"><KeyRound size={16} className="text-lime"/> API access</h3>
          <p className="text-[12px] text-zinc-500 mt-1">Use Higgsfield from Claude (MCP), Cursor, or raw REST. Keep this key secret-ish.</p>
          <div className="flex gap-2 mt-3">
            <code className="flex-1 rounded-xl bg-black border border-line px-4 py-3 text-[12px] font-mono text-lime truncate">{apiKey}</code>
            <Btn className="!py-2" onClick={()=>{ navigator.clipboard?.writeText(apiKey); toast('API key copied') }}><Copy size={14}/> Copy</Btn>
            <Btn className="!py-2" onClick={()=>{ const k='hf_live_'+Math.random().toString(36).slice(2,18); setApiKey(k); localStorage.setItem('hf_apikey',k); toast('New API key issued — old one revoked') }}><RefreshCw size={14}/> Rotate</Btn>
          </div>
          <pre className="mt-3 rounded-2xl bg-black border border-line p-4 text-[11.5px] font-mono text-zinc-400 overflow-x-auto">{`curl https://api.higgsfield.ai/v1/generations \\
  -H "Authorization: Bearer ${apiKey.slice(0,14)}…" \\
  -d '{"model":"seedance-2-5","prompt":"neon samurai…","camera":"bullet-time"}'`}</pre>
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
            <Btn kind="danger" onClick={()=>{ setUser(null); toast('Signed out. Your local library stays on this device.') }}><LogOut size={14}/> Sign out</Btn>
          </div>
          <p className="text-[11px] text-zinc-600 mt-3 flex items-center gap-1.5"><Globe size={11}/> Data residency: this browser’s localStorage. Session job count: {spentAll}.</p>
        </section>
      </>)}
    </div>
  )
}
