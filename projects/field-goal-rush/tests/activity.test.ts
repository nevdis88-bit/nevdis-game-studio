import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityStore, STORAGE_KEY } from '../src/game/ActivityStore.ts';
import { ACTIVITY } from '../src/config/ActivityConfig.ts';
const memory = () => {const data=new Map<string,string>(); return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)}};};
const today=Date.parse('2026-09-23T12:00:00Z');

test('three free rounds, one debit per start, no duplicate or forged settlement',()=>{
  const s=new ActivityStore(memory(),()=>today);
  for(let i=0;i<3;i++){
    const id=s.startRun()!;assert.ok(id);assert.equal(s.startRun(),null);
    assert.equal(s.finishRun('wrong',99),false);assert.equal(s.finishRun(id,-2),false);
    assert.equal(s.finishRun(id,20),true);assert.equal(s.finishRun(id,20),false);
  }
  assert.equal(s.plays,0);assert.equal(s.startRun(),null);assert.equal(s.state.balance,60);assert.equal(s.state.earnedToday,60);
});
test('ad receipts are unique and the daily cap is three',()=>{
  const s=new ActivityStore(memory(),()=>today);
  assert.equal(s.grantAd(''),false);assert.equal(s.grantAd('a'),true);assert.equal(s.grantAd('a'),false);
  assert.equal(s.grantAd('b'),true);assert.equal(s.grantAd('c'),true);assert.equal(s.grantAd('d'),false);
  assert.equal(s.state.extraPlays,3);assert.equal(s.state.adsUsed,3);
});
test('invite grants 10 rounds once per receipt, separately from ad limits',()=>{
  const s=new ActivityStore(memory(),()=>today);['a','b','c'].forEach(x=>s.grantAd(x));
  assert.equal(s.grantInvite('friend-1'),true);assert.equal(s.grantInvite('friend-1'),false);
  assert.equal(s.grantInvite('friend-2'),true);assert.equal(s.state.extraPlays,23);
  s.startRun();assert.equal(s.state.freePlays,2);assert.equal(s.state.extraPlays,23);
});
test('daily bonus can be claimed once and never advances the target',()=>{
  const s=new ActivityStore(memory(),()=>today);assert.equal(s.claim(),false);
  s.finishRun(s.startRun()!,ACTIVITY.target);assert.equal(s.canClaim,true);assert.equal(s.claim(),true);assert.equal(s.claim(),false);
  assert.equal(s.state.balance,ACTIVITY.target+ACTIVITY.bonus);assert.equal(s.state.earnedToday,ACTIVITY.target);
});
test('midnight resets free rounds, ad cap and daily progress, preserving earned value',()=>{
  let now=today;const s=new ActivityStore(memory(),()=>now);
  s.finishRun(s.startRun()!,120);s.claim();s.grantAd('a');s.grantInvite('friend');
  now+=86400000;s.refresh();assert.equal(s.state.freePlays,3);assert.equal(s.state.adsUsed,0);
  assert.equal(s.state.extraPlays,11);assert.equal(s.state.balance,120+ACTIVITY.bonus);
  assert.equal(s.state.earnedToday,0);assert.equal(s.state.bonusClaimed,false);assert.equal(s.grantInvite('friend'),false);
});
test('refresh cannot refund consumed rounds or replay settlement; settings persist',()=>{
  const storage=memory(),s=new ActivityStore(storage,()=>today);
  const id=s.startRun()!;s.setSetting('music',false);
  const reloaded=new ActivityStore(storage,()=>today);
  assert.equal(reloaded.state.freePlays,2);assert.equal(reloaded.state.activeRun,null);assert.equal(reloaded.finishRun(id,500),false);
  assert.equal(reloaded.state.settings.music,false);
});
test('unfinished round crossing midnight credits wallet but not the new daily target',()=>{
  let now=Date.parse('2026-09-23T23:59:50Z');const s=new ActivityStore(memory(),()=>now);const id=s.startRun()!;
  now+=30000;s.finishRun(id,25);assert.equal(s.state.balance,25);assert.equal(s.state.earnedToday,0);assert.equal(s.state.freePlays,3);
});
test('quit forfeits unfinished rewards, corrupted storage cannot prevent play',()=>{
  const storage=memory();storage.setItem(STORAGE_KEY,'{broken');const s=new ActivityStore(storage,()=>today);
  const id=s.startRun()!;s.quitRun();assert.equal(s.finishRun(id,100),false);assert.equal(s.plays,2);
  const denied=new ActivityStore({getItem(){throw Error('denied')},setItem(){throw Error('quota')}},()=>today);
  assert.ok(denied.startRun());
});
