import {expect,type Locator} from '@playwright/test';

/** Visibility alone does not detect text hidden below an overflow container. */
export async function expectUnclipped(locator:Locator){
  await expect(locator).toBeVisible();
  await expect.poll(()=>locator.evaluate(el=>{
    const r=el.getBoundingClientRect(),cuts:string[]=[];
    if(r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)cuts.push('viewport');
    for(let p=el.parentElement;p;p=p.parentElement){
      const s=getComputedStyle(p),b=p.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(s.overflowX)&&(r.left<b.left-.5||r.right>b.right+.5))cuts.push(p.className+' horizontally');
      if(/auto|scroll|hidden|clip/.test(s.overflowY)&&(r.top<b.top-.5||r.bottom>b.bottom+.5))cuts.push(p.className+' vertically');
    }
    return cuts;
  }),{message:`${await locator.textContent()} must fit its visible containers`}).toEqual([]);
}
