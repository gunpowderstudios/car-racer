const $=id=>document.getElementById(id);
const svg=$('editor'),roadLayer=$('roadLayer'),handleLayer=$('handleLayer'),markerLayer=$('markerLayer');
const NS='http://www.w3.org/2000/svg';

const templates={
  oval:[
    {x:0,z:-62},{x:48,z:-45},{x:62,z:0},{x:48,z:45},
    {x:0,z:62},{x:-48,z:45},{x:-62,z:0},{x:-48,z:-45}
  ],
  kidney:[
    {x:-10,z:-64},{x:44,z:-54},{x:68,z:-10},{x:42,z:30},
    {x:10,z:58},{x:-42,z:54},{x:-66,z:12},{x:-38,z:-24}
  ],
  technical:[
    {x:-40,z:-66},{x:22,z:-64},{x:58,z:-36},{x:34,z:-4},
    {x:66,z:34},{x:18,z:62},{x:-18,z:34},{x:-64,z:50},
    {x:-68,z:2},{x:-34,z:-20}
  ],
  long:[
    {x:-70,z:-42},{x:10,z:-62},{x:76,z:-44},{x:82,z:10},
    {x:58,z:54},{x:-12,z:66},{x:-78,z:44},{x:-82,z:-8}
  ]
};
function makeTrack(key='oval'){
  return {
    version:4,name:key==='oval'?'My Track':key[0].toUpperCase()+key.slice(1)+' Track',
    width:22,smoothness:12,closed:true,
    handles:templates[key].map(p=>({x:p.x,y:.65,z:p.z,bank:0,gapAfter:false})),
    points:[],objects:[]
  };
}
let track=makeTrack('oval'),templateKey='oval',selected=-1,dragging=false,panning=false,lastPointer=null;
let view={x:-120,y:-100,w:240,h:200};
const history=[],MAX_HISTORY=80;

function el(name,attrs={}){const n=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n}
function setStatus(t){$('status').textContent=t}
function syncView(){svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`)}
function screenToWorld(e){const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(svg.getScreenCTM().inverse());return{x:p.x,z:p.y}}
function snap(n,step=.5){return Math.round(n/step)*step}
function pushHistory(){history.push(JSON.stringify(track));if(history.length>MAX_HISTORY)history.shift();$('undoBtn').disabled=!history.length}
function undo(){if(!history.length)return;track=JSON.parse(history.pop());selected=-1;draw();fitTrack();$('undoBtn').disabled=!history.length;setStatus('Undone')}

function catmull(a,b,c,d,t){
  const t2=t*t,t3=t2*t;
  return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
}
function rebuildPoints(){
  const h=track.handles,n=h.length,steps=Math.max(6,Number(track.smoothness)||12),pts=[];
  if(n<3){track.points=[];return}
  for(let i=0;i<n;i++){
    const p0=h[(i-1+n)%n],p1=h[i],p2=h[(i+1)%n],p3=h[(i+2)%n];
    for(let s=0;s<steps;s++){
      const t=s/steps;
      pts.push({
        x:catmull(p0.x,p1.x,p2.x,p3.x,t),
        y:catmull(p0.y,p1.y,p2.y,p3.y,t),
        z:catmull(p0.z,p1.z,p2.z,p3.z,t),
        bank:catmull(p0.bank||0,p1.bank||0,p2.bank||0,p3.bank||0,t),
        gapAfter:false
      });
    }
  }
  pts.push({...pts[0]});
  // Translate any selected handle's jump marker into a small gap on the generated path.
  for(let i=0;i<n;i++){
    if(!h[i].gapAfter)continue;
    const idx=i*steps+Math.floor(steps*.55);
    if(pts[idx])pts[idx].gapAfter=true;
  }
  track.points=pts;
}
function drawRoad(){
  const pts=track.points,edge=track.width+3;
  let run=[];
  const flush=()=>{
    if(run.length<2){run=[];return}
    const str=run.map(p=>`${p.x},${p.z}`).join(' ');
    roadLayer.append(el('polyline',{points:str,class:'road-edge','stroke-width':edge}));
    roadLayer.append(el('polyline',{points:str,class:'road','stroke-width':track.width}));
    roadLayer.append(el('polyline',{points:str,class:'centre'}));
    run=[];
  };
  for(let i=0;i<pts.length;i++){
    run.push(pts[i]);
    if(pts[i].gapAfter){flush(); if(i+1<pts.length){run=[pts[i+1]];i++;}}
  }
  flush();
}
function draw(){
  rebuildPoints();
  roadLayer.replaceChildren();handleLayer.replaceChildren();markerLayer.replaceChildren();
  drawRoad();

  if($('showHandles').checked){
    track.handles.forEach((p,i)=>{
      const c=el('circle',{cx:p.x,cy:p.z,r:i===selected?3.7:3.2,class:'handle'+(i===selected?' selected':'')});
      c.dataset.handle=i;handleLayer.append(c);
      const t=el('text',{x:p.x+4.5,y:p.z-4,class:'handle-index'});t.textContent=String(i+1);handleLayer.append(t);
    });
  }

  const s=track.handles[0];
  markerLayer.append(el('line',{x1:s.x-5,y1:s.z+8,x2:s.x-5,y2:s.z-8,class:'start-pole'}));
  markerLayer.append(el('path',{d:`M ${s.x-5} ${s.z-8} L ${s.x+8} ${s.z-4} L ${s.x-5} ${s.z} Z`,class:'start-flag'}));
  const label=el('text',{x:s.x+9,y:s.z-4,class:'start-label'});label.textContent='START';markerLayer.append(label);

  updateUI();
}
function updateUI(){
  $('roadWidth').value=track.width;$('widthOut').textContent=track.width+' m';
  $('smoothness').value=track.smoothness;$('smoothOut').textContent=track.smoothness;
  $('trackName').value=track.name;
  document.querySelectorAll('.template').forEach(b=>b.classList.toggle('active',b.dataset.template===templateKey));
  if(selected>=0&&track.handles[selected]){
    const p=track.handles[selected];
    $('selectedInfo').innerHTML=`<b>HANDLE ${selected+1}</b><br>Drag it to reshape this part of the circuit.`;
    $('handleInfo').innerHTML=`X ${p.x.toFixed(1)} · Z ${p.z.toFixed(1)}<br>Height ${p.y.toFixed(2)} m${p.gapAfter?'<br><b>JUMP GAP</b>':''}`;
  }else{
    $('selectedInfo').textContent='Drag any blue handle to reshape the circuit.';
    $('handleInfo').textContent='None selected';
  }
  $('deleteHandleBtn').disabled=track.handles.length<=5||selected<0;
  rebuildPoints();$('jsonPreview').value=JSON.stringify(track,null,2);
}

function useTemplate(key){
  pushHistory();templateKey=key;const name=track.name,width=track.width,smoothness=track.smoothness;
  track=makeTrack(key);track.name=name;track.width=width;track.smoothness=smoothness;selected=-1;draw();fitTrack();setStatus(key.toUpperCase()+' template loaded');
}
document.querySelectorAll('.template').forEach(b=>b.addEventListener('click',()=>useTemplate(b.dataset.template)));

svg.addEventListener('pointerdown',e=>{
  const i=e.target.dataset.handle;
  if(i!==undefined){
    selected=Number(i);pushHistory();dragging=true;svg.setPointerCapture(e.pointerId);draw();return;
  }
  panning=true;lastPointer={x:e.clientX,y:e.clientY};svg.setPointerCapture(e.pointerId);
});
svg.addEventListener('pointermove',e=>{
  if(dragging&&selected>=0){
    const w=screenToWorld(e),p=track.handles[selected];p.x=snap(w.x);p.z=snap(w.z);draw();
  }else if(panning&&lastPointer){
    const scale=view.w/svg.clientWidth;view.x-=(e.clientX-lastPointer.x)*scale;view.y-=(e.clientY-lastPointer.y)*scale;lastPointer={x:e.clientX,y:e.clientY};syncView();
  }
});
const stop=e=>{dragging=false;panning=false;lastPointer=null;if(svg.hasPointerCapture?.(e.pointerId))svg.releasePointerCapture(e.pointerId)};
svg.addEventListener('pointerup',stop);svg.addEventListener('pointercancel',stop);
svg.addEventListener('wheel',e=>{
  e.preventDefault();const before=screenToWorld(e),factor=e.deltaY>0?1.12:.88;
  view.w=Math.max(60,Math.min(700,view.w*factor));view.h=view.w*(svg.clientHeight/svg.clientWidth);syncView();
  const after=screenToWorld(e);view.x+=before.x-after.x;view.y+=before.z-after.z;syncView();
},{passive:false});

$('roadWidth').addEventListener('input',e=>{track.width=Number(e.target.value);draw()});
$('smoothness').addEventListener('input',e=>{track.smoothness=Number(e.target.value);draw()});
$('trackName').addEventListener('input',e=>{track.name=e.target.value;updateUI()});
$('showHandles').addEventListener('change',draw);

function selectedHandle(){return selected>=0?track.handles[selected]:null}
$('hillBtn').addEventListener('click',()=>{const p=selectedHandle();if(!p)return;pushHistory();p.y=Math.min(18,p.y+3);draw();setStatus('Hill raised')});
$('lowerBtn').addEventListener('click',()=>{const p=selectedHandle();if(!p)return;pushHistory();p.y=Math.max(.65,p.y-3);draw();setStatus('Section lowered')});
$('flatBtn').addEventListener('click',()=>{const p=selectedHandle();if(!p)return;pushHistory();p.y=.65;p.gapAfter=false;draw();setStatus('Section flattened')});
$('jumpBtn').addEventListener('click',()=>{const p=selectedHandle();if(!p)return;pushHistory();p.gapAfter=!p.gapAfter;if(p.gapAfter)p.y=Math.max(p.y,5.5);draw();setStatus(p.gapAfter?'Jump gap added':'Jump gap removed')});

$('deleteHandleBtn').addEventListener('click',()=>{if(selected<0||track.handles.length<=5)return;pushHistory();track.handles.splice(selected,1);selected=-1;draw();setStatus('Handle deleted')});
$('addHandleBtn').addEventListener('click',()=>{
  if(selected<0)selected=track.handles.length-1;
  pushHistory();const a=track.handles[selected],b=track.handles[(selected+1)%track.handles.length];
  const n={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2,bank:0,gapAfter:false};
  track.handles.splice(selected+1,0,n);selected++;draw();setStatus('Handle added');
});
$('undoBtn').addEventListener('click',undo);
$('resetBtn').addEventListener('click',()=>{if(confirm('Reset this template to its original shape?'))useTemplate(templateKey)});
$('saveBtn').addEventListener('click',()=>{rebuildPoints();localStorage.setItem('carRacerTrackDraft',JSON.stringify(track));setStatus('Saved')});
$('testBtn').addEventListener('click',e=>{try{rebuildPoints();localStorage.setItem('carRacerTrackTest',JSON.stringify(track));localStorage.setItem('carRacerTrackDraft',JSON.stringify(track));setStatus('Opening test drive in a new tab…')}catch(err){e.preventDefault();alert(err.message)}});
$('fitBtn').addEventListener('click',fitTrack);

function fitTrack(){
  const pts=track.handles,xs=pts.map(p=>p.x),zs=pts.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const pad=35,w=Math.max(80,maxX-minX+pad*2),h=Math.max(80,maxZ-minZ+pad*2),aspect=svg.clientWidth/svg.clientHeight||1.4;
  if(w/h>aspect){view.w=w;view.h=w/aspect}else{view.h=h;view.w=h*aspect}
  view.x=(minX+maxX)/2-view.w/2;view.y=(minZ+maxZ)/2-view.h/2;syncView();
}

addEventListener('keydown',e=>{const editing=['INPUT','TEXTAREA'].includes(document.activeElement.tagName);if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();undo()}});

const saved=localStorage.getItem('carRacerTrackDraft');
if(saved){try{const s=JSON.parse(saved);if(Array.isArray(s.handles)&&s.handles.length>=5){track=s;templateKey='custom'}}catch(_){}}
draw();requestAnimationFrame(fitTrack);