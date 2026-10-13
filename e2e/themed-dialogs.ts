import type {Page} from '@playwright/test';

/** Existing spell demonstrations intentionally replace concentration. Keep the
 * test automation on the same themed prompt a player now sees. */
export async function acceptConcentration(page:Page,beforeAccept?:(message:string)=>Promise<void>){
  const prompt=page.getByRole('dialog',{name:'Replace concentration?',exact:true});
  // Some demonstrations poll server state after clicking a spell, so locator
  // handlers alone would never run. Watch just this known prompt until close.
  let closed=false;page.once('close',()=>{closed=true;});
  void (async()=>{
    while(!closed){
      try{
        await prompt.waitFor({state:'visible',timeout:1000});
        if(beforeAccept)await beforeAccept(await prompt.locator('p').innerText());
        await prompt.getByRole('button',{name:/^Cast /}).click();
        await prompt.waitFor({state:'hidden',timeout:1000});
      }catch(error){if(closed||page.isClosed())return;if(!(error instanceof Error)||error.name!=='TimeoutError')return;}
    }
  })();
}
