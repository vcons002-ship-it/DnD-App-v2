/** Body material/layer work is independent of movement and HUD animation. */
export function miniatureAppearanceKey(token:{diameter:number;definition:{baseDiameter:number;baseCenter:readonly number[]};sharedSightOnly?:boolean;hidden:boolean;invisible?:boolean;tint?:string;shade?:readonly number[];outline?:string},shadows:boolean){
 return JSON.stringify([token.diameter,token.definition.baseDiameter,token.definition.baseCenter,token.sharedSightOnly,token.hidden,token.invisible,token.tint,token.shade,token.outline,shadows]);
}
