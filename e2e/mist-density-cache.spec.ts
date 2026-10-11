import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('cached mist retains the procedural cloud across height slices and wind strengths',async({page})=>{
  const bundle=await build({entryPoints:['e2e/mistDensityHarness.ts'],write:false,bundle:true,format:'iife',platform:'browser',define:{'import.meta.env':'{}'}});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
  const data=await page.evaluate(()=>(window as any).fieldQA);
  expect(errors).toEqual([]);expect(data.cache).toMatchObject({densityCache:true,cacheSlices:32,cacheHz:8});expect(data.results).toHaveLength(10);
  for(const result of data.results){
    // Density, not final rendered color: preserve wisps without requiring
    // quantized, interpolated cache values to be bit-identical to noise calls.
    expect(result.meanAbsolutePercent).toBeLessThan(1.2);
    expect(result.p99Percent).toBeLessThan(8);
    expect(result.meanSignal).toBeGreaterThan(0);
  }
});
