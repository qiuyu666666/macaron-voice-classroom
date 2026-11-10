// Embedded in the isolated course frame. Snapshot the visible DOM and the ink together.
function installLessonInk({root,marks,channel,currentPage,send}) {
  const ns='http://www.w3.org/2000/svg';
  const layer=document.createElementNS(ns,'svg');
  layer.id='learner-ink';
  layer.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;touch-action:none;z-index:25';
  const surface=document.createElement('div');
  surface.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:26';
  document.body.append(surface);surface.append(layer);
  const bar=document.createElement('div');
  bar.style.cssText='position:fixed;bottom:0;left:0;right:0;height:34px;background:#fffdf7;display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:0 8px;z-index:30';
  bar.dataset.inkToolbar='true';
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='font:14px system-ui;padding:4px 9px;color:#383431;background:#f2efe6;border:0;border-radius:14px';b.onclick=fn;bar.append(b);return b};
  let enabled=false,stroke=null,page=currentPage(),pending=false;
  const drawings=new Map();
  function redraw(){
    page=currentPage();layer.replaceChildren();
    for(const points of drawings.get(page)||[]){
      const line=document.createElementNS(ns,'polyline');
      line.setAttribute('points',points.map(([x,y])=>[x*root.clientWidth,y*root.clientHeight].join(',')).join(' '));
      for(const [key,value] of Object.entries({fill:'none',stroke:'#ec9a22','stroke-opacity':'.55','stroke-width':'10','stroke-linecap':'round','stroke-linejoin':'round'}))line.setAttribute(key,value);
      layer.append(line);
    }
  }
  const pen=button('画笔',()=>{enabled=!enabled;layer.style.pointerEvents=enabled?'auto':'none';pen.setAttribute('aria-pressed',String(enabled));pen.style.background=enabled?'#ffdf96':'#f2efe6';undo.hidden=share.hidden=!enabled});
  const undo=button('撤销',()=>{drawings.get(currentPage())?.pop();redraw()});
  const share=button('发送标注',async()=>{
    if(pending||!drawings.get(currentPage())?.length)return;
    pending=true;share.disabled=true;share.textContent='正在截图';
    try{
      const pageAtClick=currentPage();
      const version=inkVersion;const image=await capture();
      if(pageAtClick!==currentPage()||version!==inkVersion)throw Error('页面已切换');
      share.textContent='发送中';
      send({event:'learner_snapshot',page:pageAtClick,image});
    }catch{finish('截图失败，重试')}
  });
  function finish(label){pending=false;share.disabled=false;share.textContent=label}
  window.addEventListener('message',e=>{if(e.source===parent&&e.data?.channel===channel&&e.data.source==='snapshot-result')finish(e.data.ok?'已发送 · 再发':'发送失败，重试')});
  undo.hidden=share.hidden=true;document.body.append(bar);
  const point=e=>[e.clientX/Math.max(1,root.clientWidth),e.clientY/Math.max(1,root.clientHeight)];
  layer.onpointerdown=e=>{if(!enabled||!e.isPrimary)return;e.preventDefault();layer.setPointerCapture(e.pointerId);const p=currentPage();if(!drawings.has(p))drawings.set(p,[]);stroke=[point(e),point(e)];drawings.get(p).push(stroke);share.textContent='发送标注';redraw()};
  layer.onpointermove=e=>{if(stroke&&e.isPrimary){stroke.push(point(e));redraw()}};
  layer.onpointerup=layer.onpointercancel=()=>{stroke=null};
  const fit=()=>{surface.style.height=root.clientHeight+'px';redraw()};
  new ResizeObserver(fit).observe(root);fit();
  let inkVersion=0;
  function wipe(){inkVersion++;stroke=null;drawings.clear();redraw()}
  new MutationObserver(wipe).observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class','style','aria-pressed']});
  window.addEventListener('message',e=>{if(e.source===parent&&e.data?.channel===channel&&e.data.source==='clear-page-ink')wipe()});
  window.addEventListener('resize',wipe);
  async function capture(){
    const w=innerWidth,h=root.clientHeight;
    const wrap=document.createElement('div');
    wrap.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
    wrap.style.cssText='position:relative;overflow:hidden;background:#fffdf7;width:'+w+'px;height:'+h+'px';
    function clone(node){
      if(node.nodeType===3)return document.createTextNode(node.textContent);
      if(node.nodeType!==1||['script','style','iframe','object','foreignObject'].includes(node.localName))return null;
      const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden')return null;
      const el=node.cloneNode(false);
      for(const attr of Array.from(el.attributes))if(/^on|^src|href/i.test(attr.name))el.removeAttribute(attr.name);
      for(const key of style){const v=style.getPropertyValue(key);if(!v.includes('url('))el.style.setProperty(key,v)}
      if(node.localName==='img'&&node.src.startsWith('data:image/'))el.src=node.src;
      for(const child of node.childNodes){const copy=clone(child);if(copy)el.append(copy)}
      return el;
    }
    for(const source of [root,layer]){const copy=clone(source);if(!copy)continue;copy.style.position='absolute';copy.style.top=copy.style.left='0';copy.style.bottom='auto';copy.style.width=w+'px';copy.style.height=h+'px';wrap.append(copy)}
    const svg='<svg xmlns="'+ns+'" width="'+w+'" height="'+h+'"><foreignObject width="100%" height="100%">'+new XMLSerializer().serializeToString(wrap)+'</foreignObject></svg>';
    const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();
    const points=(drawings.get(currentPage())||[]).flat();
    if(!points.length)throw Error('没有笔迹');
    const pad=32;
    const box=points.reduce((b,[x,y])=>[Math.min(b[0],x*w),Math.min(b[1],y*h),Math.max(b[2],x*w),Math.max(b[3],y*h)],[w,h,0,0]);
    const left=Math.max(0,Math.floor(box[0]-pad)),top=Math.max(0,Math.floor(box[1]-pad));
    const width=Math.min(w,Math.ceil(box[2]+pad))-left,height=Math.min(h,Math.ceil(box[3]+pad))-top;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').drawImage(img,left,top,width,height,0,0,width,height);
    return canvas.toDataURL('image/jpeg',.84);
  }
}
