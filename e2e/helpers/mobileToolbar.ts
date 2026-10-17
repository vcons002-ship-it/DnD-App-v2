import {expect,type Page} from '@playwright/test';
import {COMPACT_VIEWPORT} from '../../client/src/lib/useCompactViewport';

/** Same task path on phones, where optional controls live in compact groups. */
export async function openToolbarGroup(page:Page,label:'View'|'Map tools'){
 const button=page.getByRole('button',{name:label,exact:true});
 // A session route can mount before its map toolbar. Do not skip the entry
 // point merely because the first rendering frame has not committed yet.
 if(!await page.evaluate(query=>matchMedia(query).matches,COMPACT_VIEWPORT))return;
 await expect(button).toBeVisible();
 if(await button.getAttribute('aria-expanded')!=='true')await button.click();
 await expect(page.getByRole('dialog',{name:label,exact:true})).toBeVisible();
}
