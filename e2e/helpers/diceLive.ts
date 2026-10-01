import { expect, type Page } from '@playwright/test';

/** The server owns these faces. Wait for its settled frame and the visible
 * result boxes, rather than the old prerecorded tray's timing/group structure. */
export async function settledLiveDice(page: Page, count: number) {
  const live = page.locator('[data-live-dice="true"]');
  await expect(live).toBeVisible({timeout: 15_000});
  await expect(live.locator('.tray-die-result')).toHaveCount(count);
  // The filled boxes are a brief live stage before the arithmetic card. Observe
  // every DOM change; Playwright's backoff can otherwise skip that real stage.
  return page.evaluate((count) => new Promise<{sides:number;value:number;set:number;result:string|null;critical:boolean;theme:string|null;displayed:string;color:string}[]>((resolve,reject) => {
    const timeout=window.setTimeout(()=>{observer.disconnect();reject(new Error('Live dice did not fill their settled result boxes'));},30_000);
    const sample=()=>{
      const live=document.querySelector('[data-live-dice="true"]');
      const dice=Array.from(live?.querySelectorAll('.tray-die-result')??[]);
      if(live?.querySelector('.physics-dice-tray')?.getAttribute('data-status')!=='settled' || dice.length!==count || dice.some(die=>die.getAttribute('data-orientation')!=='settled'))return;
      clearTimeout(timeout);observer.disconnect();
      resolve(dice.map(die=>({
        sides:Number(die.getAttribute('data-sides')),value:Number(die.getAttribute('data-value')),
        set:Number(die.getAttribute('data-set')),result:die.getAttribute('data-result'),
        critical:die.getAttribute('data-critical')==='true',theme:die.getAttribute('data-theme'),
        displayed:die.querySelector('strong')!.textContent!,color:(die as HTMLElement).style.borderColor,
      })));
    };
    const observer=new MutationObserver(sample);observer.observe(document.body,{subtree:true,childList:true,attributes:true});sample();
  }),count);
}

export async function dismissSettledRoll(page: Page) {
  // Escape cannot cancel authoritative live physics. Only dismiss the result
  // after the server has finished it, so the next roll cannot replace it.
  await expect(page.locator('[data-live-dice="true"]')).toHaveCount(0, {timeout: 15_000});
  await expect(page.locator('.roll-reveal[data-roll-id]')).toBeVisible();
  await page.locator('.roll-reveal[data-roll-id]').click();
  await expect(page.locator('.roll-reveal')).toHaveCount(0);
}
