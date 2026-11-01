import {expect,type Page} from './test';
import {COMPACT_TOOLBAR_VIEWPORT} from '../../client/src/lib/useCompactViewport';

/** Open a grouped toolbar menu on compact layouts and the DM desktop. */
export async function openToolbarGroup(page:Page,label:'View'|'Map tools'){
 const button=page.getByRole('button',{name:label,exact:true});
 // A session route can mount before its map toolbar. Do not skip the entry
 // point merely because the first rendering frame has not committed yet.
 if(!new URL(page.url()).pathname.startsWith('/dm')&&!await page.evaluate(query=>matchMedia(query).matches,COMPACT_TOOLBAR_VIEWPORT))return;
 await expect(button).toBeVisible();
 if(await button.getAttribute('aria-expanded')!=='true')await button.click();
 await expect(page.getByRole('dialog',{name:label,exact:true})).toBeVisible();
}
