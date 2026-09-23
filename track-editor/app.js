const $=id=>document.getElementById(id);
const svg=$('editor'),roadLayer=$('roadLayer'),pointLayer=$('pointLayer'),objectLayer=$('objectLayer'),directionLayer=$('directionLayer');
const NS='http://www.w3.org/2000/svg';

let track={
  version:1,
  name:'Mega Jump Draft',
  width:18,
  closed:true,
  points:[
    {x:0,y:18,z:-95,bank:0,gapAfter:false},
    {x:0,y:18,z:-78,bank:0,gapAfter:false},
    {x:0,y:10,z:-48,bank:0,gapAfter:false},
    {x:0,y:.65,z:-22,bank:0,gapAfter:false},
    {x:0,y:7.5,z:0,bank:0,gapAfter:true},
    {x:0,y:6.4,z:38,bank:0,gapAfter:false},
    {x:0,y:.65,z:70,bank:0,gapAfter:false},
    {x:0,y:.65,z:105,bank:0,gapAfter:false},
    {x:-48,y:.65,z:112,bank:-8,gapAfter:false},
    {x:-82,y:.65,z:78,bank:-8,gapAfter:false},
    {x:-82,y:.65,z:-58,bank:0,gapAfter:false},
    {x:-35,y:.65,z:-72,bank:7,gapAfter:false},
    {x:32,y:.65,z:-58,bank:7,gapAfter:false},
    {x:25,y:8,z:-82,bank:0,gapAfter:false},
    {x:0,y:18,z:-95,bank:0,gapAfter:false}
  ],
  objects:[
    {type:'bus',x:-7,z:15},{type:'bus',x:-3,z:15},{type:'bus',x:1,z:15},{type:'bus',x:5,z:15}
  ]
};
let selected=-1,tool='draw',draggingPoint=false,drawingRoad=false,panning=false,lastPointer=null,lastDrawPoint=null;
let view={x:-120,y:-120,w:240,h:240};
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
  const edgeW=track.width+2.2;
  for(let i=0;i<track.points.length-1;i++){
    const seg=pointsForSegment(i);if(!seg)continue;
    if(track.points[i].gapAfter){
      roadLayer.append(el('polyline',{points:seg.join(' '),class:'gap-line'}));
      continue;
    }
    roadLayer.append(el('polyline',{points:seg.join(' '),class:'road-edge','stroke-width':edgeW}));
    roadLayer.append(el('polyline',{points:seg.join(' '),class:'road','stroke-width':track.width}));
    roadLayer.append(el('polyline',{points:seg.join(' '),class:'centre'}));
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
  updatePanel();updateJSON();
}
function updatePanel(){
  $('trackName').value=track.name;$('roadWidth').value=track.width;$('widthOut').textContent=track.width+' m';$('closedLoop').checked=track.closed;
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
bind('closedLoop','change',e=>{track.closed=e.target.checked;updateJSON()});
bind('showGrid','change',draw);bind('showHeights','change',draw);bind('showDirection','change',draw);
bind('pointX','change',e=>{if(track.points[selected])track.points[selected].x=Number(e.target.value);draw()});
bind('pointZ','change',e=>{if(track.points[selected])track.points[selected].z=Number(e.target.value);draw()});
bind('pointY','input',e=>{if(track.points[selected])track.points[selected].y=Number(e.target.value);draw()});
bind('pointBank','input',e=>{if(track.points[selected])track.points[selected].bank=Number(e.target.value);draw()});
bind('gapAfter','change',e=>{if(track.points[selected])track.points[selected].gapAfter=e.target.checked;draw()});
bind('undoBtn','click',undo);
bind('testBtn','click',()=>{
  if(track.points.length<2){alert('Draw at least two road points first.');return;}
  localStorage.setItem('carRacerTrackTest',JSON.stringify(track));
  setStatus('Opening test drive…');
  window.open('../?designerTest=1','_blank');
});
bind('blankRoadBtn','click',()=>{
  if(track.points.length&& !confirm('Clear this track and start a new blank road?'))return;
  pushHistory();
  track={version:1,name:'New Track',width:Number($('roadWidth').value)||18,closed:true,points:[],objects:[]};
  selected=-1;
  setTool('draw');
  draw();
  fitTrack();
  setStatus('DRAW ROAD: click to place the first point, then keep clicking');
});
bind('deletePointBtn','click',()=>{if(selected>=0&&track.points.length>2){pushHistory();track.points.splice(selected,1);selected=Math.min(selected,track.points.length-1);draw()}});
bind('clearObjectsBtn','click',()=>{if(track.objects.length){pushHistory();track.objects=[];draw()}});
bind('saveBtn','click',()=>{localStorage.setItem('carRacerTrackDraft',JSON.stringify(track));setStatus('Saved in this browser')});
bind('newBtn','click',()=>{if(confirm('Start a new blank track?')){pushHistory();track={version:1,name:'New Track',width:18,closed:true,points:[],objects:[]};selected=-1;draw();fitTrack();setTool('draw')}});
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
if(saved){try{track=JSON.parse(saved);track.objects=track.objects||[]}catch(_){}}
syncView();draw();requestAnimationFrame(fitTrack);
