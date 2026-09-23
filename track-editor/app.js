const $=id=>document.getElementById(id);
const svg=$('editor'),roadLayer=$('roadLayer'),pieceLayer=$('pieceLayer'),objectLayer=$('objectLayer'),markerLayer=$('markerLayer'),dragLayer=$('dragLayer');
const NS='http://www.w3.org/2000/svg';
const UNIT=10;

const PIECES={
  straight1:{name:'Straight ×1',kind:'straight',units:1},
  straight2:{name:'Straight ×2',kind:'straight',units:2},
  straight4:{name:'Straight ×4',kind:'straight',units:4},
  straight8:{name:'Straight ×8',kind:'straight',units:8},
  tight90:{name:'Tight Curve',kind:'curve90',radiusU:2},
  wide90:{name:'Wide Curve',kind:'curve90',radiusU:4},
  sweep45:{name:'Sweep Curve',kind:'sweep45',rightU:2,forwardU:4},
  sbend:{name:'S-Bend',kind:'sbend',forwardU:6,rightU:2},
  up:{name:'Uphill',kind:'slope',units:4,rise:7.5},
  down:{name:'Downhill',kind:'slope',units:4,rise:-7.5},
  jump:{name:'Jump',kind:'jump',units:6,rise:5.5,gapU:2}
};

function basicLoop(){
  return {
    version:3,unit:UNIT,name:'Basic Loop',width:22,smoothness:10,closed:true,
    pieces:[
      {type:'straight8',flip:false},{type:'wide90',flip:false},
      {type:'straight8',flip:false},{type:'wide90',flip:false},
      {type:'straight8',flip:false},{type:'wide90',flip:false},
      {type:'straight8',flip:false},{type:'wide90',flip:false}
    ],objects:[]
  };
}
function blankTrack(){return {version:3,unit:UNIT,name:'New Track',width:22,smoothness:10,closed:false,pieces:[],objects:[]}}

let track=basicLoop();
let selectedPiece=-1,objectTool=null,panning=false,lastPointer=null;
let dragPiece=null;
let view={x:-150,y:-130,w:300,h:260};
let built={points:[],pieceRanges:[],states:[{x:0,y:.65,z:-80,h:0}],distance:0};
const history=[],MAX_HISTORY=80;

function el(name,attrs={}){const n=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n}
function setStatus(t){$('status').textContent=t}
function syncView(){svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`)}
function screenToWorldXY(clientX,clientY){
  const pt=svg.createSVGPoint();pt.x=clientX;pt.y=clientY;
  const p=pt.matrixTransform(svg.getScreenCTM().inverse());
  return {x:p.x,z:p.y};
}
function screenToWorld(e){return screenToWorldXY(e.clientX,e.clientY)}
function snapshot(){return JSON.stringify(track)}
function pushHistory(){history.push(snapshot());if(history.length>MAX_HISTORY)history.shift();$('undoBtn').disabled=!history.length}
function undo(){if(!history.length)return;track=JSON.parse(history.pop());selectedPiece=-1;rebuild();draw();fitTrack();setStatus('Undone');$('undoBtn').disabled=!history.length}
function forward(h){return {x:Math.sin(h),z:Math.cos(h)}}
function right(h){return {x:Math.cos(h),z:-Math.sin(h)}}
function addPoint(out,x,y,z,bank=0,gapAfter=false){
  const last=out.at(-1);
  if(last&&Math.hypot(last.x-x,last.y-y,last.z-z)<.001){last.bank=bank;last.gapAfter=gapAfter;return}
  out.push({x,y,z,bank,gapAfter});
}
function cubic(a,b,c,d,t){const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d}

function piecePoints(state,piece){
  const def=PIECES[piece.type]||PIECES.straight1,out=[];
  let {x,y,z,h}=state;
  addPoint(out,x,y,z,0,false);
  const side=piece.flip?-1:1,f=forward(h),r=right(h);

  if(def.kind==='straight'||def.kind==='slope'){
    const len=def.units*UNIT,rise=def.kind==='slope'?def.rise:0,steps=Math.max(3,def.units*3);
    for(let i=1;i<=steps;i++){const t=i/steps;addPoint(out,x+f.x*len*t,y+rise*t,z+f.z*len*t)}
    x+=f.x*len;z+=f.z*len;y+=rise;
  }else if(def.kind==='curve90'){
    const radius=def.radiusU*UNIT,delta=side*Math.PI/2,steps=18;
    let px=x,pz=z,ph=h;
    for(let i=1;i<=steps;i++){
      const nh=h+delta*i/steps,mid=(ph+nh)/2,ds=radius*Math.abs(nh-ph);
      px+=Math.sin(mid)*ds;pz+=Math.cos(mid)*ds;ph=nh;addPoint(out,px,y,pz);
    }
    // Force the connector onto the exact unit grid.
    const rr=right(h),ff=forward(h);
    x=x+ff.x*radius+rr.x*side*radius;
    z=z+ff.z*radius+rr.z*side*radius;
    h+=delta;
    out.at(-1).x=x;out.at(-1).z=z;
  }else if(def.kind==='sweep45'){
    const fw=def.forwardU*UNIT,rt=side*def.rightU*UNIT,steps=16;
    const endX=x+f.x*fw+r.x*rt,endZ=z+f.z*fw+r.z*rt;
    const endH=h+side*Math.PI/4,ef=forward(endH);
    const handle=fw*.42;
    const c1={x:x+f.x*handle,z:z+f.z*handle};
    const c2={x:endX-ef.x*handle,z:endZ-ef.z*handle};
    for(let i=1;i<=steps;i++){const t=i/steps;addPoint(out,cubic(x,c1.x,c2.x,endX,t),y,cubic(z,c1.z,c2.z,endZ,t))}
    x=endX;z=endZ;h=endH;
  }else if(def.kind==='sbend'){
    const fw=def.forwardU*UNIT,rt=side*def.rightU*UNIT,steps=20;
    for(let i=1;i<=steps;i++){
      const t=i/steps;
      const lf=fw*t,lr=rt*(t*t*(3-2*t));
      addPoint(out,x+f.x*lf+r.x*lr,y,z+f.z*lf+r.z*lr);
    }
    x+=f.x*fw+r.x*rt;z+=f.z*fw+r.z*rt;
  }else if(def.kind==='jump'){
    const total=def.units*UNIT,launch=2*UNIT,gap=def.gapU*UNIT,landing=total-launch-gap;
    for(let i=1;i<=6;i++){const t=i/6;addPoint(out,x+f.x*launch*t,y+def.rise*(t*t*(3-2*t)),z+f.z*launch*t,0,i===6)}
    addPoint(out,x+f.x*(launch+gap),y+def.rise,z+f.z*(launch+gap));
    for(let i=1;i<=6;i++){const t=i/6,d=launch+gap+landing*t;addPoint(out,x+f.x*d,y+def.rise*(1-t*t*(3-2*t)),z+f.z*d)}
    x+=f.x*total;z+=f.z*total;
  }
  return {points:out,end:{x,y,z,h}};
}

function rebuild(){
  const all=[],ranges=[],states=[{x:0,y:.65,z:-80,h:0}];
  let state={...states[0]};
  for(let i=0;i<track.pieces.length;i++){
    const res=piecePoints(state,track.pieces[i]),startIndex=all.length?all.length-1:0;
    for(let k=0;k<res.points.length;k++){if(all.length&&k===0)continue;all.push(res.points[k])}
    ranges.push({start:startIndex,end:all.length-1});state=res.end;states.push({...state});
  }
  if(!all.length)addPoint(all,state.x,state.y,state.z);
  const start=all[0],end=all.at(-1);
  const distance=Math.hypot(end.x-start.x,end.z-start.z),dh=Math.atan2(Math.sin(state.h),Math.cos(state.h));
  const closed=track.pieces.length>=4&&distance<.6&&Math.abs(dh)<.025&&Math.abs(end.y-start.y)<.25;
  track.closed=closed;
  if(closed){end.x=start.x;end.y=start.y;end.z=start.z}
  track.points=all.map(p=>({...p}));
  built={points:all,pieceRanges:ranges,states,distance,endState:state};
}
function insertionIndex(){return selectedPiece>=0?selectedPiece+1:track.pieces.length}
function snapState(){rebuild();return built.states[insertionIndex()]||built.states.at(-1)}
function pointString(pts){return pts.map(q=>`${q.x},${q.z}`).join(' ')}

function drawPieceRoad(pts){
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
    if(pts[k].gapAfter){flush();if(k+1<pts.length){run=[pts[k+1]];k++}}
  }
  flush();
}
function draw(){
  rebuild();
  roadLayer.replaceChildren();pieceLayer.replaceChildren();objectLayer.replaceChildren();markerLayer.replaceChildren();
  $('gridBg').style.display=$('showGrid').checked?'':'none';

  for(let i=0;i<track.pieces.length;i++){
    const rg=built.pieceRanges[i],pts=built.points.slice(rg.start,rg.end+1);
    if(pts.length<2)continue;
    drawPieceRoad(pts);
    const ps=pointString(pts);
    if(i===selectedPiece)pieceLayer.append(el('polyline',{points:ps,class:'pieceSelected','stroke-width':track.width+6}));
    const hit=el('polyline',{points:ps,class:'pieceHit','stroke-width':track.width+12});hit.dataset.piece=i;pieceLayer.append(hit);
  }

  track.objects.forEach((o,i)=>{
    const cls='obj '+o.type;let n;
    if(o.type==='spinner')n=el('rect',{x:o.x-3,y:o.z-.9,width:6,height:1.8,rx:.5,class:cls});
    else if(o.type==='bus')n=el('rect',{x:o.x-1.5,y:o.z-4,width:3,height:8,rx:.5,class:cls});
    else n=el('circle',{cx:o.x,cy:o.z,r:o.type==='chicken'?1.2:1.7,class:cls});
    n.dataset.object=i;objectLayer.append(n);
  });

  const start=built.points[0],snap=snapState();
  markerLayer.append(el('line',{x1:start.x-4,y1:start.z+7,x2:start.x-4,y2:start.z-7,class:'start-pole'}));
  markerLayer.append(el('path',{d:`M ${start.x-4} ${start.z-7} L ${start.x+7} ${start.z-3} L ${start.x-4} ${start.z+1} Z`,class:'start-flag'}));
  const st=el('text',{x:start.x+8,y:start.z-3,class:'start-label'});st.textContent='START';markerLayer.append(st);

  const cc=el('circle',{cx:snap.x,cy:snap.z,r:4.2,class:'connector'+(track.closed&&selectedPiece<0?' closed':'')});markerLayer.append(cc);
  markerLayer.append(el('circle',{cx:snap.x,cy:snap.z,r:8,class:'connector-ring'}));
  const et=el('text',{x:snap.x+7,y:snap.z-6,class:'end-label'});et.textContent=selectedPiece>=0?'INSERT':'END';markerLayer.append(et);
  updateUI();
}

function updateUI(){
  $('trackName').value=track.name;$('roadWidth').value=track.width;$('widthOut').textContent=track.width+' m';
  const info=$('selectedInfo');
  if(selectedPiece>=0&&track.pieces[selectedPiece]){
    const p=track.pieces[selectedPiece],d=PIECES[p.type];
    info.innerHTML=`<b>#${selectedPiece+1} · ${d.name}</b><br>New piece will snap after this section.`;
    $('flipSelectedBtn').disabled=!['curve90','sweep45','sbend'].includes(d.kind);$('deletePieceBtn').disabled=false;
  }else{
    info.textContent='Nothing selected — snapping to the track END.';
    $('flipSelectedBtn').disabled=true;$('deletePieceBtn').disabled=true;
  }
  const ls=$('loopStatus');
  if(track.closed){ls.className='loop-status closed';ls.textContent='✓ LOOP CLOSED EXACTLY ON THE 1-UNIT SYSTEM'}
  else{
    const s=built.endState,du=(built.distance/UNIT).toFixed(1);
    ls.className='loop-status open';ls.textContent=`OPEN · end is ${du} units from START · heading ${Math.round(s.h*180/Math.PI)}°`;
  }
  $('sequence').replaceChildren();
  track.pieces.forEach((p,i)=>{
    const d=PIECES[p.type],n=document.createElement('div');
    n.className='seqItem'+(i===selectedPiece?' selected':'');n.dataset.piece=i;
    n.innerHTML=`<span class="seqNum">${i+1}</span><span>${d.name}</span><span class="seqDir">${['curve90','sweep45','sbend'].includes(d.kind)?(p.flip?'L':'R'):''}</span>`;
    $('sequence').append(n);
  });
  track.unit=UNIT;track.smoothness=10;$('jsonPreview').value=JSON.stringify(track,null,2);
}

function selectPiece(i){selectedPiece=Number(i);objectTool=null;document.querySelectorAll('.objectTool').forEach(b=>b.classList.remove('active'));draw();setStatus('Insertion connector moved after piece '+(selectedPiece+1))}
function setObjectTool(type){objectTool=type;selectedPiece=-1;document.querySelectorAll('.objectTool').forEach(b=>b.classList.toggle('active',b.dataset.object===type));draw();setStatus(type?'Place '+type:'Pointer / pan')}

function pointerInsideSvg(x,y){
  const r=svg.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
}
function startPaletteDrag(type,e){
  e.preventDefault();
  objectTool=null;
  const piece={type,flip:!!$('reversePiece').checked};
  dragPiece={piece,valid:false,x:e.clientX,y:e.clientY,pointerId:e.pointerId};
  document.body.setPointerCapture?.(e.pointerId);
  updateDrag(e.clientX,e.clientY);
  addEventListener('pointermove',paletteDragMove,{passive:false});
  addEventListener('pointerup',paletteDragEnd,{once:true});
  addEventListener('pointercancel',paletteDragEnd,{once:true});
  setStatus('Drag to the orange connector');
}
function paletteDragMove(e){if(!dragPiece)return;e.preventDefault();updateDrag(e.clientX,e.clientY)}
function updateDrag(clientX,clientY){
  dragPiece.x=clientX;dragPiece.y=clientY;dragLayer.replaceChildren();
  if(!pointerInsideSvg(clientX,clientY)){dragPiece.valid=false;return}
  const w=screenToWorldXY(clientX,clientY),snap=snapState();
  const dist=Math.hypot(w.x-snap.x,w.z-snap.z);
  dragPiece.valid=dist<16;
  const preview=piecePoints(snap,dragPiece.piece).points;
  const pp=el('polyline',{points:pointString(preview),class:'dragPreview'+(dragPiece.valid?' valid':''),'stroke-width':Math.max(5,track.width*.55)});
  dragLayer.append(pp);
  const end=preview.at(-1);
  dragLayer.append(el('circle',{cx:end.x,cy:end.z,r:3.5,class:'drag-end'+(dragPiece.valid?' valid':'')}));
  markerLayer.querySelectorAll('.connector,.connector-ring').forEach(n=>n.classList.toggle('ready',dragPiece.valid));
  setStatus(dragPiece.valid?'SNAP READY — release to place':'Move closer to the orange connector');
}
function paletteDragEnd(e){
  removeEventListener('pointermove',paletteDragMove);
  markerLayer.querySelectorAll('.connector,.connector-ring').forEach(n=>n.classList.remove('ready'));
  if(!dragPiece)return;
  const valid=dragPiece.valid,piece=dragPiece.piece;dragPiece=null;dragLayer.replaceChildren();
  if(valid){
    pushHistory();
    const idx=insertionIndex();track.pieces.splice(idx,0,piece);selectedPiece=idx;
    draw();fitTrack();setStatus(PIECES[piece.type].name+' snapped into place');
  }else setStatus('Not placed — pieces must snap to a connector');
}

document.querySelectorAll('.pieceBtn').forEach(b=>b.addEventListener('pointerdown',e=>startPaletteDrag(b.dataset.piece,e)));
$('sequence').addEventListener('click',e=>{const item=e.target.closest('[data-piece]');if(item)selectPiece(item.dataset.piece)});
pieceLayer.addEventListener('click',e=>{if(e.target.dataset.piece!==undefined)selectPiece(e.target.dataset.piece)});
document.querySelectorAll('.objectTool').forEach(b=>b.addEventListener('click',()=>setObjectTool(b.dataset.object)));

svg.addEventListener('pointerdown',e=>{
  if(e.target.dataset.piece!==undefined||e.target.dataset.object!==undefined)return;
  if(objectTool){const w=screenToWorld(e);pushHistory();track.objects.push({type:objectTool,x:Math.round(w.x/UNIT)*UNIT,z:Math.round(w.z/UNIT)*UNIT});draw();return}
  panning=true;lastPointer={x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId);
});
objectLayer.addEventListener('click',e=>{const i=e.target.dataset.object;if(i===undefined)return;pushHistory();track.objects.splice(Number(i),1);draw();setStatus('Object removed')});
svg.addEventListener('pointermove',e=>{
  if(!panning||!lastPointer)return;
  const scale=view.w/svg.clientWidth;view.x-=(e.clientX-lastPointer.x)*scale;view.y-=(e.clientY-lastPointer.y)*scale;lastPointer={x:e.clientX,y:e.clientY};syncView();
});
const stopPan=e=>{panning=false;lastPointer=null;if(svg.hasPointerCapture?.(e.pointerId))svg.releasePointerCapture(e.pointerId)};
svg.addEventListener('pointerup',stopPan);svg.addEventListener('pointercancel',stopPan);
svg.addEventListener('wheel',e=>{
  e.preventDefault();const before=screenToWorld(e),factor=e.deltaY>0?1.12:.88;
  view.w=Math.max(55,Math.min(900,view.w*factor));view.h=view.w*(svg.clientHeight/svg.clientWidth);syncView();
  const after=screenToWorld(e);view.x+=before.x-after.x;view.y+=before.z-after.z;syncView();
},{passive:false});

$('undoBtn').addEventListener('click',undo);
$('flipSelectedBtn').addEventListener('click',()=>{
  if(selectedPiece<0)return;const d=PIECES[track.pieces[selectedPiece].type];
  if(!['curve90','sweep45','sbend'].includes(d.kind))return;
  pushHistory();track.pieces[selectedPiece].flip=!track.pieces[selectedPiece].flip;draw();fitTrack();setStatus('Piece flipped');
});
$('deletePieceBtn').addEventListener('click',()=>{if(selectedPiece<0)return;pushHistory();track.pieces.splice(selectedPiece,1);selectedPiece=-1;draw();fitTrack();setStatus('Piece deleted')});
$('newBtn').addEventListener('click',()=>{if(!confirm('Reset to the basic 1-unit loop?'))return;pushHistory();track=basicLoop();selectedPiece=-1;draw();fitTrack();setStatus('Basic modular loop ready')});
$('blankBtn').addEventListener('click',()=>{if(!confirm('Start with only the START connector?'))return;pushHistory();track=blankTrack();selectedPiece=-1;draw();fitTrack();setStatus('Blank track — drag your first piece to START')});
$('trackName').addEventListener('input',e=>{track.name=e.target.value;updateUI()});
$('roadWidth').addEventListener('input',e=>{track.width=Number(e.target.value);draw()});
$('showGrid').addEventListener('change',draw);$('objectOffBtn').addEventListener('click',()=>setObjectTool(null));
$('clearObjectsBtn').addEventListener('click',()=>{if(track.objects.length){pushHistory();track.objects=[];draw()}});
$('fitBtn').addEventListener('click',fitTrack);
$('saveBtn').addEventListener('click',()=>{rebuild();localStorage.setItem('carRacerTrackDraft',JSON.stringify(track));setStatus('Saved in this browser')});
$('testBtn').addEventListener('click',e=>{rebuild();if(track.points.length<2){e.preventDefault();alert('Add at least one track piece first.');return}try{localStorage.setItem('carRacerTrackTest',JSON.stringify(track));localStorage.setItem('carRacerTrackDraft',JSON.stringify(track));setStatus('Opening test drive in a new tab…')}catch(err){e.preventDefault();alert('Could not start test drive: '+err.message)}});
$('copyBtn').addEventListener('click',async()=>{rebuild();await navigator.clipboard.writeText(JSON.stringify(track,null,2));setStatus('JSON copied')});
$('exportBtn').addEventListener('click',()=>{rebuild();const blob=new Blob([JSON.stringify(track,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(track.name||'track').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.json';a.click();URL.revokeObjectURL(a.href)});
$('importInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{const data=JSON.parse(await file.text());if(!Array.isArray(data.pieces)||data.version<3)throw new Error('This is an older editor format. Start a new modular track.');pushHistory();track=data;track.objects=track.objects||[];track.width=track.width||22;selectedPiece=-1;draw();fitTrack();setStatus('Imported '+file.name)}catch(err){alert('Could not import: '+err.message)}e.target.value='';
});

function fitTrack(){
  rebuild();const pts=built.points;if(!pts.length){view={x:-150,y:-130,w:300,h:260};syncView();return}
  const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const pad=40,w=Math.max(90,maxX-minX+pad*2),h=Math.max(90,maxZ-minZ+pad*2),aspect=svg.clientWidth/svg.clientHeight||1.4;
  if(w/h>aspect){view.w=w;view.h=w/aspect}else{view.h=h;view.w=h*aspect}
  view.x=(minX+maxX)/2-view.w/2;view.y=(minZ+maxZ)/2-view.h/2;syncView();
}
addEventListener('keydown',e=>{
  const editing=['INPUT','TEXTAREA'].includes(document.activeElement.tagName);
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();undo()}
  if((e.key==='Delete'||e.key==='Backspace')&&!editing&&selectedPiece>=0){e.preventDefault();$('deletePieceBtn').click()}
  if(e.key==='Escape'){selectedPiece=-1;setObjectTool(null);draw()}
});

const saved=localStorage.getItem('carRacerTrackDraft');
if(saved){try{const s=JSON.parse(saved);if(Array.isArray(s.pieces)&&s.version>=3){track=s;track.objects=track.objects||[];track.width=track.width||22}}catch(_){}}
rebuild();draw();requestAnimationFrame(fitTrack);