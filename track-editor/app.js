const $=id=>document.getElementById(id);
const svg=$('editor'),roadLayer=$('roadLayer'),pieceLayer=$('pieceLayer'),objectLayer=$('objectLayer'),markerLayer=$('markerLayer');
const NS='http://www.w3.org/2000/svg';

const PIECES={
  short:{name:'Short Straight',kind:'straight',length:24},
  long:{name:'Long Straight',kind:'straight',length:52},
  tight:{name:'Tight Curve',kind:'curve',radius:22,angle:90},
  wide:{name:'Wide Curve',kind:'curve',radius:38,angle:90},
  sweep:{name:'Sweep Curve',kind:'curve',radius:65,angle:45},
  sbend:{name:'S-Bend',kind:'sbend',length:54,offset:22},
  up:{name:'Uphill',kind:'slope',length:36,rise:7},
  down:{name:'Downhill',kind:'slope',length:36,rise:-7},
  jump:{name:'Jump',kind:'jump',length:58,rise:5.5,gap:20}
};

function basicLoop(){
  return {
    version:2,name:'Basic Loop',width:22,smoothness:10,closed:true,
    pieces:[
      {type:'long',flip:false},{type:'wide',flip:false},
      {type:'short',flip:false},{type:'wide',flip:false},
      {type:'long',flip:false},{type:'wide',flip:false},
      {type:'short',flip:false},{type:'wide',flip:false}
    ],
    objects:[]
  };
}
function blankTrack(){
  return {version:2,name:'New Track',width:22,smoothness:10,closed:false,pieces:[],objects:[]};
}
let track=basicLoop();
let selectedPiece=-1,objectTool=null,panning=false,lastPointer=null;
let view={x:-130,y:-120,w:260,h:240};
let built={points:[],pieceRanges:[],end:{x:0,y:.65,z:-70,h:0}};
const history=[],MAX_HISTORY=80;

function el(name,attrs={}){
  const n=document.createElementNS(NS,name);
  for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);
  return n;
}
function setStatus(t){$('status').textContent=t}
function syncView(){svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`)}
function screenToWorld(evt){
  const pt=svg.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;
  const p=pt.matrixTransform(svg.getScreenCTM().inverse());
  return {x:p.x,z:p.y};
}
function snapshot(){return JSON.stringify(track)}
function pushHistory(){
  history.push(snapshot());
  if(history.length>MAX_HISTORY)history.shift();
  $('undoBtn').disabled=!history.length;
}
function undo(){
  if(!history.length)return;
  track=JSON.parse(history.pop());
  selectedPiece=-1;
  rebuild();
  draw();
  fitTrack();
  setStatus('Undone');
  $('undoBtn').disabled=!history.length;
}
function addPoint(out,x,y,z,bank=0,gapAfter=false){
  const last=out.at(-1);
  if(last&&Math.hypot(last.x-x,last.y-y,last.z-z)<.001){
    last.bank=bank;last.gapAfter=gapAfter;return;
  }
  out.push({x,y,z,bank,gapAfter});
}
function forward(h){return {x:Math.sin(h),z:Math.cos(h)}}
function piecePoints(state,piece){
  const def=PIECES[piece.type]||PIECES.short;
  const out=[];
  let {x,y,z,h}=state;
  addPoint(out,x,y,z,0,false);
  const flip=piece.flip?-1:1;

  if(def.kind==='straight'||def.kind==='slope'){
    const steps=Math.max(3,Math.ceil(def.length/6));
    const rise=def.kind==='slope'?def.rise:0;
    for(let i=1;i<=steps;i++){
      const t=i/steps,f=forward(h);
      addPoint(out,x+f.x*def.length*t,y+rise*t,z+f.z*def.length*t,0,false);
    }
    const f=forward(h);x+=f.x*def.length;z+=f.z*def.length;y+=rise;
  }else if(def.kind==='curve'){
    const delta=flip*def.angle*Math.PI/180;
    const steps=Math.max(8,Math.ceil(def.angle/7.5));
    let px=x,pz=z,ph=h;
    for(let i=1;i<=steps;i++){
      const nh=h+delta*(i/steps);
      const mid=(ph+nh)/2,ds=def.radius*Math.abs(nh-ph);
      px+=Math.sin(mid)*ds;pz+=Math.cos(mid)*ds;ph=nh;
      addPoint(out,px,y,pz,0,false);
    }
    x=px;z=pz;h+=delta;
  }else if(def.kind==='sbend'){
    const steps=14;
    for(let i=1;i<=steps;i++){
      const t=i/steps;
      const localF=def.length*t;
      const localR=flip*def.offset*.5*(1-Math.cos(Math.PI*2*t));
      const f=forward(h),r={x:Math.cos(h),z:-Math.sin(h)};
      addPoint(out,x+f.x*localF+r.x*localR,y,z+f.z*localF+r.z*localR,0,false);
    }
    const f=forward(h);x+=f.x*def.length;z+=f.z*def.length;
  }else if(def.kind==='jump'){
    const f=forward(h),launch=18,gap=def.gap,landing=20,total=launch+gap+landing;
    for(let i=1;i<=5;i++){
      const t=i/5;
      addPoint(out,x+f.x*launch*t,y+def.rise*(t*t*(3-2*t)),z+f.z*launch*t,0,i===5);
    }
    // Invisible guide point carries the logical route across the air gap.
    addPoint(out,x+f.x*(launch+gap),y+def.rise,z+f.z*(launch+gap),0,false);
    for(let i=1;i<=6;i++){
      const t=i/6;
      const d=launch+gap+landing*t;
      addPoint(out,x+f.x*d,y+def.rise*(1-(t*t*(3-2*t))),z+f.z*d,0,false);
    }
    x+=f.x*total;z+=f.z*total;
  }
  return {points:out,end:{x,y,z,h}};
}
function rebuild(){
  const all=[];
  const ranges=[];
  let state={x:0,y:.65,z:-70,h:0};
  for(let i=0;i<track.pieces.length;i++){
    const r=piecePoints(state,track.pieces[i]);
    const startIndex=all.length?all.length-1:0;
    for(let k=0;k<r.points.length;k++){
      if(all.length&&k===0)continue;
      all.push(r.points[k]);
    }
    ranges.push({start:startIndex,end:all.length-1});
    state=r.end;
  }
  if(!all.length)addPoint(all,state.x,state.y,state.z,0,false);

  const start=all[0],end=all.at(-1);
  const distance=Math.hypot(end.x-start.x,end.z-start.z);
  let dh=Math.atan2(Math.sin(state.h),Math.cos(state.h));
  const headingClose=Math.abs(dh)<.18;
  const heightClose=Math.abs(end.y-start.y)<1.5;
  track.closed=track.pieces.length>=4&&distance<5&&headingClose&&heightClose;
  if(track.closed){
    end.x=start.x;end.y=start.y;end.z=start.z;
  }
  track.points=all.map(p=>({...p}));
  built={points:all,pieceRanges:ranges,end:state,distance};
}
function pointString(points){return points.map(q=>`${q.x},${q.z}`).join(' ')}
function draw(){
  rebuild();
  roadLayer.replaceChildren();pieceLayer.replaceChildren();objectLayer.replaceChildren();markerLayer.replaceChildren();
  $('gridBg').style.display=$('showGrid').checked?'':'none';

  for(let i=0;i<track.pieces.length;i++){
    const rg=built.pieceRanges[i];
    const pts=built.points.slice(rg.start,rg.end+1);
    if(pts.length<2)continue;
    // Split visual road where a jump gap begins.
    let run=[];
    const flush=()=>{
      if(run.length<2){run=[];return}
      const ps=pointString(run);
      roadLayer.append(el('polyline',{points:ps,class:'road-edge','stroke-width':track.width+3}));
      roadLayer.append(el('polyline',{points:ps,class:'road','stroke-width':track.width}));
      roadLayer.append(el('polyline',{points:ps,class:'centre'}));
      run=[];
    };
    for(let k=0;k<pts.length;k++){
      run.push(pts[k]);
      if(pts[k].gapAfter){flush(); if(k+1<pts.length)run=[pts[k+1]],k++;}
    }
    flush();

    const ps=pointString(pts);
    if(i===selectedPiece)pieceLayer.append(el('polyline',{points:ps,class:'pieceSelected','stroke-width':track.width+6}));
    const hit=el('polyline',{points:ps,class:'pieceHit','stroke-width':track.width+12});
    hit.dataset.piece=i;pieceLayer.append(hit);
  }

  track.objects.forEach((o,i)=>{
    const cls='obj '+o.type;let n;
    if(o.type==='spinner')n=el('rect',{x:o.x-3,y:o.z-.9,width:6,height:1.8,rx:.5,class:cls});
    else if(o.type==='bus')n=el('rect',{x:o.x-1.5,y:o.z-4,width:3,height:8,rx:.5,class:cls});
    else n=el('circle',{cx:o.x,cy:o.z,r:o.type==='chicken'?1.2:1.7,class:cls});
    n.dataset.object=i;objectLayer.append(n);
  });

  const start=built.points[0],end=built.points.at(-1);
  markerLayer.append(el('line',{x1:start.x-4,y1:start.z+7,x2:start.x-4,y2:start.z-7,class:'start-pole'}));
  markerLayer.append(el('path',{d:`M ${start.x-4} ${start.z-7} L ${start.x+7} ${start.z-3} L ${start.x-4} ${start.z+1} Z`,class:'start-flag'}));
  const st=el('text',{x:start.x+8,y:start.z-3,class:'start-label'});st.textContent='START';markerLayer.append(st);
  if(!track.closed){
    markerLayer.append(el('circle',{cx:end.x,cy:end.z,r:3,class:'end-dot'}));
    const et=el('text',{x:end.x+5,y:end.z-4,class:'end-label'});et.textContent='END';markerLayer.append(et);
  }
  updateUI();
}
function updateUI(){
  $('trackName').value=track.name;
  $('roadWidth').value=track.width;$('widthOut').textContent=track.width+' m';
  const info=$('selectedInfo');
  if(selectedPiece>=0&&track.pieces[selectedPiece]){
    const p=track.pieces[selectedPiece],def=PIECES[p.type];
    info.innerHTML=`<b>#${selectedPiece+1} · ${def.name}</b><br>${p.flip?'LEFT / FLIPPED':'RIGHT / NORMAL'}`;
    $('flipSelectedBtn').disabled=!['curve','sbend'].includes(def.kind);
    $('deletePieceBtn').disabled=false;
  }else{
    info.textContent='No piece selected. New pieces will be added to the end.';
    $('flipSelectedBtn').disabled=true;$('deletePieceBtn').disabled=true;
  }
  const ls=$('loopStatus');
  if(track.closed){
    ls.className='loop-status closed';ls.textContent='✓ LOOP CLOSED · end snapped to START';
  }else{
    ls.className='loop-status open';ls.textContent=`OPEN TRACK · end is ${Math.round(built.distance||0)} m from START`;
  }
  $('sequence').replaceChildren();
  track.pieces.forEach((p,i)=>{
    const d=PIECES[p.type],n=document.createElement('div');
    n.className='seqItem'+(i===selectedPiece?' selected':'');n.dataset.piece=i;
    n.innerHTML=`<span class="seqNum">${i+1}</span><span>${d.name}</span><span class="seqDir">${['curve','sbend'].includes(d.kind)?(p.flip?'L':'R'):''}</span>`;
    $('sequence').append(n);
  });
  track.smoothness=10;
  $('jsonPreview').value=JSON.stringify(track,null,2);
}
function addPiece(type){
  pushHistory();
  const piece={type,flip:!!$('reversePiece').checked};
  const idx=selectedPiece>=0?selectedPiece+1:track.pieces.length;
  track.pieces.splice(idx,0,piece);
  selectedPiece=idx;
  draw();fitTrack();
  setStatus(PIECES[type].name+' snapped into place');
}
function selectPiece(i){selectedPiece=Number(i);objectTool=null;document.querySelectorAll('.objectTool').forEach(b=>b.classList.remove('active'));draw()}
function setObjectTool(type){
  objectTool=type;selectedPiece=-1;
  document.querySelectorAll('.objectTool').forEach(b=>b.classList.toggle('active',b.dataset.object===type));
  draw();setStatus(type?'Place '+type+' on the map':'Pointer / pan');
}

document.querySelectorAll('.pieceBtn').forEach(b=>b.addEventListener('click',()=>addPiece(b.dataset.piece)));
$('sequence').addEventListener('click',e=>{const item=e.target.closest('[data-piece]');if(item)selectPiece(item.dataset.piece)});
pieceLayer.addEventListener('click',e=>{if(e.target.dataset.piece!==undefined)selectPiece(e.target.dataset.piece)});
document.querySelectorAll('.objectTool').forEach(b=>b.addEventListener('click',()=>setObjectTool(b.dataset.object)));

svg.addEventListener('pointerdown',e=>{
  if(e.target.dataset.piece!==undefined||e.target.dataset.object!==undefined)return;
  if(objectTool){
    const w=screenToWorld(e);pushHistory();
    track.objects.push({type:objectTool,x:Math.round(w.x),z:Math.round(w.z)});
    draw();return;
  }
  panning=true;lastPointer={x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId);
});
objectLayer.addEventListener('click',e=>{
  const i=e.target.dataset.object;if(i===undefined)return;
  pushHistory();track.objects.splice(Number(i),1);draw();setStatus('Object removed');
});
svg.addEventListener('pointermove',e=>{
  if(!panning||!lastPointer)return;
  const scale=view.w/svg.clientWidth;
  view.x-=(e.clientX-lastPointer.x)*scale;view.y-=(e.clientY-lastPointer.y)*scale;
  lastPointer={x:e.clientX,y:e.clientY};syncView();
});
const stopPan=e=>{panning=false;lastPointer=null;if(svg.hasPointerCapture?.(e.pointerId))svg.releasePointerCapture(e.pointerId)};
svg.addEventListener('pointerup',stopPan);svg.addEventListener('pointercancel',stopPan);
svg.addEventListener('wheel',e=>{
  e.preventDefault();
  const before=screenToWorld(e),factor=e.deltaY>0?1.12:.88;
  view.w=Math.max(55,Math.min(850,view.w*factor));view.h=view.w*(svg.clientHeight/svg.clientWidth);
  syncView();
  const after=screenToWorld(e);view.x+=before.x-after.x;view.y+=before.z-after.z;syncView();
},{passive:false});

$('undoBtn').addEventListener('click',undo);
$('flipSelectedBtn').addEventListener('click',()=>{
  if(selectedPiece<0)return;
  const d=PIECES[track.pieces[selectedPiece].type];
  if(!['curve','sbend'].includes(d.kind))return;
  pushHistory();track.pieces[selectedPiece].flip=!track.pieces[selectedPiece].flip;draw();fitTrack();setStatus('Piece flipped');
});
$('deletePieceBtn').addEventListener('click',()=>{
  if(selectedPiece<0)return;pushHistory();track.pieces.splice(selectedPiece,1);
  selectedPiece=Math.min(selectedPiece,track.pieces.length-1);draw();fitTrack();setStatus('Piece deleted');
});
$('newBtn').addEventListener('click',()=>{
  if(!confirm('Reset to the basic snap-together loop?'))return;
  pushHistory();track=basicLoop();selectedPiece=-1;draw();fitTrack();setStatus('Basic loop ready');
});
$('blankBtn').addEventListener('click',()=>{
  if(!confirm('Start with only the START point?'))return;
  pushHistory();track=blankTrack();selectedPiece=-1;draw();fitTrack();setStatus('Blank track — choose a piece from the left');
});
$('trackName').addEventListener('input',e=>{track.name=e.target.value;updateUI()});
$('roadWidth').addEventListener('input',e=>{track.width=Number(e.target.value);draw()});
$('showGrid').addEventListener('change',draw);
$('objectOffBtn').addEventListener('click',()=>setObjectTool(null));
$('clearObjectsBtn').addEventListener('click',()=>{if(track.objects.length){pushHistory();track.objects=[];draw()}});
$('fitBtn').addEventListener('click',fitTrack);
$('saveBtn').addEventListener('click',()=>{rebuild();localStorage.setItem('carRacerTrackDraft',JSON.stringify(track));setStatus('Saved in this browser')});
$('testBtn').addEventListener('click',e=>{
  rebuild();
  if(track.points.length<2){e.preventDefault();alert('Add at least one track piece first.');return}
  try{
    localStorage.setItem('carRacerTrackTest',JSON.stringify(track));
    localStorage.setItem('carRacerTrackDraft',JSON.stringify(track));
    setStatus('Opening test drive in a new tab…');
  }catch(err){e.preventDefault();alert('Could not start test drive: '+err.message)}
});
$('copyBtn').addEventListener('click',async()=>{rebuild();await navigator.clipboard.writeText(JSON.stringify(track,null,2));setStatus('JSON copied')});
$('exportBtn').addEventListener('click',()=>{
  rebuild();const blob=new Blob([JSON.stringify(track,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(track.name||'track').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.json';a.click();URL.revokeObjectURL(a.href);
});
$('importInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.pieces))throw new Error('This is an older free-draw track. Start a new snap track instead.');
    pushHistory();track=data;track.objects=track.objects||[];track.width=track.width||22;selectedPiece=-1;draw();fitTrack();setStatus('Imported '+file.name);
  }catch(err){alert('Could not import: '+err.message)}
  e.target.value='';
});

function fitTrack(){
  rebuild();
  const pts=built.points;if(!pts.length){view={x:-130,y:-120,w:260,h:240};syncView();return}
  const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const pad=35,w=Math.max(80,maxX-minX+pad*2),h=Math.max(80,maxZ-minZ+pad*2);
  const aspect=svg.clientWidth/svg.clientHeight||1.4;
  if(w/h>aspect){view.w=w;view.h=w/aspect}else{view.h=h;view.w=h*aspect}
  view.x=(minX+maxX)/2-view.w/2;view.y=(minZ+maxZ)/2-view.h/2;syncView();
}
addEventListener('keydown',e=>{
  const editing=['INPUT','TEXTAREA'].includes(document.activeElement.tagName);
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();undo()}
  if((e.key==='Delete'||e.key==='Backspace')&&!editing&&selectedPiece>=0){e.preventDefault();$('deletePieceBtn').click()}
  if(e.key==='Escape')setObjectTool(null);
});

const saved=localStorage.getItem('carRacerTrackDraft');
if(saved){
  try{
    const s=JSON.parse(saved);
    if(Array.isArray(s.pieces)){track=s;track.objects=track.objects||[];track.width=track.width||22}
  }catch(_){}
}
rebuild();draw();requestAnimationFrame(fitTrack);