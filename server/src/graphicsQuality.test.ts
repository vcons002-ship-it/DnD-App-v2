import {describe,it,expect} from 'vitest';
import {graphicsBudget,parseGraphicsQuality} from '../../shared/graphicsQuality.js';

describe('local graphics presets',()=>{
  it('retains old preferences and accepts Balanced without accepting unknown values',()=>{
    for(const quality of ['auto','high','balanced','low','off'] as const)expect(parseGraphicsQuality(quality)).toBe(quality);
    expect(parseGraphicsQuality('ultra')).toBe('balanced');expect(parseGraphicsQuality(null)).toBe('balanced');expect(parseGraphicsQuality(undefined)).toBe('balanced');
  });
  it('reduces render pixels, shadow maps and particle work in successive presets',()=>{
    const [high,balanced,low]=['high','balanced','low'].map(q=>graphicsBudget(parseGraphicsQuality(q)));
    expect(high.pixelRatioCap).toBeGreaterThan(balanced.pixelRatioCap);expect(balanced.pixelRatioCap).toBeGreaterThan(low.pixelRatioCap);
    for(const key of ['localShadowSize','diceShadowSize','mapShadowSize','particleScale','diceRenderWidth'] as const){
      expect(high[key]).toBeGreaterThan(balanced[key]);expect(balanced[key]).toBeGreaterThan(low[key]);
    }
    expect(low.localShadowLights).toBe(2);expect(balanced.localShadowLights).toBe(4);
    expect(high.localShadowMethod).toBe('cube');
    expect(balanced.localShadowMethod).toBe('floor');expect(low.localShadowMethod).toBe('floor');
    expect(balanced.localShadowFloorSize).toBe(768);expect(low.localShadowFloorSize).toBe(512);
    expect(high.localShadowFps).toBe(30);expect(balanced.localShadowPoseFps).toBe(10);
  });
  it('uses Balanced for narrow Auto viewers, while explicit High is honored',()=>{
    expect(graphicsBudget('auto',390).resolved).toBe('balanced');
    expect(graphicsBudget('auto',1440).resolved).toBe('high');
    expect(graphicsBudget('high',390).resolved).toBe('high');
  });
  it('lets Auto choose matching model quality and uses Balanced for an unsaved preference',()=>{
    for(const tier of ['high','balanced','low'] as const)expect(graphicsBudget('auto',1440,tier).modelQuality).toBe(tier);
    expect(graphicsBudget(parseGraphicsQuality(null)).modelQuality).toBe('balanced');
    expect(graphicsBudget('high').modelQuality).toBe('high');
    expect(graphicsBudget('balanced').modelQuality).toBe('balanced');
    expect(graphicsBudget('off').modelQuality).toBe('low');
  });
  it('Effects off removes decorative budgets without changing any rules fields',()=>{
    const budget=graphicsBudget('off');expect(budget.particleScale).toBe(0);expect(budget.mistQuality).toBe('off');
    expect(budget.localShadowLights).toBe(0);expect(budget).not.toHaveProperty('visionDistance');
  });
});
