import { ACTIVITY } from '../config/ActivityConfig.ts';

export interface RewardRecord { id: string; kind: 'round' | 'bonus' | 'invite' | 'ad'; amount: number; at: number }
export interface ActivityState {
  version: 1; day: string; freePlays: number; extraPlays: number; adsUsed: number;
  earnedToday: number; balance: number; bonusClaimed: boolean; userId: string;
  activeRun: { id: string; day: string } | null;
  transactions: string[]; records: RewardRecord[];
  settings: { sound: boolean; music: boolean; haptics: boolean };
}
export const STORAGE_KEY = 'field-goal-rush.activity.v1';
export function dayKey(now: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ACTIVITY.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function initialState(now: number): ActivityState {
  return { version: 1, day: dayKey(now), freePlays: ACTIVITY.dailyPlays, extraPlays: 0, adsUsed: 0,
    earnedToday: 0, balance: 0, bonusClaimed: false, userId: uid(), activeRun: null,
    transactions: [], records: [], settings: { sound: true, music: true, haptics: false } };
}
export class ActivityStore {
  state: ActivityState;
  private storage?: Pick<Storage, 'getItem' | 'setItem'>;
  private now: () => number;
  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>, now = Date.now) {
    this.storage = storage; this.now = now;
    this.state = initialState(now());
    try {
      const s = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
      if (s?.version === 1 && typeof s.day === 'string' && typeof s.userId === 'string' &&
        ['freePlays','extraPlays','adsUsed','earnedToday','balance'].every(k => Number.isSafeInteger(s[k]) && s[k] >= 0) &&
        s.freePlays <= ACTIVITY.dailyPlays && s.adsUsed <= ACTIVITY.dailyAds &&
        typeof s.bonusClaimed === 'boolean' && Array.isArray(s.transactions) && Array.isArray(s.records) &&
        s.settings && ['sound','music','haptics'].every(k => typeof s.settings[k] === 'boolean')) {
        this.state = { ...s, activeRun: null };
      }
    } catch { /* Corrupt or unavailable local storage starts a usable session. */ }
    this.refresh();
  }
  refresh() {
    const day = dayKey(this.now());
    if (day !== this.state.day) Object.assign(this.state, { day, freePlays: ACTIVITY.dailyPlays, adsUsed: 0, earnedToday: 0, bonusClaimed: false });
    this.save(); return this.state;
  }
  get plays() { return this.state.freePlays + this.state.extraPlays; }
  get canClaim() { return this.state.earnedToday >= ACTIVITY.target && !this.state.bonusClaimed; }
  private save() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch { /* Session remains usable. */ } }
  startRun() {
    this.refresh();
    if (this.plays < 1 || this.state.activeRun) return null;
    if (this.state.freePlays) this.state.freePlays--; else this.state.extraPlays--;
    const run = { id: uid(), day: this.state.day }; this.state.activeRun = run; this.save(); return run.id;
  }
  finishRun(id: string, coins: number) {
    this.refresh();
    if (this.state.activeRun?.id !== id || !Number.isSafeInteger(coins) || coins < 0) return false;
    if (this.state.activeRun.day === this.state.day) this.state.earnedToday += coins;
    this.state.balance += coins; this.state.activeRun = null;
    this.record(id, 'round', coins); return true;
  }
  quitRun() { this.state.activeRun = null; this.save(); }
  grantAd(receipt: string) {
    this.refresh();
    if (!receipt || this.state.adsUsed >= ACTIVITY.dailyAds || this.state.transactions.includes(receipt)) return false;
    this.state.adsUsed++; this.state.extraPlays++; this.record(receipt, 'ad', 1); return true;
  }
  grantInvite(receipt: string) {
    this.refresh();
    if (!receipt || this.state.transactions.includes(receipt)) return false;
    this.state.extraPlays += ACTIVITY.invitePlays; this.record(receipt, 'invite', ACTIVITY.invitePlays); return true;
  }
  claim() {
    this.refresh(); if (!this.canClaim) return false;
    this.state.bonusClaimed = true; this.state.balance += ACTIVITY.bonus;
    this.record('bonus:'+this.state.day, 'bonus', ACTIVITY.bonus); return true;
  }
  setSetting(key: keyof ActivityState['settings'], value: boolean) { this.state.settings[key] = value; this.save(); }
  private record(id: string, kind: RewardRecord['kind'], amount: number) {
    this.state.transactions.push(id);
    this.state.records.unshift({ id, kind, amount, at: this.now() });
    this.state.records = this.state.records.slice(0, 200); this.save();
  }
  /** Exposed by the UI only in the explicitly enabled local demo panel. */
  demo(patch: Partial<ActivityState>) { Object.assign(this.state, patch); this.save(); }
}
