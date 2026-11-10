import{courseBridgeSource}from'./course-bridge-source.mjs';
import {readFile} from 'node:fs/promises';
export function validOutline(o){return !!o&&typeof o==='object'&&typeof o.title==='string'&&o.title.trim()&&o.title.length<=120&&Array.isArray(o.points)&&o.points.length>=1&&o.points.length<=5&&o.points.every(p=>p&&typeof p.title==='string'&&p.title.trim()&&p.title.length<=100&&typeof p.explanation==='string'&&p.explanation.trim()&&p.explanation.length<=600&&(!p.items||(Array.isArray(p.items)&&p.items.length<=40&&p.items.every(t=>typeof t==='string'&&t.trim()&&t.length<=120))))&&['example','check'].every(k=>typeof o[k]==='string'&&o[k].trim()&&o[k].length<=1000)}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const highlight=text=>escape(text).replace(/\*\*([^*]+)\*\*/g,'<mark>$1</mark>');
function pointBody(point,index){
  const items=point.items||[];
  const symbols=items.length>=6 && items.every(item=>Array.from(item.trim()).length<=3);
  const tag=symbols?'div':'p';
  const rows=items.map((text,n)=>`<${tag} data-element-id="point-${index}-item-${n+1}">${highlight(text)}</${tag}>`).join('');
  const explanation=symbols&&items.length>=20?'':`<p data-element-id="point-${index}">${highlight(point.explanation)}</p>`;
  return (rows?`<div class="${symbols?'alphabet-grid':'reading-lines'}">${rows}</div>`:'')+explanation;
}
export async function outlineHTML(o){if(!validOutline(o))throw Error('轻量教案格式无效');const bridge=await courseBridgeSource();const card=(title,body,index)=>`<section data-lesson-page="${index}" data-page-title="${escape(title)}"><h1 data-element-id="page-title-${index}">${escape(title)}</h1>${body}</section>`;const pages=o.points.map((p,i)=>card(p.title,pointBody(p,i+1),i+1));return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;padding:18px 20px 76px;background:#fffdf7;color:#2a2a29;font:16px/1.5 system-ui}mark{background:#fff0b6;color:inherit;border-radius:3px}h1{font-size:22px;margin:0 0 16px}p{font-size:16px;line-height:1.5}li{padding:9px 0}.reading-lines{display:flex;flex-direction:column;gap:12px}.reading-lines p{margin:0;font-size:22px;line-height:1.4;overflow-wrap:anywhere}.alphabet-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.alphabet-grid>div{background:#f4f2ed;border-radius:10px;text-align:center;font-size:22px;line-height:1.2;padding:7px 2px}.example{padding:18px;background:#f4f2ed;border-radius:16px}#marks{position:fixed;inset:0;pointer-events:none;z-index:9999}[hidden]{display:none!important}</style><main id="root">${pages.join('')}</main><svg id="marks" width="100%" height="100%"></svg><script>${bridge.replaceAll('</script','<\\/script')}</script>`}
