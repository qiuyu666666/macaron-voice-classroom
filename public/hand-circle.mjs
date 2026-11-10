// Deterministic hand-like contour. All points stay inside the normalized board.
export function handCircle(box){
 const {x,y,width:w,height:h}=box;
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0||x<0||y<0||x+w>1.001||y+h>1.001)throw Error('invalid_bounds');
 const padX=Math.min(.018,Math.max(.007,w*.07)),padY=Math.min(.022,Math.max(.009,h*.14));
 const left=Math.max(.004,x-padX),right=Math.min(.996,x+w+padX),top=Math.max(.004,y-padY),bottom=Math.min(.996,y+h+padY);
 const cx=(left+right)/2,cy=(top+bottom)/2,rx=(right-left)/2,ry=(bottom-top)/2;
 // Rounded rectangular superellipse avoids cutting through a wide text block.
 const points=Array.from({length:65},(_,i)=>{const t=i/64*Math.PI*2;const wobble=.985+.009*Math.sin(3*t+.6)+.005*Math.sin(7*t);return[(cx+rx*Math.sign(Math.cos(t))*Math.abs(Math.cos(t))**.45*wobble)*1000,(cy+ry*Math.sign(Math.sin(t))*Math.abs(Math.sin(t))**.45*wobble)*1000]});
 return {d:points.map((p,i)=>(i?'L':'M')+p.map(v=>v.toFixed(2)).join(' ')).join(' ')+' Z',points,bounds:{left,right,top,bottom}};
}
