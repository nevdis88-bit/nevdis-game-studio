import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { ActivityStore } from './game/ActivityStore';
import { ActivityUI } from './ui';
import './style.css';
await Promise.all([document.fonts.load('800 48px Barlow'), document.fonts.load('400 15px TikTok'), document.fonts.load('700 24px TikTok')]);
const presentation = new URLSearchParams(location.search).get('embed') === '1';
document.body.classList.toggle('presentation-mode', presentation);
const viewport=document.querySelector<HTMLElement>('#viewport')!, device=document.querySelector<HTMLElement>('#device')!;
const phoneShell = document.querySelector<HTMLElement>('#phone-shell')!;
function resize(){
  const width = presentation ? 414 : 390, height = presentation ? 868 : 844;
  const margin = presentation ? 28 : 0;
  const scale=Math.max(.1,Math.min((innerWidth-margin)/width,(innerHeight-margin)/height,1));
  (presentation ? phoneShell : device).style.transform=`scale(${scale})`;
  viewport.style.width=`${width*scale}px`;viewport.style.height=`${height*scale}px`;
}
resize();window.addEventListener('resize',resize);
let storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
try {
  const local = window.localStorage, params = new URLSearchParams(location.search);
  const prefix = params.get('demo') === '1' && params.get('qa') === '1' ? 'qa:' : '';
  storage = { getItem: key => local.getItem(prefix + key), setItem: (key, value) => local.setItem(prefix + key, value) };
} catch {}
const store=new ActivityStore(storage), ui=new ActivityUI(store);
const scene=new GameScene({ready:()=>ui.onReady(),hud:(c,s,l)=>ui.updateHud(c,s,l),ended:(c,g,r)=>ui.ended(c,g,r)});
ui.attach(scene);
const game=new Phaser.Game({type:Phaser.AUTO,parent:'game',width:780,height:1688,backgroundColor:'#000e3b',scale:{mode:Phaser.Scale.NONE},render:{antialias:true,roundPixels:false,powerPreference:'high-performance'},input:{activePointers:2},scene:[scene]});
if(import.meta.env.DEV)Object.assign(window,{__FIELD_GOAL_GAME__:game});
if(import.meta.hot)import.meta.hot.dispose(()=>{window.removeEventListener('resize',resize);game.destroy(true);});
