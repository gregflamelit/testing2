import {predict, interval} from './inference.mjs';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = (v,n=2) => Number(v).toFixed(n);
const percent = v => `${fmt(v*100,1)}%`;
const title = s => s==='pH'?'pH':s[0].toUpperCase()+s.slice(1);
const units = ['g/L','g/L','g/L','g/L','g/L','mg/L','mg/L','g/cm³','','g/L','% vol'];
const steps = [.1,.01,.01,.1,.001,1,1,.0001,.01,.01,.1];
const digits = [1,2,2,1,3,0,0,4,2,2,1];
let model, data, values, currentScore, flight=[], page=0, toastTimer;

function notify(message) { $('#toast').textContent=message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2800); }
function view(id) {
  $$('.view').forEach(el=>el.hidden=el.id!==id);
  $$('.nav').forEach(el=>{el.classList.toggle('active',el.dataset.view===id); if(el.dataset.view===id)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  if(id==='explorer')requestAnimationFrame(drawScatter);
}
function setValues(x) {
  values=[...x];
    values.forEach((v,i)=> { $(`#range-${i}`).value=v; $(`#number-${i}`).value=String(v); });
  update();
}
function makeSliders() {
  const primary=[10,1,9,0];
  model.features.forEach((name,i)=> {
    const row=document.createElement('div');row.className='slider-row';
    row.innerHTML=`<div class="slider-top"><label for="range-${i}">${title(name)} <span class="units">${units[i]}</span></label><input class="numeric" type="number" id="number-${i}" aria-label="${name} numeric value" min="${model.minimum[i]}" max="${model.maximum[i]}" step="${steps[i]}"></div><input type="range" id="range-${i}" aria-label="${name}" min="${model.minimum[i]}" max="${model.maximum[i]}" step="${steps[i]}"><div class="range-labels"><span>${model.minimum[i]} ${units[i]}</span><span>${model.maximum[i]} ${units[i]}</span></div>`;
    (primary.includes(i)?$('#primary-sliders'):$('#advanced-sliders')).append(row);
    $(`#range-${i}`).addEventListener('input',e=>{values[i]=Number(e.target.value);$(`#number-${i}`).value=fmt(values[i],digits[i]);$('#preset').value='';update();});
    $(`#number-${i}`).step='any';
    $(`#number-${i}`).addEventListener('input',e=>{
      const v=Number(e.target.value);
      if(e.target.value!==''&&Number.isFinite(v)&&v>=model.minimum[i]&&v<=model.maximum[i]){
        values[i]=v;$(`#range-${i}`).value=v;$('#preset').value='';update();
      }
    });
    $(`#number-${i}`).addEventListener('change',e=> {
      const v=Number(e.target.value);
      if(e.target.value===''||!Number.isFinite(v)||v<model.minimum[i]||v>model.maximum[i]) {e.target.value=fmt(values[i],digits[i]);notify(`Use a value from ${model.minimum[i]} to ${model.maximum[i]}.`);return;}
      values[i]=v;$(`#range-${i}`).value=v;$('#preset').value='';update();
    });
  });
  // Give the most interpretable controls priority.
  primary.forEach(i=>$('#primary-sliders').append($(`#range-${i}`).closest('.slider-row')));
}
function update() {
  currentScore=predict(model,values);
  $('#score').textContent=fmt(currentScore,1);
  $('#verdict').textContent=currentScore>=6.5?'Something to savor.':currentScore>=5.5?'Quietly promising.':'Worth a closer look.';
  const [lo,hi]=interval(model,currentScore);
  $('#interval').textContent=`Likely range: ${fmt(lo,1)}–${fmt(hi,1)}`;
  $('#decision-title').textContent=currentScore>=6.5?'Put this on your tasting shortlist.':currentScore>=5.5?'A promising candidate for sensory review.':'Prioritize this batch for sensory review.';
  $('#decision-copy').textContent='This is a model estimate of a recorded sensory score. Taste alongside the forecast before making a quality decision.';
  const unusual=values.map((v,i)=>v<model.q05[i]||v>model.q95[i]?model.features[i]:null).filter(Boolean);
  $('#range-warning').hidden=!unusual.length;
  $('#range-warning').textContent=`Outside the training data’s central 90%: ${unusual.join(', ')}. Interpret this forecast cautiously.`;
  $('#sensitivity').replaceChildren();
  const deltas=[10,1,9].map(i=> {
    const change=i===10?.5:.05;
    const direction=values[i]+change<=model.maximum[i]?1:-1;
    const x=[...values];x[i]+=change*direction;
    return {i,change:change*direction,delta:predict(model,x)-currentScore};
  });
  for(const {i,change,delta} of deltas) {
    const item=document.createElement('div');item.className='sensitivity-item';
    item.innerHTML=`<div class="sensitivity-top"><span>${title(model.features[i])}</span><span class="change">${delta>=0?'+':''}${fmt(delta,2)}</span></div><p>If ${change>0?'+':''}${fmt(change,i===10?1:2)} ${units[i]}</p><div class="sensitivity-track"><i style="width:${Math.min(100,Math.abs(delta)*250)}%"></i></div>`;
    $('#sensitivity').append(item);
  }
}
function renderFlight() {
  const holder=$('#flight');holder.replaceChildren();
  $('#clear-flight').disabled=flight.length===0;
  if(!flight.length){holder.innerHTML='<div class="empty-flight"><span>＋</span><div><strong>Your next discovery starts here.</strong><p>Save a forecast, tweak the profile, and compare up to four wines side by side.</p></div></div>';return;}
  flight.forEach((wine,i)=> {
    const card=document.createElement('article');card.className='flight-card';
    card.innerHTML=`<input maxlength="35" aria-label="Wine ${i+1} name"><button class="text-button remove" aria-label="Remove wine ${i+1}">×</button><div class="flight-score">${fmt(wine.score,1)} <span class="tiny muted">/ 10</span></div><p>${fmt(wine.values[10],1)}% alcohol · ${fmt(wine.values[1])} g/L VA</p><p>Interval ${interval(model,wine.score).map(v=>fmt(v,1)).join('–')}</p><button class="text-button load">Load profile ↗</button>`;
    card.querySelector('input').value=wine.name;
    card.querySelector('input').addEventListener('change',e=>{wine.name=e.target.value||`Wine ${i+1}`;persist();});
    card.querySelector('.remove').onclick=()=>{flight.splice(i,1);persist();renderFlight();};
    card.querySelector('.load').onclick=()=>{$('#preset').value='';setValues(wine.values);window.scrollTo({top:0,behavior:'smooth'});};
    holder.append(card);
  });
}
function persist() {try{localStorage.setItem('cuvee-flight-v1',JSON.stringify(flight));}catch{notify('This browser cannot save the flight between visits.');}}
function stat(label,value,note) {return `<div class="stat"><span>${label}</span><strong>${value}</strong><p>${note}</p></div>`;}
function renderModel() {
  const m=model.metrics;
  $('#quick-metric').textContent=`Held-out MAE: ${fmt(m.mae,3)} quality points.`;
  $('#model-stats').innerHTML=stat('MODEL MAE',fmt(m.mae,3),'Average absolute test error, quality points')+stat('BASELINE MAE',fmt(m.baselineMae,3),`Always predict training median (${m.baselineValue})`)+stat('ERROR REDUCTION',percent(1-m.mae/m.baselineMae),'Relative to the median baseline')+stat('WITHIN ONE POINT',percent(m.withinOne),`${m.testCount} untouched test samples`);
  const partitions=[['Training',m.trainCount,'#73384b'],['Calibration',m.calibrationCount,'#b69973'],['Test',m.testCount,'#849179']];
  $('#split-bar').innerHTML=partitions.map(([n,c,col])=>`<div style="width:${c/data.rows.length*100}%;background:${col}" title="${n}: ${c}"></div>`).join('');
  $('#split-legend').innerHTML=partitions.map(([n,c,col])=>`<span><i style="background:${col}"></i>${n} · ${c}</span>`).join('');
  const sorted=m.permutationImportance.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
  $('#importance').innerHTML=sorted.map(({v,i})=>`<div class="importance-row" title="Standard deviation across 8 shuffles: ${fmt(m.permutationStd[i],4)}"><span>${title(model.features[i])}</span><div><i style="width:${Math.max(0,v)/Math.max(...m.permutationImportance)*100}%"></i></div><span>${v>0?'+':''}${fmt(v,3)}</span></div>`).join('')+'<p class="tiny muted">Negative values mean shuffling slightly improved the result. Hover a row for variability across repeats.</p>';
  $('#errors').innerHTML=m.errorByQuality.map(r=>`<tr><td><span class="quality-badge">${r.quality}</span></td><td>${r.count}</td><td>${fmt(r.mae,3)}</td></tr>`).join('');
  $('#interval-description').innerHTML=`<p>The split-conformal interval uses the finite-sample 90% quantile of absolute calibration errors: ±${fmt(m.intervalRadius,2)} quality points, clipped to the 0–10 score scale. Its observed test coverage is <strong>${percent(m.intervalCoverage)}</strong>. This is a range for an individual score, not a guarantee.</p><p>Test RMSE: ${fmt(m.rmse,3)} · R²: ${fmt(m.r2,3)}. ${m.uniqueProfiles.toLocaleString()} unique chemistry profiles across ${data.rows.length.toLocaleString()} rows.</p>`;
}
function renderExplorer() {
  const counts=new Map();data.rows.forEach(r=>counts.set(r[11],(counts.get(r[11])||0)+1));
  $('#dataset-stats').innerHTML=stat('RED WINE SAMPLES',data.rows.length.toLocaleString(),'11 numeric chemistry attributes')+stat('UNIQUE PROFILES',model.metrics.uniqueProfiles.toLocaleString(),'Duplicate profiles grouped before splitting')+stat('MEDIAN QUALITY',fmt([...data.rows.map(r=>r[11])].sort((a,b)=>a-b)[Math.floor(data.rows.length/2)],0),'Observed sensory score out of 10')+stat('MISSING VALUES','0','All supplied measurements are complete');
  $('#x-feature').innerHTML=model.features.map((f,i)=>`<option value="${i}" ${i===10?'selected':''}>${title(f)}</option>`).join('');
  $('#histogram').innerHTML=[...counts].sort((a,b)=>a[0]-b[0]).map(([q,c])=>`<div class="hist-row"><span>${q}</span><div class="hist-track"><i style="width:${c/Math.max(...counts.values())*100}%"></i></div><b>${c}</b></div>`).join('');
  [...counts.keys()].sort().forEach(q=>{const op=document.createElement('option');op.value=q;op.textContent=`Score ${q}`;$('#sample-filter').append(op);});
  renderSamples();
}
function filteredSamples(){const filter=$('#sample-filter').value;return data.rows.map((r,i)=>({r,i})).filter(({r})=>filter==='all'||r[11]===Number(filter));}
function renderSamples() {
  const rows=filteredSamples();const last=Math.max(0,Math.ceil(rows.length/8)-1);page=Math.max(0,Math.min(page,last));
  $('#sample-rows').innerHTML=rows.slice(page*8,page*8+8).map(({r,i})=>`<tr><td>#${String(i+1).padStart(4,'0')}</td><td>${fmt(r[10],1)}%</td><td>${fmt(r[1])}</td><td>${fmt(r[9])}</td><td><span class="quality-badge">${r[11]} / 10</span></td><td>${title(data.split[i])}</td><td><button class="text-button" data-sample="${i}">Inspect ↗</button></td></tr>`).join('');
  $('#page-label').textContent=`${page*8+1}–${Math.min(rows.length,page*8+8)} of ${rows.length}`;
  $('#prev-page').disabled=page===0;$('#next-page').disabled=page===last;
  $$('[data-sample]').forEach(b=>b.onclick=()=>{const r=data.rows[Number(b.dataset.sample)];view('workbench');$('#preset').value='';setValues(r.slice(0,11));notify(`Loaded sample #${Number(b.dataset.sample)+1}. Recorded quality: ${r[11]}.`);window.scrollTo({top:0,behavior:'smooth'});});
}
function drawScatter() {
  if($('#explorer').hidden)return;
  const canvas=$('#scatter'),box=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  canvas.width=box.width*dpr;canvas.height=box.height*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const w=box.width,h=box.height,left=42,right=w-17,top=20,bottom=h-43,feature=Number($('#x-feature').value),min=model.minimum[feature],max=model.maximum[feature];
  const xx=v=>left+(v-min)/(max-min)*(right-left), yy=v=>bottom-(v-2.5)/6*(bottom-top);
  ctx.font='10px Segoe UI';ctx.fillStyle='#85877c';ctx.strokeStyle='#e8e4da';
  for(let q=3;q<=8;q++){ctx.beginPath();ctx.moveTo(left,yy(q));ctx.lineTo(right,yy(q));ctx.stroke();ctx.fillText(String(q),17,yy(q)+3);}
  ctx.textAlign='center';for(let i=0;i<=5;i++){const v=min+(max-min)*i/5;ctx.fillText(fmt(v,feature===7?3:1),xx(v),bottom+18);}
  ctx.fillText(`${title(model.features[feature])} ${units[feature]?'('+units[feature]+')':''}`,(left+right)/2,h-4);
  ctx.save();ctx.translate(9,h/2);ctx.rotate(-Math.PI/2);ctx.fillText('Observed quality',0,0);ctx.restore();
  data.rows.forEach((row,i)=> {const jitter=(((i*7919)%101)/100-.5)*.4;ctx.fillStyle=row[11]>=7?'#6b7d6688':row[11]<=4?'#b6905677':'#873b5360';ctx.beginPath();ctx.arc(xx(row[feature]),yy(row[11]+jitter),2.7,0,Math.PI*2);ctx.fill();});
  const xs=data.rows.map(r=>r[feature]),ys=data.rows.map(r=>r[11]),mean=a=>a.reduce((s,v)=>s+v,0)/a.length,mx=mean(xs),my=mean(ys);
  let num=0,dx=0,dy=0;xs.forEach((v,i)=>{num+=(v-mx)*(ys[i]-my);dx+=(v-mx)**2;dy+=(ys[i]-my)**2;});
  $('#scatter-summary').textContent=`Pearson correlation: ${fmt(num/Math.sqrt(dx*dy))}. Descriptive association across the full dataset; not a held-out performance measure.`;
}
async function init() {
  const load=async path=>{const r=await fetch(path);if(!r.ok)throw new Error(`Could not load ${path}`);return r.json();};
  [model,data]=await Promise.all([load('model.json'),load('dataset.json')]);
  values=[...model.median];makeSliders();setValues(values);renderModel();renderExplorer();
  try{const saved=JSON.parse(localStorage.getItem('cuvee-flight-v1')||'[]');flight=Array.isArray(saved)?saved.filter(w=>typeof w.name==='string'&&Array.isArray(w.values)&&w.values.length===11&&w.values.every(Number.isFinite)).slice(0,4).map(w=>({...w,score:predict(model,w.values)})):[];}catch{flight=[];}
  renderFlight();
  $$('.nav').forEach(b=>b.onclick=()=>view(b.dataset.view));$('.model-link').onclick=()=>{view('model');window.scrollTo({top:0,behavior:'smooth'});};
  $('.brand').onclick=e=>{e.preventDefault();view('workbench');};
  $('#preset').onchange=e=>{const key=e.target.value;if(key==='median')return setValues(model.median);const q={bright:8,classic:6,rustic:4}[key];const row=data.rows.find(r=>r[11]===q);setValues(row.slice(0,11));notify(`Real dataset sample. Recorded quality: ${q} / 10.`);};
  $('#reset').onclick=()=>{$('#preset').value='median';setValues(model.median);};
  $('#save').onclick=()=>{if(flight.length>=4)return notify('Your flight has four wines. Remove one to add another.');flight.push({name:`Wine ${flight.length+1}`,values:[...values],score:currentScore});persist();renderFlight();notify('Added to your tasting flight below.');};
  $('#clear-flight').onclick=()=>{flight=[];persist();renderFlight();notify('Tasting flight cleared.');};
  $('#export').onclick=()=>{const [lower,upper]=interval(model,currentScore);const report={app:'Cuvée Lab',inputs:Object.fromEntries(model.features.map((n,i)=>[n,values[i]])),predictedQuality:currentScore,predictionInterval:{nominalCoverage:.9,lower,upper},heldOutMAE:model.metrics.mae,seed:42,modelSourceSha256:model.sourceSha256,notes:'Hypothetical profile. Associations are not causal. Sensory review required.'};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='cuvee-forecast.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Forecast exported.');};
  $('#x-feature').onchange=drawScatter;$('#sample-filter').onchange=()=>{page=0;renderSamples();};$('#prev-page').onclick=()=>{page--;renderSamples();};$('#next-page').onclick=()=>{page++;renderSamples();};
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(drawScatter,100);});
  $('#app').hidden=false;$('#loading').hidden=true;
}
init().catch(error=>{$('#loading').textContent='The cellar could not open. Please refresh. If running locally, serve this folder over HTTP (see README).';console.error(error);});
