/** Controlled conversion fixture: every intentional opening has known coordinates.
 * This is not an AI accuracy test. The same geometry supplies the in-app preview. */
export function wallMaskStressFixture(){
 const width=800,height=650,grid=50;
 const shapes:string[]=[],routes:{name:string;a:{x:number;y:number};b:{x:number;y:number};radius:number}[]=[];
 const rect=(x:number,y:number,w:number,h:number)=>shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`);
 let from=20;
 for(const [x,gap] of [[115,3],[225,5],[335,10],[445,20],[565,30],[685,50]]){
  rect(from,75,x-from,20);from=x+gap;
  routes.push({name:`Horizontal gap ${gap/10} ft`,a:{x:x+gap/2,y:55},b:{x:x+gap/2,y:115},radius:gap*.2});
 }
 rect(from,75,780-from,20);
 from=180;
 for(const [y,gap] of [[250,3],[350,5],[470,10]]){
  rect(80,from,20,y-from);from=y+gap;
  routes.push({name:`Vertical slit ${gap/10} ft`,a:{x:60,y:y+gap/2},b:{x:120,y:y+gap/2},radius:gap*.2});
 }
 rect(80,from,20,610-from);
 // Parallel walls form a 2 ft corridor, with staggered ends.
 rect(160,195,350,20);rect(190,235,350,20);
 routes.push({name:'2 ft corridor',a:{x:150,y:225},b:{x:530,y:225},radius:6});
 // Offset openings require a diagonal path through both walls.
 rect(220,300,20,120);rect(220,440,20,170);rect(280,300,20,140);rect(280,460,20,150);
 routes.push({name:'Offset doorway pair',a:{x:200,y:420},b:{x:320,y:460},radius:3});
 // Two diagonal wall pieces with a narrow diagonal opening.
 shapes.push('<polygon points="400,400 445,445 453,437 408,392"/><polygon points="450,450 500,500 508,492 458,442"/>');
 routes.push({name:'Diagonal slit',a:{x:436.5,y:458.5},b:{x:466.5,y:428.5},radius:1});
 // Jagged but continuous wall caps and an L/T junction.
 shapes.push('<path d="M 570 350 L 735 350 L 735 370 L 715 370 L 715 369 L 700 369 L 700 371 L 680 371 L 680 369 L 660 369 L 660 370 L 650 370 L 650 530 L 630 530 L 630 370 L 570 370 Z"/>');
 const gridLines=Array.from({length:17},(_,i)=>`<path d="M ${i*50} 0 V 650 M 0 ${i*50} H 800"/>`).join('');
 const svg=(mask:boolean)=>`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="650"><rect width="800" height="650" fill="#20252a"/><g fill="none" stroke="#394149" stroke-width="1">${gridLines}</g><g fill="${mask?'#ffff00':'#666973'}">${shapes.join('')}</g>${mask?'<g stroke="#352d00" stroke-width="2"><path d="M 175 75 V 95 M 175 195 V 215 M 610 350 V 370"/></g>':''}</svg>`;
 const blocks=[{a:{x:150,y:55},b:{x:150,y:115}},{a:{x:170,y:55},b:{x:170,y:115}},{a:{x:60,y:310},b:{x:120,y:310}},{a:{x:600,y:330},b:{x:600,y:390}},{a:{x:610,y:470},b:{x:670,y:470}},{a:{x:420,y:390},b:{x:400,y:430}}];
 return {width,height,grid,mask:Buffer.from(svg(true)),original:Buffer.from(svg(false)),routes,blocks};
}
