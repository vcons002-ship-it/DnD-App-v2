import{it,expect}from'vitest';
import{createMiniatureLodTransitions}from'../../client/src/canvas/miniatureLodTransitions.js';
it('avoids rapid downgrade/re-upgrade swaps while upgrading without delay',()=>{
  const lod=createMiniatureLodTransitions();
  expect(lod.resolve('a','high','battlefield',true,0)).toEqual({level:'high',pending:false});
  expect(lod.resolve('a','battlefield','high',true,100)).toEqual({level:'high',pending:true});
  expect(lod.resolve('a','high','high',true,250)).toEqual({level:'high',pending:false});
  expect(lod.resolve('a','battlefield','high',true,300)).toEqual({level:'high',pending:true});
  expect(lod.resolve('a','battlefield','high',true,649)).toEqual({level:'high',pending:true});
  expect(lod.resolve('a','battlefield','high',true,650)).toEqual({level:'battlefield',pending:false});
  expect(lod.resolve('a','battlefield','high',true,651)).toEqual({level:'battlefield',pending:false});
});
it('releases off-screen models immediately and clears removed tokens',()=>{
  const lod=createMiniatureLodTransitions();
  lod.resolve('a','battlefield','balanced',true,0);
  expect(lod.resolve('a','battlefield','balanced',false,1)).toEqual({level:'battlefield',pending:false});
  lod.resolve('a','battlefield','low',true,100);lod.retain([]);
  expect(lod.resolve('a','battlefield','low',true,500)).toEqual({level:'low',pending:true});
});
