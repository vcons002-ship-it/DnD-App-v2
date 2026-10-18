/** The suite's `test`/`expect`, with every budget scaled on a software GPU.
 *
 * The specs are written against a real GPU: a figure loads in seconds, a roll
 * card appears within the 5 s expect default. On SwiftShader (CI runners, the
 * cloud containers) the same work takes several times longer, and the suite
 * used to fail wholesale on timeouts. `globalSetup` detects the renderer once;
 * this module then multiplies test timeouts and every explicit expect/poll
 * timeout by `factor`, leaving the assertions themselves untouched. Real-time
 * budgets (frame deltas, reading holds) are not timeouts and stay as written. */
import {test as base,expect as baseExpect} from '@playwright/test';
export * from '@playwright/test';

export const SLOW_FACTOR=process.env.E2E_SOFTWARE_GL==='1'?Number(process.env.E2E_SLOW_FACTOR||4):1;
export const softwareGl=SLOW_FACTOR!==1;
/** A GPU-sized wait, widened on a software renderer. */
export const budget=(ms:number)=>Math.round(ms*SLOW_FACTOR);
/** On a software renderer the 3D battlefield and dice tray saturate the page's
 * main thread: a single click can take a minute to become actionable. The
 * suite checks outcomes, never rendering, so there the test browser gets no
 * WebGL at all and the app takes its 2D/static paths. `E2E_WEBGL=1` keeps it. */
export const webglDisabled=softwareGl&&process.env.E2E_WEBGL!=='1';
const disableWebgl=()=>{
 const original=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]){
  if(kind==='webgl'||kind==='webgl2'||kind==='experimental-webgl')return null;
  return (original as (this:HTMLCanvasElement,kind:string,...a:unknown[])=>unknown).call(this,kind,...args);
 } as typeof original;
 if(typeof OffscreenCanvas!=='undefined'){
  const offscreen=OffscreenCanvas.prototype.getContext;
  OffscreenCanvas.prototype.getContext=function(this:OffscreenCanvas,kind:string,...args:unknown[]){
   if(kind==='webgl'||kind==='webgl2')return null;
   return (offscreen as (this:OffscreenCanvas,kind:string,...a:unknown[])=>unknown).call(this,kind,...args);
  } as typeof offscreen;
 }
};

export const test=base.extend<{slowBudget:void}>({
 // Every context a spec opens (the default one and `browser.newContext()`
 // alike) gets the WebGL switch before any page script runs.
 browser:async({browser},use)=>{
  if(webglDisabled){
   const newContext=browser.newContext.bind(browser);
   browser.newContext=(async(options?:Parameters<typeof newContext>[0])=>{const context=await newContext(options);await context.addInitScript(disableWebgl);return context;}) as typeof browser.newContext;
  }
  await use(browser);
 },
 slowBudget:[async({},use,testInfo)=>{
  if(softwareGl){
   // Scale the configured timeout, and any `test.setTimeout(n)` a spec sets later.
   const original=testInfo.setTimeout.bind(testInfo);
   testInfo.setTimeout=(ms:number)=>original(ms?budget(ms):ms);
   testInfo.setTimeout(testInfo.timeout);
  }
  await use();
 },{auto:true}],
});

/** Matchers whose trailing options carry a `timeout`; an expected value that
 * merely has a `timeout` field (toEqual({timeout:700})) must stay untouched. */
const TIMED=new Set(['poll','soft','toPass','toBeAttached','toBeChecked','toBeDisabled','toBeEditable','toBeEmpty','toBeEnabled','toBeFocused','toBeHidden','toBeInViewport','toBeVisible',
 'toContainClass','toContainText','toHaveAccessibleDescription','toHaveAccessibleErrorMessage','toHaveAccessibleName','toHaveAttribute','toHaveClass','toHaveCount','toHaveCSS','toHaveId',
 'toHaveJSProperty','toHaveRole','toHaveScreenshot','toHaveText','toHaveTitle','toHaveURL','toHaveValue','toHaveValues','toMatchAriaSnapshot']);
const scaleOptions=(property:PropertyKey,args:unknown[])=>{
 const last=args[args.length-1];
 if(TIMED.has(String(property))&&last&&typeof last==='object'&&!Array.isArray(last)&&typeof (last as {timeout?:unknown}).timeout==='number')
  return [...args.slice(0,-1),{...(last as object),timeout:budget((last as {timeout:number}).timeout)}];
 return args;
};
const wrapMatchers=(target:unknown):unknown=>{
 if(!softwareGl||(typeof target!=='object'&&typeof target!=='function')||target===null)return target;
 return new Proxy(target as object,{
  get(object,property,receiver){
   const value=Reflect.get(object,property,receiver);
   if(typeof value==='function')return (...args:unknown[])=>wrapMatchers(value.apply(object,scaleOptions(property,args)));
   return wrapMatchers(value);
  },
 });
};
type Expect=typeof baseExpect;
// The 5 s default applies to every expect without an explicit timeout.
const configured=softwareGl?baseExpect.configure({timeout:budget(5000)}):baseExpect;
export const expect:Expect=softwareGl?new Proxy(configured,{
 apply(target,thisArg,args:unknown[]){return wrapMatchers(Reflect.apply(target,thisArg,args));},
 get(target,property,receiver){
  const value=Reflect.get(target,property,receiver);
  if(property==='poll'||property==='soft')return (...args:unknown[])=>wrapMatchers((value as (...a:unknown[])=>unknown).apply(target,scaleOptions(property,args)));
  return value;
 },
}) as Expect:baseExpect;
