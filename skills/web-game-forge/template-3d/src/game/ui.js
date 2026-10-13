// DOM-based HUD and menus. Text and bars are drawn by the browser, which keeps them
// crisp at any resolution and cheap to update. Only changed values are written.

import * as THREE from 'three';
import { PLAYER, BOSS } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(camera) {
    this.camera = camera;
    this.el = {
      hud: $('hud'),
      hp: $('hp-fill'),
      hpText: $('hp-text'),
      st: $('st-fill'),
      wave: $('wave'),
      kills: $('kills'),
      time: $('time'),
      banner: $('banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      boss: $('boss'),
      bossFill: $('boss-fill'),
      flash: $('flash'),
      dmg: $('dmg'),
      overlays: {
        menu: $('menu'),
        pause: $('pause'),
        dead: $('dead'),
        won: $('won'),
      },
      stats: $('stats'),
    };
    this.lastHp = -1;
    this.lastSt = -1;
    this.lastKills = -1;
    this.bannerT = 0;
    this.flashT = 0;
    this.bossShown = false;
    this._pops = [];
    this._v = new THREE.Vector3();
  }

  overlay(name, stats = null) {
    for (const k in this.el.overlays) {
      this.el.overlays[k].classList.toggle('show', k === name);
    }
    this.el.hud.classList.toggle('show', name === null);
    if (name && stats) {
      const fmt = (s) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
      };
      const text = `Time ${fmt(stats.time)} · Kills ${stats.kills}` + (stats.best ? ` · Best ${fmt(stats.best)}` : '');
      (name === 'dead' ? $('stats-dead') : this.el.stats).textContent = text;
    }
    if (name === null) this.el.hud.classList.add('show');
  }

  setPlayer(p, kills) {
    const hp = Math.max(0, p.hp) / PLAYER.hp;
    if (Math.abs(hp - this.lastHp) > 0.001) {
      this.lastHp = hp;
      this.el.hp.style.transform = `scaleX(${hp})`;
      this.el.hpText.textContent = `${Math.ceil(p.hp)}`;
    }
    const st = p.stamina / PLAYER.stamina;
    if (Math.abs(st - this.lastSt) > 0.002) {
      this.lastSt = st;
      this.el.st.style.transform = `scaleX(${st})`;
      this.el.st.classList.toggle('low', p.guardBroken);
    }
    if (kills !== this.lastKills) {
      this.lastKills = kills;
      this.el.kills.textContent = `Kills ${kills}`;
    }
  }

  setWave(text) {
    this.el.wave.textContent = text;
  }

  banner(title, sub = '', ms = 1800) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.remove('show');
    void this.el.banner.offsetWidth; // restart the CSS animation
    this.el.banner.classList.add('show');
    this.bannerT = ms / 1000;
  }

  flash(amount) {
    this.flashT = 0.35 * Math.max(0.3, amount);
    this.el.flash.style.opacity = String(Math.min(0.85, this.flashT * 2));
  }

  // Floating damage/feedback text anchored to a world position.
  popWorld(worldPos, text, color = '#fff', scale = 1) {
    const v = this._v.copy(worldPos).project(this.camera);
    if (v.z > 1) return;
    const x = (v.x + 1) / 2 * window.innerWidth;
    const y = (1 - v.y) / 2 * window.innerHeight;
    const node = document.createElement('div');
    node.className = 'pop';
    node.textContent = text;
    node.style.color = color;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.fontSize = `${Math.round(26 * scale)}px`;
    this.el.dmg.appendChild(node);
    this._pops.push({ node, t: 0 });
    if (this._pops.length > 28) {
      const old = this._pops.shift();
      old.node.remove();
    }
  }

  update(game, dt) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.remove('show');
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.el.flash.style.opacity = String(Math.max(0, this.flashT * 2));
    }
    for (let i = this._pops.length - 1; i >= 0; i--) {
      const p = this._pops[i];
      p.t += dt;
      if (p.t > 0.9) {
        p.node.remove();
        this._pops.splice(i, 1);
      }
    }

    const boss = game.enemies.find((e) => e.type === 'boss' && !e.dead);
    if (boss && game.state !== 'won') {
      if (!this.bossShown) {
        this.bossShown = true;
        this.el.boss.classList.add('show');
        this.el.boss.querySelector('.name').textContent = BOSS.name;
      }
      this.el.bossFill.style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp)})`;
    } else if (this.bossShown) {
      this.bossShown = false;
      this.el.boss.classList.remove('show');
    }

    const t = game.time;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    this.el.time.textContent = `${m}:${s}`;
  }
}
