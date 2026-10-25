import React, { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useLocation, Link } from 'react-router-dom'
import { Compass, Clapperboard, Sparkles, FolderOpen, Crown } from 'lucide-react'
import { AppProvider } from './store/AppContext.jsx'
import { Sidebar, Topbar, Toasts, JobDock, CommandPalette } from './components/shell.jsx'
import { PlayerModal, AuthModal } from './components/player.jsx'
import { Logo } from './components/ui.jsx'
import Explore from './pages/Explore.jsx'
import VideoStudio from './pages/VideoStudio.jsx'
import ImageStudio from './pages/ImageStudio.jsx'
import CinemaStudio from './pages/CinemaStudio.jsx'
import Speak from './pages/Speak.jsx'
import Soul from './pages/Soul.jsx'
import Effects from './pages/Effects.jsx'
import CanvasPage from './pages/Canvas.jsx'
import Influencer from './pages/Influencer.jsx'
import Agent from './pages/Agent.jsx'
import Library from './pages/Library.jsx'
import Pricing from './pages/Pricing.jsx'
import Academy from './pages/Academy.jsx'
import Settings from './pages/Settings.jsx'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(()=>{ document.getElementById('main-scroll')?.scrollTo({ top:0 }) },[pathname])
  return null
}

const MOBILE_NAV = [
  { to:'/', icon:Compass, label:'Explore' },
  { to:'/video', icon:Clapperboard, label:'Video' },
  { to:'/effects', icon:Sparkles, label:'Effects' },
  { to:'/library', icon:FolderOpen, label:'Library' },
  { to:'/pricing', icon:Crown, label:'Upgrade' },
]

function Footer() {
  const cols = [
    ['Create', [['Create Video','/video'],['Create Image','/image'],['Cinema Studio','/cinema'],['Speak','/speak'],['Effects','/effects']]],
    ['Platform', [['Soul ID','/soul'],['Supercomputer','/agent'],['AI Influencer','/influencer'],['Canvas','/canvas'],['Academy','/academy']]],
    ['Models', [['Seedance 2.5','/video?model=seedance-2-5'],['Kling 4.0','/video?model=kling-4'],['Sora 2','/video?model=sora-2'],['Nano Banana Pro','/image?model=nano-banana-pro'],['Genjutsu','/video?model=genjutsu']]],
    ['Company', [['Pricing','/pricing'],['My Library','/library'],['Settings & API','/settings'],['Explore','/']]],
  ]
  return (
    <footer className="border-t border-line bg-[#0c0c0e] mt-6">
      <div className="max-w-[1600px] mx-auto px-5 py-10 grid grid-cols-2 md:grid-cols-6 gap-8">
        <div className="col-span-2">
          <Logo />
          <p className="text-[12.5px] text-zinc-500 leading-relaxed mt-3 max-w-xs">The AI-native creative suite. Every frontier model, director-grade camera control, consistent characters and an agent that renders — in one place.</p>
          <p className="text-[11px] text-zinc-600 mt-4">Fan-made full-feature clone for demo purposes. Not affiliated with Higgsfield AI. Generations are simulated & rendered locally in your browser.</p>
        </div>
        {cols.map(([title, links])=>(
          <div key={title}><h4 className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">{title}</h4>
            <ul className="mt-3 space-y-2">{links.map(([label,to])=><li key={label}><Link to={to} className="text-[13px] text-zinc-400 hover:text-lime transition">{label}</Link></li>)}</ul></div>
        ))}
      </div>
      <div className="border-t border-line px-5 py-4 text-center text-[11px] text-zinc-600">HIGGSFIELD — built with React + Vite · press <kbd className="bg-panel3 border border-line rounded px-1.5 py-0.5 font-mono">Ctrl K</kbd> to search everything</div>
    </footer>
  )
}

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <AppProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar setMobileOpen={setMobileOpen} />
          <main id="main-scroll" className="flex-1 overflow-y-auto pb-[70px] lg:pb-0">
            <ScrollTop />
            <Routes>
              <Route path="/" element={<Explore />} />
              <Route path="/video" element={<VideoStudio />} />
              <Route path="/image" element={<ImageStudio />} />
              <Route path="/cinema" element={<CinemaStudio />} />
              <Route path="/speak" element={<Speak />} />
              <Route path="/soul" element={<Soul />} />
              <Route path="/effects" element={<Effects />} />
              <Route path="/canvas" element={<CanvasPage />} />
              <Route path="/influencer" element={<Influencer />} />
              <Route path="/agent" element={<Agent />} />
              <Route path="/library" element={<Library />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/academy" element={<Academy />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Explore />} />
            </Routes>
            <Footer />
          </main>
        </div>
      </div>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-[60] bg-[#0c0c0e]/95 backdrop-blur border-t border-line flex">
        {MOBILE_NAV.map(n=>(
          <NavLink key={n.to} to={n.to} end={n.to==='/'} className={({isActive})=>`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold ${isActive?'text-lime':'text-zinc-500'}`}>
            <n.icon size={19}/>{n.label}
          </NavLink>
        ))}
      </nav>
      <PlayerModal />
      <AuthModal />
      <CommandPalette />
      <JobDock />
      <Toasts />
    </AppProvider>
  )
}
