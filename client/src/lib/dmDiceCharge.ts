const smooth=(low:number,high:number,value:number)=>{
 const x=Math.max(0,Math.min(1,(value-low)/(high-low)));return x*x*(3-2*x);
};
const random=(value:number)=>{const n=Math.sin(value*127.1+311.7)*43758.5453;return n-Math.floor(n);};

/** Confirmed natural faces charge the ink, independently for each die. Unknown
 * rolls stay purple; reduced motion keeps a steady tint instead of pulsing. */
export function dmDiceCharge(strength:number,known:boolean,maximum:boolean,age:number,seconds:number,seed:number,reducedMotion=false){
 if(!known)return {charge:0,frequency:0};
 if(maximum)return {charge:smooth(0,.35,age),frequency:0};
 const level=smooth(.22,.98,strength);
 if(level===0)return {charge:0,frequency:0};
 if(reducedMotion)return {charge:level*.18,frequency:0};
 const frequency=.25+2.6*Math.pow(level,1.5);
 const clock=seconds*frequency+seed,cycle=Math.floor(clock);
 // Vary the onset and width so the flashes feel like pressure inside the ink,
 // rather than a metronome. Limit the envelope to this cycle for smooth fades.
 const onset=.08+random(cycle+seed)*.17;
 const width=Math.min(.62,frequency*(.30+random(cycle+seed+43)*.12));
 const phase=(clock-cycle-onset)/width;
 const pulse=smooth(0,.14,phase)*(1-smooth(.22,1,phase));
 return {charge:Math.pow(level,.6)*.95*pulse,frequency};
}
