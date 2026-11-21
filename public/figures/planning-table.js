/* global HL, hairline */
/* Nool planning table: folded garments, a work surface and two dispatch trays.
 * The pointer chooses a fixed rest region. The production batch travels to
 * that dispatch tray; neighbouring stacks lift with a distance stagger.
 * Geometry is illustrative, not a count of the order's actual pieces. */
const { Cam, facing, fit, proj, unproj, rings, prism, ringAt, run, poly, open,
  fillet, solid, put, mk, tween, tset, tval, tdone, pointer, register, disposer } = HL;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let lift = value, active = -1;
  const C = Cam(45, 0.5, 1.5);
  fit(C, [[-92,-56,-20], [92,56,-20], [-92,56,20], [92,-56,82]], 200, 168);
  const P = proj(C), front = facing(C), scene = mk("g", {}, svg);
  const box = (parent, x0,y0,x1,y1,z0,z1,r=3) => {
    const [outer, inner] = rings(x0,y0,x1,y1,r,.7);
    const item = solid(parent); put(item, prism(P,front,outer,inner,z0,z1)); return item;
  };
  // Rear legs first; the opaque work surface hides their upper ends.
  for (const [x,y] of [[-79,-43],[79,-43],[-79,43],[79,43]]) box(scene,x-3,y-3,x+3,y+3,-20,16,2);
  box(scene,-92,-56,92,56,14,20,5);
  const areas = [{ x:-47,y:0,w:72,h:84 },{ x:46,y:-27,w:68,h:44 },{ x:46,y:27,w:68,h:44 }];
  const trays = areas.map((a) => {
    const [outer,inner] = rings(a.x-a.w/2,a.y-a.h/2,a.x+a.w/2,a.y+a.h/2,4,2);
    const group = mk("g",{},scene), shell = solid(group);
    put(shell,prism(P,front,outer,inner,20,25));
    mk("path",{d:poly(ringAt(P,inner,25)),class:"lo"},group);
    const rim = mk("path",{d:open(ringAt(P,run(inner,front),25)),class:"nf sil"},group);
    // A recessed finger pull identifies the object as a removable tray.
    mk("path",{d:open([P(a.x-9,a.y+a.h/2,23),P(a.x-7,a.y+a.h/2,21),P(a.x+7,a.y+a.h/2,21),P(a.x+9,a.y+a.h/2,23)]),class:"nf lo"},group);
    return { rim };
  });
  const cloth = areas.map((a,i) => {
    const group = mk("g",{},scene), layers = [];
    for (let j=0;j<3-i;j++) {
      layers.push({body:solid(group), neck:mk("path",{class:"nf"},group), fold:mk("path",{class:"nf lo"},group)});
    }
    return {group,layers,x:tween(a.x),y:tween(a.y),z:tween(i===0?1:i===1?3:0),last:""};
  });
  function draw(i,x,y,z) {
    const item = cloth[i], key = [x,y,z].map(v=>v.toFixed(3)).join();
    if (item.last===key) return; item.last=key;
    item.layers.forEach((layer,j)=>{
      const base=25+j*3.5+z;
      const [outer,inner]=rings(x-23,y-16,x+23,y+16,3.5,.65);
      put(layer.body,prism(P,front,outer,inner,base,base+2.2));
      const neck=fillet([[x-7,y-13],[x-6,y-7],[x+6,y-7],[x+7,y-13]],[1.5,2,2,1.5]);
      layer.neck.setAttribute("d",open(neck.map(q=>P(q[0],q[1],base+2.3))));
      layer.fold.setAttribute("d",open([P(x-19,y-9,base+2.3),P(x-13,y-3,base+2.3),P(x-13,y+12,base+2.3)])+open([P(x+19,y-9,base+2.3),P(x+13,y-3,base+2.3),P(x+13,y+12,base+2.3)])+open([P(x-19,y+12,base+2.3),P(x+19,y+12,base+2.3)]));
    });
  }
  const B=register(stage,(_dt,now)=>{
    let moving=false;
    cloth.forEach((item,i)=>{
      draw(i,tval(item.x,now),tval(item.y,now),tval(item.z,now));
      if(!tdone(item.x,now)||!tdone(item.y,now)||!tdone(item.z,now)) moving=true;
    });
    return moving;
  });
  bag.add(B.unregister);
  function select(a) {
    if(a===active)return;
    const from=a<0?active:a,now=performance.now();active=a;
    cloth.forEach((item,i)=>{
      const target=i===0&&a>0?areas[a]:areas[i],delay=Math.abs(i-from)*40;
      const z=a<0?(i===0?1:i===1?3:0):i===0&&a>0?lift+14:Math.max(2,lift-Math.abs(i-a)*9);
      tset(item.x,target.x,now,delay);tset(item.y,target.y,now,delay);tset(item.z,z,now,delay);
      item.layers.at(-1).body.sil.classList.toggle("hi",i===0);
      item.layers.at(-1).neck.classList.toggle("hi",a===i||(a<0&&i===0));
      trays[i].rim.classList.toggle("hi",a===i);
    });
    if(a>0) scene.append(cloth[0].group);
    else cloth.forEach(item=>scene.append(item.group));
    read.textContent=a<0?"rest":a===0?"production":a===1?"dispatch 1":"dispatch 2";
    B.wake();
  }
  function hit([sx,sy]) {
    const [x,y]=unproj(C,sx,sy,25);
    let best=-1,distance=Infinity;
    areas.forEach((a,i)=>{
      const dx=(x-a.x)/(a.w/2+8),dy=(y-a.y)/(a.h/2+8),d=dx*dx+dy*dy;
      if(d<1.5&&d<distance){distance=d;best=i;}
    });
    return best;
  }
  cloth.forEach((item,i)=>draw(i,areas[i].x,areas[i].y,i===0?1:i===1?3:0));
  cloth[0].layers.at(-1).body.sil.classList.add("hi");
  cloth[0].layers.at(-1).neck.classList.add("hi");
  read.textContent="rest";
  bag.add(pointer(stage,{move:p=>select(hit(p)),down:p=>select(hit(p)),leave:()=>select(-1)}));
  bag.add(()=>svg.replaceChildren());
  return {set:v=>{lift=v;const a=active;active=-2;select(a);},destroy:bag.dispose};
}

hairline({
  name:"planning-table",
  means:"Folded garments on a production table: choose a dispatch tray and the unfinished batch lifts across to it.",
  rules:[1,2,4,6,8,9],
  range:[8,18,28],
  tour:[[150,102],[277,137],[220,166],null],
  mount,
});
