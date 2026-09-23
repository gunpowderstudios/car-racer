const $=id=>document.getElementById(id);
const svg=$('editor'),roadLayer=$('roadLayer'),pointLayer=$('pointLayer'),objectLayer=$('objectLayer'),directionLayer=$('directionLayer');
const NS='http://www.w3.org/2000/svg';

let track={
  version:1,
  name:'Simple Loop',
  width:22,
  smoothness:10,
  closed:true,
  points:[
    {x:0,y:.65,z:-70,bank:0,gapAfter:false},
    {x:48,y:.65,z:-48,bank:0,gapAfter:false},
    {x:62,y:.65,z:0,bank:0,gapAfter:false},
    {x:48,y:.65,z:48,bank:0,gapAfter:false},
    {x:0,y:.65,z:70,bank:0,gapAfter:false},
    {x:-48,y:.65,z:48,bank:0,gapAfter:false},
    {x:-62,y:.65,z:0,bank:0,gapAfter:false},
    {x:-48,y:.65,z:-48,bank:0,gapAfter:false},
    {x:0,y:.65,z:-70,bank:0,gapAfter:false}
  ],
  objects:[]
}
function makeSimpleLoop(){
  return {
    version:1,name:'Simple Loop',width:22,smoothness:10,closed:true,
    points:[
      {x:0,y:.65,z:-70,bank:0,gapAfter:false},
      {x:48,y:.65,z:-48,bank:0,gapAfter:false},
      {x:62,y:.65,z:0,bank:0,gapAfter:false},
      {x:48,y:.65,z:48,bank:0,gapAfter:false},
      {x:0,y:.65,z:70,bank:0,gapAfter:false},
      {x:-48,y:.65,z:48,bank:0,gapAfter:false},
      {x:-62,y:.65,z:0,bank:0,gapAfter:false},
      {x:-48,y:.65,z:-48,bank:0,gapAfter:false},
      {x:0,y:.65,z:-70,bank:0,gapAfter:false}
    ],
    objects:[]
  };
}
let selected=-1,tool='draw',draggingPoint=false,drawingRoad=false,panning=false,lastPointer=null,lastDrawPoint=null;
let view={x:-120,y:-120,w:240,h:240};

function catmull(a,b,c,d,t){
  const t2=t*t,t3=t2*t;
  return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
}
function sampleSegment(i,steps){
  const pts=track.points,n=pts.length;
  const p1=pts[i],p2=pts[i+1];
  if(!p1||!p2)return [];
  const p0=pts[Math.max(0,i-1)]||p1;
  const p3=pts[Math.min(n-1,i+2)]||p2;
  const out=[];
  for(let s=0;s<=steps;s++){
    const t=s/steps;
    out.push({
      x:catmull(p0.x,p1.x,p2.x,p3.x,t),
      z:catmull(p0.z,p1.z,p2.z,p3.z,t)
    });
  }
  return out;
}
function segmentPathPoints(i){
  const steps=Number($('curveSmoothness')?.value||10);
  return sampleSegment(i,steps).map(q=>`${q.x},${q.z}`).join(' ');
}
const history=[];
const MAX_HISTORY=60;
function snapshot(){return JSON.stringify(track)}
function pushHistory(){
  history.push(snapshot());
  if(history.length>MAX_HISTORY)history.shift();
  $('undoBtn').disabled=history.length===0;
}
function undo(){
  if(!history.length)return;
  try{
    track=JSON.parse(history.pop());
    track.objects=track.objects||[];
    selected=-1;
    draw();
    fitTrack();
    setStatus('Undone');
  }catch(_){}
  $('undoBtn').disabled=history.length===0;
}

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
function pointsForSegment(i){
  const a=track.points[i],b=track.points[i+1];
  return a&&b?[`${a.x},${a.z}`,`${b.x},${b.z}`]:null;
}
function draw(){
  roadLayer.replaceChildren();pointLayer.replaceChildren();objectLayer.replaceChildren();directionLayer.replaceChildren();
  $('gridBg').style.display=$('showGrid').checked?'':'none';
  const edgeW=track.width+3;
  for(let i=0;i<track.points.length-1;i++){
    const seg=pointsForSegment(i);if(!seg)continue;
    const smoothPoints=segmentPathPoints(i);
    if(track.points[i].gapAfter){
      roadLayer.append(el('polyline',{points:smoothPoints,class:'gap-line'}));
      continue;
    }
    roadLayer.append(el('polyline',{points:smoothPoints,class:'road-edge','stroke-width':edgeW}));
    roadLayer.append(el('polyline',{points:smoothPoints,class:'road','stroke-width':track.width}));
    roadLayer.append(el('polyline',{points:smoothPoints,class:'centre'}));
    if($('showDirection').checked&&i%2===0){
      const a=track.points[i],b=track.points[i+1],mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
      const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;
      directionLayer.append(el('line',{x1:mx-dx/l*3,y1:mz-dz/l*3,x2:mx+dx/l*3,y2:mz+dz/l*3,class:'direction'}));
    }
  }
  track.objects.forEach((o,i)=>{
    const cls='obj '+o.type;
    let n;
    if(o.type==='spinner')n=el('rect',{x:o.x-2.8,y:o.z-.8,width:5.6,height:1.6,rx:.4,class:cls});
    else if(o.type==='bus')n=el('rect',{x:o.x-1.4,y:o.z-4.2,width:2.8,height:8.4,rx:.5,class:cls});
    else n=el('circle',{cx:o.x,cy:o.z,r:o.type==='chicken'?1.2:1.6,class:cls});
    n.dataset.object=i;
    objectLayer.append(n);
  });
  track.points.forEach((p,i)=>{
    const c=el('circle',{cx:p.x,cy:p.z,r:i===selected?2.4:1.9,class:'point'+(i===selected?' selected':'')});
    c.dataset.point=i;pointLayer.append(c);
    if($('showHeights').checked){
      const t=el('text',{x:p.x+3,y:p.z-3,class:'point-label'});
      t.textContent=`${i} · ${Number(p.y).toFixed(1)}m`;pointLayer.append(t);
    }
  });
  if(track.points.length){
    const s=track.points[0];
    pointLayer.append(el('line',{x1:s.x-4,y1:s.z+7,x2:s.x-4,y2:s.z-7,class:'start-pole'}));
    pointLayer.append(el('path',{d:`M ${s.x-4} ${s.z-7} L ${s.x+7} ${s.z-3} L ${s.x-4} ${s.z+1} Z`,class:'start-flag'}));
    const st=el('text',{x:s.x+8,y:s.z-3,class:'start-label'});st.textContent='START';pointLayer.append(st);
  }
  updatePanel();updateJSON();
}
function updatePanel(){
  $('trackName').value=track.name;$('roadWidth').value=track.width;$('widthOut').textContent=track.width+' m';$('smoothOut').textContent=$('curveSmoothness').value;$('closedLoop').checked=track.closed;
  const p=track.points[selected];
  $('noSelection').hidden=!!p;$('pointControls').hidden=!p;
  if(p){
    $('pointX').value=Math.round(p.x*10)/10;$('pointZ').value=Math.round(p.z*10)/10;
    $('pointY').value=p.y;$('heightOut').textContent=Number(p.y).toFixed(2)+' m';
    $('pointBank').value=p.bank||0;$('bankOut').textContent=Math.round(p.bank||0)+'°';
    $('gapAfter').checked=!!p.gapAfter;
  }
  const counts={barrel:0,chicken:0,spinner:0,bus:0};
  track.objects.forEach(o=>counts[o.type]=(counts[o.type]||0)+1);
  $('objectSummary').innerHTML=`🛢 Barrels: ${counts.barrel}<br>🐔 Chickens: ${counts.chicken}<br>⚙ Spinners: ${counts.spinner}<br>🚌 Buses: ${counts.bus}`;
}
function updateJSON(){
  track.smoothness=Number($('curveSmoothness')?.value||10);
  $('jsonPreview').value=JSON.stringify(track,null,2);
}
function setTool(next){
  tool=next;document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  if(tool==='select')setStatus('Select / drag mode');
  else if(tool==='draw')setStatus('DRAW ROAD: click points or drag to sketch');
  else setStatus(tool.toUpperCase()+' tool');
}
document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));

svg.addEventListener('pointerdown',e=>{
  const point=e.target.dataset.point;
  const object=e.target.dataset.object;
  if(object!==undefined){
    pushHistory();
    track.objects.splice(Number(object),1);draw();setStatus('Object removed');return;
  }
  if(point!==undefined){
    selected=Number(point);
    pushHistory();
    draggingPoint=true;svg.setPointerCapture(e.pointerId);draw();return;
  }
  const w=screenToWorld(e);
  if(tool==='draw'){
    pushHistory();
    const p={x:Math.round(w.x*2)/2,y:.65,z:Math.round(w.z*2)/2,bank:0,gapAfter:false};
    // Draw mode always extends the route in travel order.
    track.points.push(p);
    selected=track.points.length-1;
    drawingRoad=true;
    lastDrawPoint={x:p.x,z:p.z};
    svg.setPointerCapture(e.pointerId);
    draw();
    return;
  }
  if(['barrel','chicken','spinner','bus'].includes(tool)){
    pushHistory();
    track.objects.push({type:tool,x:Math.round(w.x),z:Math.round(w.z)});draw();return;
  }
  panning=true;lastPointer={x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId);
});
svg.addEventListener('pointermove',e=>{
  if(drawingRoad&&tool==='draw'){
    const w=screenToWorld(e);
    const x=Math.round(w.x*2)/2,z=Math.round(w.z*2)/2;
    const last=lastDrawPoint||track.points.at(-1);
    if(!last||Math.hypot(x-last.x,z-last.z)>=7){
      track.points.push({x,y:.65,z,bank:0,gapAfter:false});
      selected=track.points.length-1;
      lastDrawPoint={x,z};
      draw();
    }
  }else if(draggingPoint&&selected>=0){
    const w=screenToWorld(e),p=track.points[selected];p.x=Math.round(w.x*2)/2;p.z=Math.round(w.z*2)/2;draw();
  }else if(panning&&lastPointer){
    const scale=view.w/svg.clientWidth;
    view.x-=(e.clientX-lastPointer.x)*scale;view.y-=(e.clientY-lastPointer.y)*scale;
    lastPointer={x:e.clientX,y:e.clientY};syncView();
  }
});
const stopPointer=e=>{draggingPoint=false;drawingRoad=false;panning=false;lastPointer=null;lastDrawPoint=null;if(svg.hasPointerCapture?.(e.pointerId))svg.releasePointerCapture(e.pointerId)};
svg.addEventListener('pointerup',stopPointer);svg.addEventListener('pointercancel',stopPointer);
svg.addEventListener('wheel',e=>{
  e.preventDefault();
  const before=screenToWorld(e),factor=e.deltaY>0?1.12:.88;
  view.w=Math.max(40,Math.min(700,view.w*factor));view.h=view.w*(svg.clientHeight/svg.clientWidth);
  syncView();
  const after=screenToWorld(e);view.x+=before.x-after.x;view.y+=before.z-after.z;syncView();
},{passive:false});

function bind(id,event,fn){$(id).addEventListener(event,fn)}
bind('trackName','input',e=>{track.name=e.target.value;updateJSON()});
bind('roadWidth','input',e=>{track.width=Number(e.target.value);draw()});
bind('curveSmoothness','input',e=>{$('smoothOut').textContent=e.target.value;draw()});
bind('closedLoop','change',e=>{track.closed=e.target.checked;updateJSON()});
bind('showGrid','change',draw);bind('showHeights','change',draw);bind('showDirection','change',draw);
bind('pointX','change',e=>{if(track.points[selected])track.points[selected].x=Number(e.target.value);draw()});
bind('pointZ','change',e=>{if(track.points[selected])track.points[selected].z=Number(e.target.value);draw()});
bind('pointY','input',e=>{if(track.points[selected])track.points[selected].y=Number(e.target.value);draw()});
bind('pointBank','input',e=>{if(track.points[selected])track.points[selected].bank=Number(e.target.value);draw()});
bind('gapAfter','change',e=>{if(track.points[selected])track.points[selected].gapAfter=e.target.checked;draw()});
bind('undoBtn','click',undo);
bind('testBtn','click',e=>{
  if(track.points.length<2){
    e.preventDefault();
    alert('Draw at least two road points first.');
    return;
  }
  try{
    localStorage.setItem('carRacerTrackTest',JSON.stringify(track));
    localStorage.setItem('carRacerTrackDraft',JSON.stringify(track));
    setStatus('Opening test drive in a new tab…');
  }catch(err){
    e.preventDefault();
    console.error(err);
    setStatus('Could not start test drive');
    alert('Could not start the test drive: '+err.message);
  }
});
bind('blankRoadBtn','click',()=>{
  if(track.points.length&& !confirm('Clear this track and start a new blank road?'))return;
  pushHistory();
  track={version:1,name:'New Track',width:Number($('roadWidth').value)||22,closed:true,points:[],objects:[]};
  selected=-1;
  setTool('draw');
  draw();
  fitTrack();
  setStatus('DRAW ROAD: click to place the first point, then keep clicking');
});
bind('deletePointBtn','click',()=>{if(selected>=0&&track.points.length>2){pushHistory();track.points.splice(selected,1);selected=Math.min(selected,track.points.length-1);draw()}});
bind('clearObjectsBtn','click',()=>{if(track.objects.length){pushHistory();track.objects=[];draw()}});
bind('saveBtn','click',()=>{localStorage.setItem('carRacerTrackDraft',JSON.stringify(track));setStatus('Saved in this browser')});
bind('newBtn','click',()=>{if(confirm('Reset to a new simple closed loop?')){pushHistory();track=makeSimpleLoop();selected=-1;draw();fitTrack();setTool('select');setStatus('Simple loop ready — drag the orange points to reshape it')}});
bind('copyBtn','click',async()=>{await navigator.clipboard.writeText(JSON.stringify(track,null,2));setStatus('JSON copied')});
bind('exportBtn','click',()=>{
  const blob=new Blob([JSON.stringify(track,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(track.name||'track').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.json';a.click();URL.revokeObjectURL(a.href);setStatus('JSON exported');
});
bind('importInput','change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{const data=JSON.parse(await file.text());if(!Array.isArray(data.points))throw new Error('No points array');track=data;track.objects=track.objects||[];track.width=track.width||18;track.closed=track.closed!==false;selected=-1;draw();fitTrack();setStatus('Imported '+file.name)}catch(err){alert('Could not import track: '+err.message)}
  e.target.value='';
});
function fitTrack(){
  if(!track.points.length){view={x:-120,y:-120,w:240,h:240};syncView();return}
  const xs=track.points.map(p=>p.x),zs=track.points.map(p=>p.z);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const pad=24,w=Math.max(50,maxX-minX+pad*2),h=Math.max(50,maxZ-minZ+pad*2);
  const aspect=svg.clientWidth/svg.clientHeight;
  if(w/h>aspect){view.w=w;view.h=w/aspect}else{view.h=h;view.w=h*aspect}
  view.x=(minX+maxX)/2-view.w/2;view.y=(minZ+maxZ)/2-view.h/2;syncView();
}
bind('fitBtn','click',fitTrack);
addEventListener('keydown',e=>{
  const editing=['INPUT','TEXTAREA'].includes(document.activeElement.tagName);
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();undo();return;}
  if((e.key==='Delete'||e.key==='Backspace')&&!editing&&selected>=0){e.preventDefault();$('deletePointBtn').click()}
  if(e.key==='Escape')setTool('select');
  if((e.key==='d'||e.key==='D')&&!editing)setTool('draw');
});
const saved=localStorage.getItem('carRacerTrackDraft');
if(saved){try{track=JSON.parse(saved);track.objects=track.objects||[];if(!track.width||track.width<20)track.width=22}catch(_){}}
syncView();draw();requestAnimationFrame(fitTrack);
