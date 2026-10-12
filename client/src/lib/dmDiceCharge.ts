const smooth=(low:number,high:number,value:number)=>{
 const x=Math.max(0,Math.min(1,(value-low)/(high-low)));return x*x*(3-2*x);
};

/** Confirmed natural faces charge the ink, independently for each die. Unknown
 * rolls stay purple; reduced motion keeps a steady tint instead of pulsing. */
export function dmDiceCharge(strength:number,known:boolean,maximum:boolean,age:number,seconds:number,seed:number,reducedMotion=false){
 if(!known)return {charge:0,frequency:0};
 if(maximum)return {charge:smooth(0,.35,age),frequency:0};
 const level=smooth(.22,.98,strength);
 if(level===0)return {charge:0,frequency:0};
 if(reducedMotion)return {charge:level*.18,frequency:0};
 const frequency=.14+.60*Math.pow(level,1.2);
 // A whole-cycle swell rolls gently through the ink. Continuous phase drift
 // gives each die an organic rhythm without abrupt onsets or short flashes.
 const phase=seconds*frequency+seed+.045*Math.sin(seconds*.35+seed);
 const wave=.5-.5*Math.cos(phase*Math.PI*2);
 const pulse=smooth(0,1,wave);
 return {charge:Math.pow(level,.75)*.84*pulse*smooth(0,.35,age),frequency};
}
