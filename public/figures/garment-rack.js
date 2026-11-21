/* global HL, hairline */
/* An isometric garment rack. A fixed rest hit region selects each shirt;
 * the selected garment draws forward, and its neighbours follow less. */
const { Cam, fit, proj, facing, rings, prism, solid, put, mk, fillet, poly, open,
  tween, tset, tval, tdone, pointer, register, disposer } = HL;
function mount({stage,svg,read}, value) {
  const bag=disposer(), C=Cam(45,.5,1.8);
  fit(C,[[-76,-30,-3],[76,30,-3],[-76,-30,108],[76,30,108]],200,166);
  const P=proj(C),front=facing(C),scene=mk("g",{},svg);
  const box=(x0,y0,x1,y1,z0,z1,r=2)=>{
    const [ring,inner]=rings(x0,y0,x1,y1,r,.5);
    put(solid(scene),prism(P,front,ring,inner,z0,z1));
  };
  for(const x of [-72,72]) {
    box(x-4,-28,x+4,28,0,4,3);
    box(x-2,-2,x+2,2,4,104,1.5);
  }
  box(-74,-2,74,2,101,105,1.5);
  const xs=[-43,0,43], hems=[32,27,35];
  const pieces=xs.map((x,i)=>{
    const group=mk("g",{},scene);
    const shape=fillet([[-5,88],[-11,88],[-22,78],[-16,70],[-11,74],[-11,hems[i]],[11,hems[i]],[11,74],[16,70],[22,78],[11,88],[5,88],[4,83],[-4,83]],Array(14).fill(1.3),4);
    return {x,shape,group,back:mk("path",{class:"lo"},group),face:mk("path",{class:"sil"},group),hem:mk("path",{class:"nf lo"},group),hook:mk("path",{class:"nf sil"},group),seam:mk("path",{class:"nf lo"},group),y:tween(i===1?5:0),last:""};
  });
  let active=-1,reach=value;
  function draw(item,i,y) {
    const key=y.toFixed(3);if(item.last===key)return;item.last=key;
    const point=(p,depth=0)=>P(item.x+p[0],y+depth,p[1]);
    item.back.setAttribute("d",poly(item.shape.map(p=>point(p,-1.4))));
    item.face.setAttribute("d",poly(item.shape.map(p=>point(p))));
    item.hem.setAttribute("d",open([P(item.x-8,y,hems[i]+3),P(item.x+8,y,hems[i]+3)]));
    item.seam.setAttribute("d",open([P(item.x-9,y,85),P(item.x-18,y,77)])+open([P(item.x+9,y,85),P(item.x+18,y,77)]));
    const hook=fillet([[item.x,88],[item.x,97],[item.x+4,100],[item.x+2,104],[item.x-3,103]],Array(5).fill(1.6),5);
    item.hook.setAttribute("d",open(hook.map(p=>P(p[0],y,p[1]))));
  }
  const B=register(stage,(_dt,now)=>{
    let moving=false;
    pieces.forEach((item,i)=>{draw(item,i,tval(item.y,now));if(!tdone(item.y,now))moving=true;});
    return moving;
  });
  bag.add(B.unregister);
  function select(a) {
    if(active===a)return;const from=a<0?active:a,now=performance.now();active=a;
    pieces.forEach((item,i)=>{
      const target=a<0?(i===1?5:0):Math.max(0,reach-Math.abs(i-a)*8);
      tset(item.y,target,now,Math.abs(i-from)*40);
      item.face.classList.toggle("hi",i===(a<0?1:a));
      item.hook.classList.toggle("hi",i===(a<0?1:a));
    });
    read.textContent=a<0?"rest":"garment "+(a+1);B.wake();
  }
  function hit([sx,sy]) {
    let best=-1,d=Infinity;
    pieces.forEach((item,i)=>{
      const middle=P(item.x,0,60),top=P(item.x,0,100),bottom=P(item.x,0,hems[i]);
      if(sy<top[1]-8||sy>bottom[1]+8)return;
      const dx=Math.abs(sx-middle[0]);if(dx<31&&dx<d){d=dx;best=i;}
    });return best;
  }
  pieces.forEach((item,i)=>draw(item,i,i===1?5:0));
  pieces[1].face.classList.add("hi");pieces[1].hook.classList.add("hi");read.textContent="rest";
  bag.add(pointer(stage,{move:p=>select(hit(p)),down:p=>select(hit(p)),leave:()=>select(-1)}));
  bag.add(()=>svg.replaceChildren());
  return {set:v=>{reach=v;const a=active;active=-2;select(a);},destroy:bag.dispose};
}
hairline({name:"garment-rack",means:"Three garments on a rounded rail: the chosen shirt draws forward and its neighbours follow less.",rules:[1,2,4,5,7,8,9],range:[8,18,28],tour:[[145,155],[200,180],[255,205],null],mount});
