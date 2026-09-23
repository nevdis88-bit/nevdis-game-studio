import { RUN_RULES } from './config/levels';
import type { RunEndReason } from './game/RunState';
import { ACTIVITY } from './config/ActivityConfig';
import { ActivityStore } from './game/ActivityStore';
import type { GameScene } from './scenes/GameScene';

interface Platform {
  closeActivity?(): void | Promise<void>;
  showRewardedAd(): Promise<{ completed: boolean; receipt?: string }>;
  getInviteReceipts?(): Promise<string[]>;
  getInviteUrl?(userId: string): string;
}
declare global { interface Window { FieldGoalPlatform?: Platform; __FGR_DEMO__?: unknown; } }
const art = (name: string, cls = '', alt = '') => `<img class="${cls}" src="./assets/figma/${name}" alt="${alt}" draggable="false">`;
const coin = (cls = '') => art('72088.png', cls);
const popupHeader = () => art('popup-header-v2.png', 'popup-art');
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const number = (n: number) => n.toLocaleString('en-US');
const btn = (action: string, label: string, cls = 'primary', extra = '') => `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;

export class ActivityUI {
  scene!: GameScene;
  private ready = false;
  private page: 'home' | 'game' = 'home';
  private modal = '';
  private roundId: string | null = null;
  private resultCoins = 0;
  private resultReason: RunEndReason = 'time';
  private busy = false;
  private adTimer?: ReturnType<typeof setInterval>;
  private adToken = 0;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private previousFocus?: HTMLElement;
  private root = document.querySelector<HTMLElement>('#ui')!;
  private overlays = document.querySelector<HTMLElement>('#overlays')!;
  readonly demo = new URLSearchParams(location.search).get('demo') === '1';
  constructor(readonly store: ActivityStore) {
    this.renderHome();
    document.querySelector('#device')!.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (b && !(b as HTMLButtonElement).disabled) void this.action(b.dataset.action!);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (this.modal) void this.action('close'); else if (this.page === 'game') this.openPause(); }
      if (e.key === 'Tab' && this.modal) {
        const focusable = [...this.overlays.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    const refresh = () => { store.refresh(); if (this.page === 'home') this.renderHome(); void this.syncInvites(); };
    window.addEventListener('focus', refresh);
    setInterval(() => { if (document.hidden) return; const oldDay = store.state.day; store.refresh(); if (oldDay !== store.state.day && this.page === 'home') this.renderHome(); }, 30_000);
    if (this.demo) this.addDemoTools();
    void this.syncInvites();
  }
  attach(scene: GameScene) { this.scene = scene; }
  onReady() { this.ready = true; this.applySettings(); this.renderHome(); }
  updateHud(coins: number, seconds: number, lives: number) {
    const c = document.querySelector('#run-coins'), t = document.querySelector('#run-clock');
    if (c) c.textContent = String(coins);
    const hearts = document.querySelector<HTMLElement>('#run-lives');
    if (hearts && hearts.dataset.lives !== String(lives)) {
      hearts.innerHTML = this.hearts(lives); hearts.dataset.lives = String(lives);
      hearts.setAttribute('aria-label', `${lives} lives remaining`);
      hearts.title = `${lives} lives remaining`;
    }
    if (t) { t.textContent = `00:${String(seconds).padStart(2, '0')}`; t.classList.toggle('urgent', seconds <= 5); }
  }
  ended(coins: number, _goals: number, reason: RunEndReason) {
    if (!this.roundId) return;
    this.store.finishRun(this.roundId, coins); this.roundId = null;
    this.resultCoins = coins; this.resultReason = reason; this.showResult();
  }
  private status(game = false) {
    return `<div class="status ${game ? 'game-status' : ''}" aria-hidden="true"><span>${game ? '9:41' : '8:00'}</span>${game ? art('22b7f.svg','game-signals') : `<div class="signals">${art('33097.svg')}${art('b391c.svg')}${art('de8c8.svg')}</div>`}</div>`;
  }
  private renderHome() {
    if (this.page !== 'home') return;
    const s = this.store.state, percent = Math.min(100, s.earnedToday / ACTIVITY.target * 100);
    this.root.innerHTML = `<section class="home-scroll" aria-label="Field Goal Rush home"><div class="home-content">
      ${art('89d99.png','home-background')}
      <div class="home-shade"></div>${this.status()}
      <nav class="home-nav">${btn('exit', art('back-icon.svg'), 'circle', 'aria-label="Exit game"')}
        <div class="nav-right">${btn('sound', art('c8f6c.svg'), 'circle sound-button', `aria-label="Toggle sound" aria-pressed="${s.settings.sound || s.settings.music}"`)}
        ${btn('records', `${coin()}<span>${number(s.balance)}</span>${art('avatar.png','avatar')}`, 'wallet', 'aria-label="Reward balance and history"')}</div></nav>
      ${art('ad413.png','game-logo','Field Goal Rush')}
      <section class="daily-card" aria-label="Daily bonus">
        <div class="daily-label"><b>Daily Bonus</b><span>：Earn ${ACTIVITY.target} coins · Get ${ACTIVITY.bonus} extra</span></div>
        <div class="daily-total"><strong>${number(s.earnedToday)}</strong><span>/${ACTIVITY.target}</span></div>
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${ACTIVITY.target}" aria-valuenow="${Math.min(s.earnedToday,ACTIVITY.target)}" aria-label="Daily coins"><div class="progress-fill" style="width:${percent}%"></div></div>
        ${btn('claim', `<span class="bonus-coin" aria-hidden="true"><i>${art('93363.png')}</i></span><span>${s.bonusClaimed ? 'Claimed' : this.store.canClaim ? 'Claim' : ACTIVITY.bonus}</span>`, 'bonus-badge', `aria-label="${s.bonusClaimed ? 'Daily bonus claimed' : this.store.canClaim ? 'Claim daily bonus' : 'Daily bonus target'}" ${s.bonusClaimed ? 'disabled' : ''}`)}
      </section>
      ${btn(this.store.plays ? 'start' : 'more', `${this.store.plays ? art('play-icon.svg') : ''}<span>${this.store.plays ? 'Play now' : 'Get More Plays'}</span>`, 'primary start-button', this.ready ? '' : 'disabled')}
      <div class="plays-left">${this.store.plays} ${this.store.plays === 1 ? 'play' : 'plays'} left</div>
      <section class="more-card" id="more-plays"><h2>Get More Plays</h2>
        <div class="task"><div class="task-icon">${art('8886a.png')}</div><span>Invite a new user</span>${btn('invite', '+ 10 Plays', 'task-button invite-task')}</div>
        <div class="task-divider"></div>
        <div class="task"><div class="task-icon">${art('6fa0e.png')}</div><span>Watch an Ad (${s.adsUsed}/${ACTIVITY.dailyAds})</span>${btn('ad-home', s.adsUsed >= ACTIVITY.dailyAds ? 'Done' : '+ 1 Play', 'task-button', s.adsUsed >= ACTIVITY.dailyAds ? 'disabled' : '')}</div>
      </section>
    </div></section>`;
  }
  private hearts(lives: number) {
    return Array.from({length: RUN_RULES.lives}, (_, i) => art(i < lives ? '4a7ee.png' : 'ef7a1.svg')).join('');
  }
  private renderGame() {
    const lives = RUN_RULES.lives;
    this.root.innerHTML = `<div class="game-ui">${this.status(true)}${btn('pause',art('0c779.svg'),'pause-button','aria-label="Pause game"')}
      <div class="game-counters"><div class="coin-counter">${coin()}<span id="run-coins">0</span></div><div class="plays-counter" id="run-lives" data-lives="${lives}" aria-label="${lives} lives remaining" title="${lives} lives remaining">${this.hearts(lives)}</div></div>
      <div class="run-clock" id="run-clock">00:30</div></div>`;
  }
  private async start() {
    if (!this.ready || this.busy || this.roundId) return;
    const id = this.store.startRun();
    if (!id) { this.home(); this.more(); return; }
    this.closeModal(); this.roundId = id; this.page = 'game';
    document.querySelector('#game')!.classList.add('visible');
    this.renderGame(); this.applySettings(); this.scene.startRun();
  }
  private home() {
    this.closeModal(); this.scene?.quitRun(); this.page = 'home';
    document.querySelector('#game')!.classList.remove('visible');
    this.store.refresh(); this.renderHome();
  }
  private more() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('#more-plays')?.scrollIntoView({ behavior:reducedMotion ? 'auto' : 'smooth', block:'end' });
    const b = document.querySelector('.invite-task');
    // Repeated taps should not interrupt a breath or stack delayed cleanups.
    if (!b || reducedMotion || b.classList.contains('nudge')) return;
    b.addEventListener('animationend', () => b.classList.remove('nudge'), { once:true });
    b.classList.add('nudge');
  }
  private popup(body: string, name: string, cls = '') {
    this.previousFocus = document.activeElement as HTMLElement;
    this.modal = name;
    this.overlays.innerHTML = `<div class="scrim ${cls}" role="presentation"><div class="dialog-content" role="dialog" aria-modal="true" aria-label="${name}">${body}</div></div>`;
    this.root.inert = true;
    this.overlays.querySelector<HTMLElement>('button:not(:disabled)')?.focus({preventScroll:true});
  }
  private closeModal() {
    this.modal = ''; this.overlays.innerHTML = ''; this.root.inert = false;
    this.previousFocus?.focus({preventScroll:true});
  }
  private closeButton() { return btn('close',art('2ec07.svg'),'close-button','aria-label="Close"'); }
  private showResult() {
    const hasPlays = this.store.plays > 0, ads = this.store.state.adsUsed;
    this.popup(`<div class="result-card ${hasPlays ? '' : 'with-ad'}">
      ${popupHeader()}
      <div class="result-main">${this.closeButton()}<div class="result-copy"><h1>${this.resultReason === 'lives' ? 'Out of Lives!' : 'Time’s Up!'}</h1><p>${this.resultCoins > 0 ? 'Congrats! You earned' : 'Keep practicing! You earned'}</p>
      <div class="result-reward">${art('16497.svg','plus')}${coin()}<strong>${number(this.resultCoins)}</strong></div></div>
      <div class="result-buttons">${btn(hasPlays?'again':'home',hasPlays?'Play Again':'OK')}</div></div>
      ${!hasPlays ? `<div class="ad-footer"><div class="ad-icon">${art('d4d17.svg')}</div><div class="ad-copy">${ads < ACTIVITY.dailyAds ? `Watch an ad (${ads}/${ACTIVITY.dailyAds})<br>get 1 extra play` : 'Daily ad limit reached<br>Invite for 10 plays'}</div>${btn(ads<ACTIVITY.dailyAds?'ad-game':'invite',ads<ACTIVITY.dailyAds?'Go':'Invite','mini-button')}</div>` : ''}
      </div>`, 'Round result', 'result-scrim');
  }
  private openPause() {
    if (this.page !== 'game' || !this.roundId) return;
    this.scene.pausePlay();
    if (!this.roundId) return; // A buzzer reached while pausing has already opened the result.
    const s = this.store.state.settings;
    this.popup(`<div class="pause-card">${popupHeader()}
      <div class="settings">${(['sound','music','haptics'] as const).map((k,i)=>`<div class="setting-row">${art(['f5a14.svg','6d570.svg','514be.svg'][i])}<span>${['Sound Effects','Music','Haptics'][i]}</span>${btn('toggle-'+k,'',`switch ${s[k]?'on':''}`,`role="switch" aria-checked="${s[k]}" aria-label="${k}"`)}</div>`).join('')}</div>
      <div class="pause-buttons">${btn('continue','Continue')}${btn('quit','Quit Challenge','secondary')}</div></div>`, 'Pause', 'pause-scrim');
  }
  private invite() {
    this.popup(`<div class="invite-card">${art('share-art.png','share-art')}
      <div class="invite-steps"><div><b>1</b><span>Share link with a friend</span></div><div><b>2</b><span>Invite a new user, get 10 extra<br>plays</span></div><div><b>3</b><span>Play more, earn more rewards</span></div></div>
      <div class="invite-foot">Only successful new-user invites<br>qualify for the reward.</div></div>
      <div class="share-sheet"><div class="share-title">Send to</div>${btn('close',art('3a869.svg'),'share-close','aria-label="Close sharing"')}
      <div class="share-channels">${[['whatsapp','644d2.svg','WhatsApp'],['copy','3ec93.svg','Copy link'],['native','ea011.svg','Message'],['facebook','fb4f0.svg','Facebook'],['native','644d2.svg','WhatsApp<br>status'],['native','c1679.svg','Instagram']].map(([a,im,label])=>btn('share-'+a,`${art(im)}<span>${label}</span>`,'share-channel')).join('')}</div><div class="home-indicator"></div></div>`, 'Invite friends', 'invite-scrim');
  }
  private inviteUrl() {
    if (window.FieldGoalPlatform?.getInviteUrl) return window.FieldGoalPlatform.getInviteUrl(this.store.state.userId);
    const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('invite', this.store.state.userId); return url.toString();
  }
  private async share(channel: string) {
    const url = this.inviteUrl(), text = 'Play Field Goal Rush with me!';
    try {
      if (channel === 'copy') { await navigator.clipboard.writeText(url); this.toast('Link copied'); }
      else if (channel === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(text+' '+url)}`,'_blank','noopener,noreferrer');
      else if (channel === 'facebook') window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,'_blank','noopener,noreferrer');
      else if (navigator.share) await navigator.share({title:'Field Goal Rush',text,url});
      else { await navigator.clipboard.writeText(url); this.toast('Link copied — share with a friend'); }
    } catch (e) { if ((e as DOMException).name !== 'AbortError') this.toast('Could not share. Please try again.'); }
  }
  private async syncInvites() {
    try { for (const receipt of await window.FieldGoalPlatform?.getInviteReceipts?.() ?? []) {
      if (this.store.grantInvite(receipt)) this.toast('+10 plays received');
    } if (this.page==='home') this.renderHome(); } catch { /* Retry when user returns. */ }
  }
  private async watchAd(fromGame: boolean) {
    this.store.refresh();
    if (this.busy || this.store.state.adsUsed >= ACTIVITY.dailyAds) return;
    this.busy = true;
    const token = ++this.adToken;
    const complete = async (receipt: string) => {
      if (token !== this.adToken) return;
      this.busy = false;
      if (!this.store.grantAd(receipt)) { this.toast('Reward already received or daily limit reached'); if(fromGame)this.showResult();else this.home(); return; }
      this.closeModal(); this.toast('Chance Got', true);
      if (fromGame) { await new Promise(r=>setTimeout(r,900)); if(token===this.adToken) await this.start(); }
      else this.renderHome();
    };
    if (window.FieldGoalPlatform) {
      this.popup('<div class="simple-card"><h1>Loading ad…</h1><p>Your play will be added after the ad.</p></div>','Advertisement');
      try { const r = await window.FieldGoalPlatform.showRewardedAd();
        if (token !== this.adToken) return;
        if (r.completed && r.receipt) await complete(r.receipt);
        else { this.busy = false; if(fromGame)this.showResult();else this.home(); this.toast('Finish the ad to get a play'); }
      } catch { if (token !== this.adToken) return; this.busy=false; if(fromGame)this.showResult();else this.home(); this.toast('Ad unavailable. Try again.'); }
      return;
    }
    if (!this.demo) {
      this.busy=false;
      this.popup(`<div class="simple-card">${this.closeButton()}<h1>Ad unavailable</h1><p>Please try again later.</p>${btn(fromGame?'result':'home','OK')}</div>`,'Ad unavailable'); return;
    }
    let remaining = ACTIVITY.demoAdSeconds;
    this.popup(`<div class="simple-card demo-ad"><span class="eyebrow">DEMO AD</span><h1>One more round.</h1>${art('ad413.png','ad-logo')}<p>Complete this preview to get 1 play.</p><strong id="ad-count">${remaining}s</strong>${btn('cancel-ad','Cancel','secondary')}</div>`, 'Demo advertisement');
    this.adTimer = setInterval(()=>{
      if (document.hidden) return;
      remaining--; const label=document.querySelector('#ad-count'); if(label)label.textContent=remaining+'s';
      if(remaining<=0) { clearInterval(this.adTimer); void complete('demo-ad:'+crypto.randomUUID()); }
    },1000);
  }
  private toast(message: string, center = false) {
    const el=document.querySelector<HTMLElement>('#toast')!;
    clearTimeout(this.toastTimer);el.className=center?'toast center-toast':'toast';
    el.innerHTML=center?`<span class="check">✓</span><span>${escape(message)}</span>`:escape(message);
    el.hidden=false;this.toastTimer=setTimeout(()=>el.hidden=true,center?900:2400);
  }
  private applySettings() { const s=this.store.state.settings; this.scene?.setAudio(s.sound,s.music,s.haptics); }
  private async action(a: string) {
    if(a.startsWith('toggle-')) { const k=a.slice(7) as 'sound'|'music'|'haptics';this.store.setSetting(k,!this.store.state.settings[k]);this.applySettings();this.openPause();return; }
    if(a.startsWith('share-')) { await this.share(a.slice(6));return; }
    switch(a) {
      case 'start':case 'again': await this.start();break;
      case 'home':this.home();break;
      case 'exit':
        if (window.FieldGoalPlatform?.closeActivity) await window.FieldGoalPlatform.closeActivity();
        else window.history.back();
        break;
      case 'more':this.more();break;
      case 'pause':this.openPause();break;
      case 'continue':this.closeModal();this.scene.resumePlay();break;
      case 'quit':this.store.quitRun();this.roundId=null;this.home();break;
      case 'invite':this.invite();break;
      case 'ad-home':await this.watchAd(false);break;
      case 'ad-game':await this.watchAd(true);break;
      case 'cancel-ad': clearInterval(this.adTimer);this.adToken++;this.busy=false;if(this.page==='game')this.showResult();else this.home();break;
      case 'result':this.showResult();break;
      case 'close':
        if(this.busy) { if(this.demo) await this.action('cancel-ad'); break; }
        if(this.modal==='Pause'){this.closeModal();this.scene.resumePlay();}
        else if(this.page==='game')this.home();else this.closeModal();break;
      case 'sound': {const on=!(this.store.state.settings.sound||this.store.state.settings.music);this.store.setSetting('sound',on);this.store.setSetting('music',on);this.applySettings();this.renderHome();break;}
      case 'claim':
        if(this.store.claim()){this.renderHome();this.popup(`<div class="simple-card bonus-success">${popupHeader()}${this.closeButton()}<h1>Daily Bonus!</h1><p>You reached today's goal.</p><div class="result-reward">${coin()}<strong>+${ACTIVITY.bonus}</strong></div>${btn('close','Great!')}</div>`,'Daily bonus');}
        else this.toast(this.store.state.bonusClaimed?'Already claimed today':`Earn ${Math.max(0,ACTIVITY.target-this.store.state.earnedToday)} more coins to unlock`);break;
      case 'records': { const rows=this.store.state.records.map(r=>`<li><span>${({round:'Round reward',bonus:'Daily bonus',invite:'New-user invite',ad:'Rewarded ad'})[r.kind]}<small>${new Date(r.at).toLocaleString()}</small></span><b>+${r.amount} ${r.kind==='ad'||r.kind==='invite'?'plays':'coins'}</b></li>`).join('');
        this.popup(`<div class="simple-card records">${this.closeButton()}<h1>Your rewards</h1><div class="balance-total">${coin()}${number(this.store.state.balance)}</div><ul>${rows||'<li>No rewards yet. Play your first round!</li>'}</ul>${btn('close','Done')}</div>`,'Reward history');break; }
    }
  }
  private addDemoTools() {
    const pane=document.querySelector<HTMLElement>('#demo-tools')!;pane.hidden=false;
    pane.innerHTML=`<span class="demo-tag">LOCAL PREVIEW</span><h2>试玩工具</h2><p>活动界面使用真实状态。广告和邀请通过下方工具模拟，尚未接入正式平台。</p><button data-demo="sample">Figma 示例：首页 70/100</button><button data-demo="fresh">新用户 · 3 次机会</button><button data-demo="empty">机会用完</button><button data-demo="limit">广告额度用完</button><button data-demo="invite">模拟成功邀请 · +10 次</button><button data-demo="finish">结束本局</button>${import.meta.env.DEV && new URLSearchParams(location.search).get('qa') === '1' ? '<button data-demo="qa-hit">测试命中一球</button><button data-demo="qa-miss">测试射失一球</button><button data-demo="qa-throw">慢动作投掷（测试）</button>' : ''}<button data-demo="result">Figma 示例：结算 +500</button><button data-demo="bonus">达到每日目标</button><small>试玩参数：100 达标 / 80 奖励<br>广告 15 秒 · UTC 每日刷新</small>`;
    pane.addEventListener('click',e=>{const action=(e.target as HTMLElement).dataset.demo;if(!action||this.busy)return;
      if(action==='qa-throw'){this.scene.qaKick(false,true);return;}
      if(action==='qa-hit'||action==='qa-miss'){this.scene.qaKick(action==='qa-miss');return;}
      if(action==='finish'){if(this.roundId){this.scene.clock.remainingMs=0;this.scene.resumePlay();this.closeModal();}return;}
      if(action==='invite'){this.store.grantInvite('demo-invite:'+crypto.randomUUID());this.toast('+10 plays received');if(this.page==='home')this.renderHome();return;}
      if(this.roundId){this.store.quitRun();this.roundId=null;}this.home();
      if(action==='fresh')this.store.demo({freePlays:3,extraPlays:0,adsUsed:0,earnedToday:0,balance:0,bonusClaimed:false,records:[],transactions:[]});
      if(action==='sample')this.store.demo({freePlays:2,extraPlays:0,adsUsed:0,earnedToday:70,balance:1000,bonusClaimed:false});
      if(action==='empty')this.store.demo({freePlays:0,extraPlays:0,adsUsed:0});
      if(action==='limit')this.store.demo({freePlays:0,extraPlays:0,adsUsed:3});
      if(action==='bonus')this.store.demo({earnedToday:ACTIVITY.target,bonusClaimed:false});
      this.renderHome();
      if(action==='result'){this.store.demo({freePlays:2,extraPlays:0});this.page='game';document.querySelector('#game')!.classList.add('visible');this.renderGame();this.resultCoins=500;this.resultReason='time';this.showResult();}
    });
    window.__FGR_DEMO__ = { store:this.store, ui:this };
  }
}
