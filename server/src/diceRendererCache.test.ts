import {describe,it,expect,vi} from 'vitest';
import {createDiceRendererCache} from '../../client/src/lib/diceRendererCache.js';
import {createRollPowerState} from '../../client/src/lib/diceRollPower.js';

describe('prepared dice scene cache',()=>{
 it('reuses released scenes but never borrows an in-flight preparation',()=>{
  const create=vi.fn(()=>({dispose:vi.fn()})),cache=createDiceRendererCache();
  const first=cache.acquire('d20',1,create),concurrent=cache.acquire('d20',1,create);
  expect(concurrent.value).not.toBe(first.value);first.release();
  const next=cache.acquire('d20',1,create);expect(next.value).toBe(first.value);expect(next.reused).toBe(true);
  expect(create).toHaveBeenCalledTimes(2);next.release();concurrent.release();cache.clear();
 });
 it('evicts least-recently-used scenes within both entry and dice budgets',()=>{
  const cache=createDiceRendererCache(2,3),create=()=>({dispose:vi.fn()});
  const attack=cache.acquire('d20',1,create);attack.release();
  const damage=cache.acquire('2d6',2,create);damage.release();
  const again=cache.acquire('d20',1,create);again.release();
  const save=cache.acquire('d8',1,create);save.release();
  expect(damage.value.dispose).toHaveBeenCalledOnce();expect(attack.value.dispose).not.toHaveBeenCalled();cache.clear();
 });
 it('does not retain a giant pool or evict ordinary dice to accommodate it',()=>{
  const cache=createDiceRendererCache(2,3),create=()=>({dispose:vi.fn()});
  const ordinary=cache.acquire('d20',1,create);ordinary.release();
  const giant=cache.acquire('40d6',40,create);giant.release();giant.release();
  expect(giant.value.dispose).toHaveBeenCalledOnce();expect(ordinary.value.dispose).not.toHaveBeenCalled();
  expect(cache.acquire('d20',1,create).reused).toBe(true);
 });
 it('clears old sessions without disposing a scene that is still being prepared',()=>{
  const cache=createDiceRendererCache(),create=()=>({dispose:vi.fn()});
  const active=cache.acquire('d20',1,create);cache.clear();
  expect(active.value.dispose).not.toHaveBeenCalled();
  expect(cache.acquire('d20',1,create).reused).toBe(false);
  active.release();expect(active.value.dispose).toHaveBeenCalledOnce();
 });
 it('starts a reused maximum die with no previous strength, finale, or age',()=>{
  const power=createRollPowerState(20);power.setResult(20);power.advance(100);power.advance(5000);power.reset();
  expect(power.advance(6000)).toMatchObject({known:false,maximum:false,strength:.35});
  power.setResult(20);expect(power.advance(6100)).toMatchObject({maximum:true,age:0});
 });
});
