import {initLocationUI} from './location.js';
import { displayedSatellites, assessGeometry, geometryLevel } from './visibility.js';
const $=id=>document.getElementById(id);
const colors={G:'#7caeff',J:'#74e7c2',E:'#c7a4ff',R:'#ffc37b',C:'#ff91ad'};
const names={G:'GPS',J:'QZSS',E:'Galileo',R:'GLONASS',C:'BeiDou'};
const state={observer:{lat:35.681236,lon:139.767125,height:0},heightAssumed:true,live:true,time:Date.now(),mask:15,systems:Object.keys(names),plan:null,series:null,selected:null,watch:null,request:0,candidatesOnly:true,locationSource:"初期地点：東京駅付近（現在地は未取得）"};
const format=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const shortFormat=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decimal=x=>x==null?'—':x.toFixed(2);
const jstInput=t=>new Date(t+9*3600000).toISOString().slice(0,16);
function message(text,error=false){$('message').textContent=text;$('message').hidden=!text;$('message').classList.toggle('error',error);}
function query(){return new URLSearchParams({...state.observer,mask:state.mask,systems:state.systems.join(','),time:new Date(state.time).toISOString()});}
function syncTime(){if(state.live)state.time=Date.now();$('datetime').value=jstInput(state.time);$('datetime').min=jstInput(Date.now()-86400000);$('datetime').max=jstInput(Date.now()+86400000);$('timeRange').value=Math.round((state.time-Date.now())/60000);$('live').classList.toggle('selected',state.live);$('fixed').classList.toggle('selected',!state.live);$('modeBadge').textContent=state.live?'現在時刻':'日時指定';$('live').setAttribute('aria-pressed',String(state.live));$('fixed').setAttribute('aria-pressed',String(!state.live));}
async function api(path){const response=await fetch(path);const data=await response.json();if(!response.ok)throw new Error(data.error||'データを取得できません。');return data;}
function svgLabelSize(){return Math.max(12,13*620/Math.max(260,$('sky').clientWidth));}
function grid(){
 let html='<defs><radialGradient id="skyGlow"><stop stop-color="#1c344e"/><stop offset="1" stop-color="#101d30"/></radialGradient></defs><circle cx="310" cy="286" r="235" fill="url(#skyGlow)"/>';
 for(const el of [0,15,30,60]){let r=235*(90-el)/90;html+=`<circle cx="310" cy="286" r="${r}" fill="none" stroke="#395169" stroke-width="${el===0?1.5:1}" ${el===15?'stroke-dasharray="3 7"':''}/>`;if(el!==15)html+=`<text x="318" y="${286-r+17}" fill="#90a7bc" font-size="12">${el}°</text>`;}
 for(let az=0;az<360;az+=30){const a=az*Math.PI/180;html+=`<line x1="310" y1="286" x2="${310+235*Math.sin(a)}" y2="${286-235*Math.cos(a)}" stroke="#2b425a" ${az%90?'stroke-dasharray="3 6"':''}/>`;}
 const maskRadius=235*(90-state.mask)/90;
 html+=`<circle cx="310" cy="286" r="${maskRadius}" fill="none" stroke="#72cbb6" opacity=".55" stroke-dasharray="5 5"/><circle cx="310" cy="286" r="3" fill="#9cb6cd"/><text x="319" y="290" font-size="12" fill="#829bb2">90°</text>`;
 for(const [text,x,y] of [['N / 北',310,27],['E / 東',586,291],['S / 南',310,558],['W / 西',34,291]])html+=`<text x="${x}" y="${y}" text-anchor="middle" fill="${text.startsWith('N')?'#8af1d3':'#b7c8d8'}" font-size="15" font-weight="600">${text}</text>`;
 return html.replaceAll('font-size="12"',`font-size="${svgLabelSize()}"`).replaceAll('font-size="15"',`font-size="${Math.max(15,svgLabelSize())}"`);
}
function renderSky(){
 renderAssessment();
 $('listTitle').textContent=state.candidatesOnly?'評価に使う衛星の一覧':'空にある衛星の一覧';
 $('filterStatus').textContent=state.candidatesOnly?'今の条件で評価に使う衛星を表示しています':'低い空も含めて表示しています。評価の対象は変わりません';
 if(state.plan)$('visibleCount').textContent=state.plan.visible-displayedSatellites(state.plan,state.candidatesOnly).length;
 const satellites=(displayedSatellites(state.plan,state.candidatesOnly)).map(s=>{const a=s.azimuth*Math.PI/180,r=235*(90-s.elevation)/90;return {...s,x:310+r*Math.sin(a),y:286-r*Math.cos(a)};});
 const fontSize=svgLabelSize(),hitRadius=Math.max(12,16*620/Math.max(260,$('sky').clientWidth));
 const boxes=satellites.map(s=>({x:s.x-8,y:s.y-8,w:16,h:16}));
 const overlaps=(a,b)=>a.x<b.x+b.w+3&&a.x+a.w+3>b.x&&a.y<b.y+b.h+3&&a.y+a.h+3>b.y;
 let html=grid();
 for(const s of satellites.sort((a,b)=>(b.norad===state.selected)-(a.norad===state.selected)||Number(b.used)-Number(a.used))){
  const width=s.label.length*fontSize*.61;let label=null;
  for(const [dx,dy] of [[10,-9],[10,17],[-width-10,-9],[-width-10,17],[10,-25],[-width-10,32]]){
   const box={x:s.x+dx,y:s.y+dy-fontSize,w:width,h:fontSize+2};
   if(box.x>58&&box.x+width<570&&box.y>42&&box.y<525&&!boxes.some(b=>overlaps(box,b))){label={...box,baseline:s.y+dy};boxes.push(box);break;}
  }
  html+=`<g class="satellite" tabindex="0" role="button" data-id="${esc(s.norad)}" aria-label="${esc(s.name)} 方位${s.azimuth.toFixed(1)}度 仰角${s.elevation.toFixed(1)}度" opacity="${s.used?1:.45}"><title>${esc(s.name)}\n方向 ${s.azimuth.toFixed(1)}° / 空を見上げる角度 ${s.elevation.toFixed(1)}°</title><circle class="hit-area" cx="${s.x}" cy="${s.y}" r="${hitRadius}" fill="transparent"/><circle cx="${s.x}" cy="${s.y}" r="${state.selected===s.norad?9:6}" fill="${colors[s.system]}" stroke="${state.selected===s.norad?'#fff':'#101d30'}" stroke-width="2"/>${label?`<text x="${label.x}" y="${label.baseline}" font-size="${fontSize}" fill="${colors[s.system]}">${esc(s.label)}</text>`:''}</g>`;
 }
 $('sky').innerHTML=html;
}
function renderAssessment(){
 const p=state.plan,a=assessGeometry(p),root=$('geometryAssessment');
 if(!a){root.innerHTML='<h2>衛星の並び方はどう？</h2><p>まだ判断できません。衛星データの読み込みを待っています。</p>';return;}
 const titles={low:'○ 有利 — 位置を測りやすい並び方',medium:'△ 注意 — 別の時間とも比べたい配置',high:'！ 不利 — 位置のずれが大きくなりやすい配置',unknown:'？ この条件では判断できません'};
 const explanations={low:'選んだ衛星の方向と高さから計算すると、並び方による位置のずれは小さく抑えやすい状態です。',medium:'衛星の並び方によって、位置のずれが大きくなる可能性があります。別の時間とも比べてみましょう。',high:'衛星の並び方が測位に不利です。時間を変えて、配置が改善するか比べてみましょう。',unknown:'衛星が足りない、または方向・高さが偏っているため、評価に必要な計算ができません。選んだ衛星の種類や空の角度を確認してください。'};
 const expanded=root.querySelector('details')?.open;
 const focused=root.contains(document.activeElement)&&document.activeElement?.tagName==='SUMMARY';
 const notes=[];
 if(a.count&&a.gap>=180)notes.push('衛星が空の片側に偏っています。下の「空のどこに衛星がいる？」で方向を確認しましょう。');
 if(a.count&&a.bands[0]>a.count/2)notes.push('半数より多くの衛星が低い空にあります。「30°以上で比較」で、低い空が見えない場合の変化を確認できます。');
 if(a.count&&a.margin<=1)notes.push('計算に必要な衛星数に余裕がありません。数機が使えなくなると、位置を計算しにくくなる可能性があります。');
 if(p.stale||p.failed||p.meta.warning||p.satellites.some(s=>s.ageHours>48))notes.push('古いデータや計算できないデータがあります。一部の衛星を除いた参考評価です。');
 const directions=a.sectors.filter(n=>n>0).length;
 root.innerHTML=`<div class="assessment-heading"><h1>衛星の配置</h1><span class="prediction-label">${state.locationSource.startsWith('初期地点')?'初期地点のプレビュー':'選択地点の予測'}</span></div>
 <div class="result-row"><div class="verdict ${a.level}"><span class="status-dot"></span><strong>${({low:'良好',medium:'注意',high:'不利',unknown:'評価できません'})[a.level]}</strong><span>${shortFormat.format(new Date(p.time))}</span></div><div class="result-count"><b>${a.count}</b> 衛星候補</div></div>
 <p class="result-note">${({low:'方向と高さの広がりがあり、測位に有利な配置です。',medium:'配置に偏りがあります。別の時間と比べてください。',high:'配置が不利です。別の時間と比べてください。',unknown:'衛星数や配置の条件が足りません。'})[a.level]}</p>
 <p class="assessment-limit">建物・電波・補正情報は未反映。RTK FIXの判定ではありません。</p>
 <details><summary>評価の内訳</summary><p>${explanations[a.level]}</p><p>空の広がり：${directions} / 8方向。高い空 ${a.bands[2]}機・斜め上 ${a.bands[1]}機・低い空 ${a.bands[0]}機。</p>${notes.length?'<ul>'+notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>':''}<p>PDOP ${decimal(p.dop.pdop)} ／ HDOP ${decimal(p.dop.hdop)} ／ VDOP ${decimal(p.dop.vdop)}</p><p>PDOPは小さいほど有利。2未満：良好、2〜5未満：注意、5以上：不利。本アプリの参考区分です。</p></details>`;
 root.querySelector('details').open=Boolean(expanded);
 if(focused)root.querySelector('summary').focus({preventScroll:true});
}

function select(id){state.selected=id;const s=displayedSatellites(state.plan,state.candidatesOnly).find(s=>s.norad===id);if(!s){$('selection').textContent='この衛星は現在の表示条件に含まれていません。';return;} $('selection').innerHTML=`<strong style="color:${colors[s.system]}">${esc(s.name)}</strong> · NORAD ${esc(s.norad)}<br>方向 ${s.azimuth.toFixed(1)}° / 空を見上げる角度 ${s.elevation.toFixed(1)}° / ${s.used?'評価に使用':'設定した角度より低い'}<br>軌道基準 ${shortFormat.format(new Date(s.epoch))} JST · 運用状態未確認`;renderSky();}
function render(){const p=state.plan;$('displayTime').textContent=format.format(new Date(p.time));$('timeDescription').textContent=state.live?'JST · 5秒ごとに配置を更新':Date.parse(p.time)>Date.now()?'JST · 未来の配置予測':'JST · 過去の配置推定';for(const k of ['pdop','hdop','vdop'])$(k).textContent=decimal(p.dop[k]);$('dopReason').textContent=p.dop.reason||'小さいほど、衛星の並び方による位置のずれが小さい目安です。';$('usedCount').textContent=p.used;$('visibleCount').textContent=p.visible;$('systemCounts').innerHTML=Object.keys(names).map(k=>`<div class="count-row"><span><i class="dot ${k.toLowerCase()}"></i>${names[k]}</span><span>${p.satellites.filter(s=>s.system===k&&s.used).length} / ${p.satellites.filter(s=>s.system===k&&s.visible).length}</span></div>`).join('');const visible=displayedSatellites(p,state.candidatesOnly);$('tableCount').textContent=`${visible.length}機 / 頭上に近い順`;$('satTable').innerHTML=visible.length?visible.map(s=>`<tr data-id="${esc(s.norad)}"><td><button class="sat-select" data-id="${esc(s.norad)}" title="${esc(s.name)}">${esc(s.label)}</button></td><td><span class="cell-system"><i class="dot ${s.system.toLowerCase()}"></i>${names[s.system]}</span></td><td>${s.azimuth.toFixed(1)}°</td><td>${s.elevation.toFixed(1)}°</td><td class="${s.used?'cell-used':'cell-excluded'}">${s.used?'使用':'設定した角度より低い'}</td><td>${shortFormat.format(new Date(s.epoch))}${s.ageHours>48?' · 古い':''}</td></tr>`).join(''):'<tr><td colspan="6">この条件で表示する衛星はありません。システム選択・最低仰角・データ状態を確認してください。</td></tr>';$('dataInfo').textContent=`取得 ${format.format(new Date(p.meta.fetchedAt))} JST。収録 ${Object.entries(p.meta.counts).map(([k,v])=>`${names[k]} ${v}機`).join(' / ')}。`;$('dataWarning').textContent=[p.meta.warning,p.stale?`基準時刻から3日超：${p.stale}機を除外。`:'',p.failed?`軌道計算失敗：${p.failed}機を除外。`:''].filter(Boolean).join(' ');const old=p.satellites.filter(s=>s.ageHours>48).length;message(p.meta.warning || (p.stale||p.failed||old?`${p.stale}機はデータが古いため、${p.failed}機は計算できないため対象外です。${old}機は位置予測の元データが2日以上前のものです。`:''));renderSky();if(state.selected)select(state.selected);}
let activeController;
async function loadPlan(){$('locationOrigin').textContent=state.locationSource;updateLocationUI(state.observer,!state.locationSource.startsWith('初期地点'));$('locationPreview').hidden=!state.locationSource.startsWith('初期地点');syncTime();const request=++state.request;activeController?.abort();activeController=new AbortController();$('skyWrap').setAttribute('aria-busy','true');try{const response=await fetch(`/api/plan?${query()}`,{signal:activeController.signal});const p=await response.json();if(!response.ok)throw new Error(p.error);if(request!==state.request)return;state.plan=p;render();renderChart();return p;}catch(e){if(e.name==='AbortError')return;state.plan=null;renderSky();renderChart();for(const id of ['pdop','hdop','vdop','usedCount','visibleCount'])$(id).textContent='—';$('systemCounts').textContent='';$('dopReason').textContent='データ取得後に計算します。';$('satTable').innerHTML='<tr><td colspan="6">データを取得できません。</td></tr>';$('tableCount').textContent='—';$('selection').textContent='データを取得できません。';message(e.message,true);$('timeDescription').textContent='更新失敗 · 再取得を待っています';}finally{if(request===state.request)$('skyWrap').setAttribute('aria-busy','false');}}
let geoGeneration=0;
function stopFollow(){geoGeneration++;$('locate').disabled=false;if(state.watch!=null)navigator.geolocation.clearWatch(state.watch);state.watch=null;$('follow').checked=false;}
function applyPosition(position){state.locationSource="端末から取得した現在地（精度 ±"+Math.round(position.coords.accuracy)+" m）";state.observer={lat:position.coords.latitude,lon:position.coords.longitude,height:position.coords.altitude??0};state.heightAssumed=position.coords.altitude==null;$('lat').value=state.observer.lat.toFixed(7);$('lon').value=state.observer.lon.toFixed(7);$('height').value=state.heightAssumed?'':state.observer.height.toFixed(1);$('geoStatus').textContent=`端末の位置情報 · 精度 ±${Math.round(position.coords.accuracy)} m · ${shortFormat.format(new Date(position.timestamp))} JST`;$('observerInfo').textContent=state.heightAssumed?'高さ未取得：0 mと仮定しています。':'端末の楕円体高を使用しています。';$('locate').disabled=false;loadPlan();loadSeries();}
function geoError(error){$('locate').disabled=false;stopFollow();const labels={1:'位置情報の利用が許可されていません。',2:'現在地を取得できません。',3:'現在地取得がタイムアウトしました。'};$('geoStatus').textContent=(labels[error.code]||error.message)+' 緯度・経度を入力できます。';}
function geolocate(follow=false){if(!window.isSecureContext){geoError({message:'現在地取得にはHTTPSまたはlocalhostが必要です。'});return;}if(!navigator.geolocation){geoError({message:'このブラウザは位置情報に対応していません。'});return;}stopFollow();$('geoStatus').textContent='現在地を取得しています…';const generation=geoGeneration,onPosition=p=>{if(generation===geoGeneration)applyPosition(p);},onError=e=>{if(generation===geoGeneration)geoError(e);};const opts={enableHighAccuracy:true,timeout:15000,maximumAge:5000};if(follow){$('follow').checked=true;state.watch=navigator.geolocation.watchPosition(onPosition,onError,opts);}else{$('locate').disabled=true;navigator.geolocation.getCurrentPosition(onPosition,onError,opts);}}
const syncLocationStatus=()=>{$('locationFeedback').textContent=$('geoStatus').textContent;$('retryLocation').disabled=$('locate').disabled;$('locationNotice').textContent=$('locate').disabled?'現在地を取得しています…':state.locationSource.startsWith('端末から')?'端末の位置情報を使用しています':state.locationSource.startsWith('初期地点')?'現在地を取得できませんでした':'指定した地点を表示中';};
new MutationObserver(syncLocationStatus).observe($('geoStatus'),{childList:true,characterData:true,subtree:true});
$('retryLocation').onclick=()=>geolocate();
$('locate').onclick=()=>geolocate();$('follow').onchange=e=>e.target.checked?geolocate(true):stopFollow();
$('locationForm').onsubmit=e=>{e.preventDefault();stopFollow();state.locationSource='緯度・経度で指定した地点';state.observer={lat:Number($('lat').value),lon:Number($('lon').value),height:$('height').value===''?0:Number($('height').value)};state.heightAssumed=$('height').value==='';$('geoStatus').textContent='手入力の地点を使用しています。';$('observerInfo').textContent=state.heightAssumed?'高さ未指定：0 mと仮定しています。':`楕円体高 ${state.observer.height} m`;loadPlan();loadSeries();};
$('live').onclick=()=>{state.live=true;loadPlan();};$('fixed').onclick=()=>{state.live=false;syncTime();$('datetime').focus();};
$('datetime').onfocus=()=>{if(state.live){state.live=false;syncTime();}};
$('datetime').onchange=()=>{const t=Date.parse($('datetime').value+'+09:00');if(!Number.isFinite(t)||Math.abs(t-Date.now())>86400000+60000){message('日時は現在の前後24時間以内で指定してください。',true);return;}state.live=false;state.time=t;loadPlan();};
$('candidatesOnly').onchange=()=>{state.candidatesOnly=$('candidatesOnly').checked;if(state.plan)render();else renderSky();};
$('systems').onchange=()=>{state.systems=[...$('systems').querySelectorAll('input:checked')].map(e=>e.value);loadPlan();loadSeries();};
$('anglePresets').onclick=e=>{const button=e.target.closest('[data-mask]');if(!button)return;state.mask=Number(button.dataset.mask);$('mask').value=state.mask;$('maskValue').textContent=state.mask+'°';loadPlan();loadSeries();};
$('mask').oninput=()=>{$('maskValue').textContent=$('mask').value+'°';};$('mask').onchange=()=>{state.mask=Number($('mask').value);loadPlan();loadSeries();};
$('timeRange').oninput=()=>{state.live=false;state.time=Date.now()+Number($('timeRange').value)*60000;syncTime();};$('timeRange').onchange=()=>loadPlan();
$('sky').onclick=e=>{const target=e.target.closest('[data-id]');if(target)select(target.dataset.id);};$('sky').onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.dataset.id){e.preventDefault();select(e.target.dataset.id);}};$('satTable').onclick=e=>{const target=e.target.closest('[data-id]');if(target)select(target.dataset.id);};
let seriesController,seriesRequest=0;
async function loadSeries(){
 const request=++seriesRequest;seriesController?.abort();seriesController=new AbortController();
 state.series=null;$('chart').innerHTML='';$('timelineSummary').textContent='時間ごとの評価を読み込み中…';$('timeComparison').textContent='比較する時間を計算中…';renderChart();$('seriesStatus').textContent='時間帯ごとの配置を計算中…';
 try{const response=await fetch(`/api/series?${query()}`,{signal:seriesController.signal});const data=await response.json();if(!response.ok)throw new Error(data.error);if(request!==seriesRequest)return;state.series=data;$('seriesStatus').textContent=`${data.points.length}時点 · 15分ごとの配置予測`;renderChart();}catch(e){if(e.name!=='AbortError'){$('seriesStatus').textContent=e.message;$('timelineSummary').textContent='時間ごとの評価を取得できませんでした。';$('timeComparison').textContent='比較できません。';}}
}
const ratingText={low:'○ 良好',medium:'△ 注意',high:'！ 不利',unknown:'？ 判断できない'};
function renderChart(){
 const selection=$('timeVerdict'),p=state.plan,level=geometryLevel(p?.dop.pdop);
 selection.className='time-verdict '+level;
 selection.innerHTML=p?`<span>${shortFormat.format(new Date(p.time))}</span><strong>${ratingText[level]}</strong><small>PDOP ${decimal(p.dop.pdop)} · 候補 ${p.used}機</small>`:'<strong>評価できません</strong>';
 if(!state.series)return;
 const points=state.series.points,w=Math.max(260,$('chart').clientWidth),left=48,right=w-16,top=36,bottom=256;
 const finite=points.filter(q=>Number.isFinite(q.pdop));
 const maxValue=Math.max(0,...finite.map(q=>q.pdop),p?.dop.pdop??0);
 const ceiling=Math.max(2.5,Math.ceil(maxValue*1.15*2)/2);
 const start=Date.parse(points[0].time),end=Date.parse(points.at(-1).time);
 const x=t=>left+(t-start)/(end-start)*(right-left),y=v=>top+v/ceiling*(bottom-top);
 $('chart').setAttribute('viewBox',`0 0 ${w} 300`);
 let html='';
 for(const [lo,hi,fill,label] of [[0,2,'#e6f5ee','○ 良好'],[2,5,'#fff5d8','△ 注意'],[5,ceiling,'#fff0ea','！ 不利']]){
  const upper=Math.min(hi,ceiling);if(upper<=lo)continue;
  html+=`<rect x="${left}" y="${y(lo)}" width="${right-left}" height="${y(upper)-y(lo)}" fill="${fill}"/><text x="${right-8}" y="${y(lo)+17}" text-anchor="end" fill="#475c65" font-size="12">${label}</text>`;
 }
 const ticks=[...new Set([0,ceiling/4,ceiling/2,ceiling*3/4,ceiling,...[2,5].filter(v=>v<ceiling)])].sort((a,b)=>a-b).filter((v,i,all)=>v===0||v===ceiling||v===2||v===5||![2,5].some(t=>t<ceiling&&Math.abs(v-t)/ceiling<.09));
 for(const v of ticks)html+=`<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="${v===2||v===5?'#9daea9':'#dce5e8'}" stroke-dasharray="${v===2||v===5?'5 4':'0'}"/><text x="${left-7}" y="${y(v)+4}" text-anchor="end" fill="#50697a" font-size="12">${v.toFixed(1)}</text>`;
 html+=`<text x="${left}" y="16" fill="#25586b" font-size="12">↑ 上ほど良好（PDOPは小さいほど良い）</text>`;
 let path='',drawing=false;
 for(let i=0;i<points.length;i++){
  const q=points[i],t=Date.parse(q.time);
  if(!Number.isFinite(q.pdop)){
   drawing=false;const a=i?(Date.parse(points[i-1].time)+t)/2:t,b=i+1<points.length?(Date.parse(points[i+1].time)+t)/2:t;
   html+=`<rect x="${x(a)}" y="${top}" width="${Math.max(1,x(b)-x(a))}" height="${bottom-top}" fill="#dce1e7"><title>${shortFormat.format(new Date(t))}：判断できない</title></rect>`;continue;
  }
  path+=`${drawing?'L':'M'}${x(t).toFixed(2)},${y(q.pdop).toFixed(2)} `;drawing=true;
 }
 html+=`<path d="${path}" fill="none" stroke="#226c88" stroke-width="2.5" stroke-linejoin="round"/>`;
 // Single isolated valid samples remain visible even when both neighbours are missing.
 for(const q of finite)html+=`<circle cx="${x(Date.parse(q.time))}" cy="${y(q.pdop)}" r="1.6" fill="#226c88"><title>${shortFormat.format(new Date(q.time))} · PDOP ${decimal(q.pdop)} · 候補 ${q.used}機</title></circle>`;
 const centre=Date.parse(state.series.centre),cx=x(centre);
 html+=`<line x1="${cx}" x2="${cx}" y1="${top}" y2="${bottom}" stroke="#738c9c" stroke-dasharray="4 4"/><text x="${cx}" y="31" text-anchor="middle" fill="#536f7f" font-size="12">現在</text>`;
 const stride=w<600?96:w<1000?48:24;
 for(let i=0;i<points.length;i+=stride)html+=`<text x="${x(Date.parse(points[i].time))}" y="286" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}" fill="#586f82" font-size="12">${shortFormat.format(new Date(points[i].time))}</text>`;
 if(p){const t=Date.parse(p.time);if(t>=start&&t<=end){const sx=x(t);html+=`<line x1="${sx}" x2="${sx}" y1="${top}" y2="${bottom}" stroke="#193c55" stroke-width="1.5"/>`;if(Number.isFinite(p.dop.pdop))html+=`<circle cx="${sx}" cy="${y(p.dop.pdop)}" r="6" fill="white" stroke="#226c88" stroke-width="3"/>`;}}
 $('chart').innerHTML=html;
 const future=points.filter(q=>Date.parse(q.time)>=centre),valid=future.filter(q=>Number.isFinite(q.pdop));
 const counts={low:0,medium:0,high:0,unknown:0};for(const q of future)counts[geometryLevel(q.pdop)]++;
 const text=!valid.length?'今後24時間は、配置を判断できるデータがありません。':counts.low===future.length?'今後24時間は良好な範囲です（15分ごとの予測）。':`今後24時間：${counts.high?'不利な時間があります。':counts.medium?'注意が必要な時間があります。':'計算できた時点では有利です。'}${counts.unknown?'灰色の時間は判断できません。':''}`;
 $('timelineSummary').textContent=text;
 if(valid.length){const best=valid.reduce((a,b)=>a.pdop<=b.pdop?a:b),worst=valid.reduce((a,b)=>a.pdop>=b.pdop?a:b);
  $('timeComparison').innerHTML=`<div><span>最も良い時間</span><strong>${decimal(best.pdop)} <small>${ratingText[geometryLevel(best.pdop)]}</small></strong><button type="button" data-time="${esc(best.time)}">${shortFormat.format(new Date(best.time))}を見る</button></div><div><span>相対的に不利な時間</span><strong>${decimal(worst.pdop)} <small>${ratingText[geometryLevel(worst.pdop)]}</small></strong><button type="button" data-time="${esc(worst.time)}">${shortFormat.format(new Date(worst.time))}を見る</button></div>`;
 }else $('timeComparison').textContent='比較できる数値がありません。';
}
$('timeComparison').onclick=e=>{const button=e.target.closest('[data-time]');if(!button)return;state.time=Date.parse(button.dataset.time);state.live=false;loadPlan();};

$('chart').onclick=e=>{if(!state.series)return;const svg=$('chart'),pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const pos=pt.matrixTransform(svg.getScreenCTM().inverse());const width=svg.viewBox.baseVal.width;const fraction=Math.max(0,Math.min(1,(pos.x-48)/(width-64)));const index=Math.round(fraction*(state.series.points.length-1));state.time=Math.max(Date.now()-86400000,Date.parse(state.series.points[index].time));state.live=false;loadPlan();};
const updateLocationUI=initLocationUI((lat,lon)=>{state.locationSource='地図で選んだ地点（端末の現在地とは異なる場合があります）';stopFollow();$('locate').disabled=false;state.observer={lat,lon,height:0};state.heightAssumed=true;$('lat').value=lat.toFixed(7);$('lon').value=lon.toFixed(7);$('height').value='';$('geoStatus').textContent='地図で選んだ地点を使用しています（現在地の追従は停止）。';$('observerInfo').textContent='高さは0 mと仮定しています。';loadPlan();loadSeries();});
const resizeObserver=new ResizeObserver(()=>{renderChart();renderSky();});resizeObserver.observe($('chart'));resizeObserver.observe($('skyWrap'));
syncTime();renderSky();loadPlan();loadSeries();api('/api/status').then(s=>{$('connectionInfo').textContent=s.hosted?'Web公開版：現在地取得にはブラウザの位置情報の許可が必要です。':s.lan?`LAN接続：${s.urls.join(' / ')}`:'このPCからのみ接続できます。スマートフォン用の起動方法はREADMEをご覧ください。';}).catch(()=>{});
setInterval(()=>{if(state.live&&!document.hidden)loadPlan();},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadPlan();loadSeries();}});
setInterval(()=>{if(!document.hidden){loadSeries();if(!state.live)loadPlan();}},300000);

// Optional browser-native tools use the same state and update path as the UI.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const tool={name:'configure_gnss_view',title:'衛星配置の表示条件を変更',description:'地点・最低仰角・時刻を設定し、天空図とDOPを更新します。位置情報の許可や取得は行いません。',inputSchema:{type:'object',additionalProperties:false,properties:{latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180},height:{type:'number',minimum:-500,maximum:10000},mask:{type:'number',minimum:0,maximum:60},time:{type:'string',description:'ISO 8601 with timezone, or now'},systems:{type:'array',items:{type:'string',enum:Object.keys(names)}}},required:['latitude','longitude']},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){
  if(!input||typeof input!=='object')throw new Error('入力が不正です。');
  const lat=input.latitude,lon=input.longitude,height=input.height??0,mask=input.mask??state.mask,time=input.time&&input.time!=='now'?Date.parse(input.time):Date.now(),systems=input.systems??state.systems;
  if(!Number.isFinite(lat)||lat< -90||lat>90||!Number.isFinite(lon)||lon< -180||lon>180||!Number.isFinite(height)||height< -500||height>10000||!Number.isFinite(mask)||mask<0||mask>60||!Number.isFinite(time)||Math.abs(time-Date.now())>86400000||!Array.isArray(systems)||systems.some(s=>!names[s]))throw new Error('地点・時刻・計算条件の範囲を確認してください。');
  stopFollow();state.locationSource="指定された地点";state.observer={lat,lon,height};state.mask=mask;state.time=time;state.live=!input.time||input.time==='now';state.systems=[...new Set(systems)];state.heightAssumed=input.height==null;
  $('lat').value=lat;$('lon').value=lon;$('height').value=input.height??'';$('mask').value=mask;$('maskValue').textContent=mask+'°';for(const el of $('systems').querySelectorAll('input'))el.checked=state.systems.includes(el.value);$('geoStatus').textContent='指定された地点を使用しています。';$('observerInfo').textContent=state.heightAssumed?'高さ未指定：0 mと仮定しています。':`楕円体高 ${height} m`;
  const p=await loadPlan();await loadSeries();if(!p)throw new Error('データを取得できませんでした。');return {time:p.time,visible:p.visible,used:p.used,pdop:p.dop.pdop,hdop:p.dop.hdop,vdop:p.dop.vdop};
 }};
 try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

// Browser geolocation may use GPS, Wi-Fi or OS positioning; hardware GPS cannot be detected.
geolocate();
