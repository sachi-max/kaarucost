// ===================== FURNITURE KRANTI — PHOTO ESTIMATOR (photo-first) =====================
(function(){
  "use strict";
  var API_URL = "/.netlify/functions/analyze"; // backend proxy (set after deploy)

  function $(id){return document.getElementById(id)}
  function rupee(n){return '₹'+Math.round(n).toLocaleString('en-IN')}

  // ---------------- RATES (editable + saved) ----------------
  var RATES = { profit:30, gst:18, round:100, woodRate:900, labour:0.30 };
  var RATE_LABELS = { profit:"Profit %", gst:"GST %", round:"Round to ₹", woodRate:"Wood ₹/sqft (default)", labour:"Labour factor" };
  try{var sv=JSON.parse(localStorage.getItem('fk_rates2')||'{}');Object.keys(sv).forEach(function(k){if(k in RATES)RATES[k]=sv[k]})}catch(e){}
  function buildRateGrid(){
    var g=$('rateGrid'),h='';
    Object.keys(RATES).forEach(function(k){h+='<div><label>'+RATE_LABELS[k]+'</label><input type="number" step="0.01" id="rate_'+k+'" value="'+RATES[k]+'"></div>'});
    g.innerHTML=h;
    Object.keys(RATES).forEach(function(k){$('rate_'+k).addEventListener('input',function(){RATES[k]=parseFloat(this.value)||0;recompute()})});
  }
  $('saveRates').addEventListener('click',function(){
    try{localStorage.setItem('fk_rates2',JSON.stringify(RATES));$('rmsg').textContent='✓ Saved on this device'}catch(e){$('rmsg').textContent='Could not save'}
    setTimeout(function(){$('rmsg').textContent=''},2500);
  });

  // ---------------- material constants ----------------
  var METAL_DENSITY={"SS 304":8.0,"SS 316":8.0,"SS 202":8.0,"Brass":8.5,"Mild Steel (MS)":7.85,"Aluminium":2.70};
  var METAL_RATE={"SS 304":210,"SS 316":310,"SS 202":155,"Brass":650,"Mild Steel (MS)":75,"Aluminium":280};
  var QUALITY={"Budget":0.75,"Mid-range":1,"Premium":1.6,"Luxury":2.4};
  var UPH_FABRIC={"Standard fabric":220,"Premium fabric":380,"Bouclé / designer":550,"Leatherette":420,"Genuine leather":950};
  var UPH_FOAM={"Standard foam":1,"High-density foam":1.35,"Memory foam":1.7};

  // ===== Standard thickness options =====
  var METAL_THICK=['0.8','1.0','1.2','1.5','2.0','2.5','3.0','4.0','5.0','6.0','8.0','10.0']; // mm (sheet/tube wall)
  var WOOD_THICK=['6','9','12','16','18','25']; // mm boards
  // typical kg/ft for SS pipe by common size (approx, for suggestion)
  // typical thickness suggestion by furniture category
  var TYP_THICK={
    'sofa':{metal:'1.5',wood:'18'},'bed':{metal:'1.5',wood:'18'},
    'dining':{metal:'1.5',wood:'25'},'chair':{metal:'1.2',wood:'18'},
    'table':{metal:'1.5',wood:'18'},'tvunit':{metal:'1.2',wood:'18'},
    'wardrobe':{metal:'1.2',wood:'18'},'storage':{metal:'1.2',wood:'18'}
  };

  // ===== BOARD / WOOD material types (₹/sqft incl. board cost, NCR; finish/labour added separately) =====
  var BOARDS={
    "Plywood (MR)":900,
    "Plywood (BWP/marine)":1150,
    "MDF (plain)":650,
    "MDF (pre-laminated)":800,
    "Block board":850,
    "Particle board":500,
    "Solid wood (sheesham)":2600,
    "Solid wood (teak)":4500,
    "Solid wood (mango/rubber)":1800,
    "HDHMR":1200,
    "WPC board":1100,
    "Pre-laminated ply":1050
  };

  // ===== FINISH / POLISH rates (₹/sqft applied surface, NCR market) =====
  var FINISH={
    "None / raw":0,
    "Lamination":65,
    "Melamine polish":95,
    "PU polish (matt)":175,
    "PU polish (high gloss)":210,
    "Duco / paint":210,
    "Polyester high-gloss":260,
    "Epoxy resin finish":350,
    "Veneer + melamine":150,
    "Veneer + PU":320,
    "Acrylic":240,
    "Membrane":150,
    "PVD (metal)":180,
    "Powder coat (metal)":90,
    "Buffing / mirror (metal)":60
  };

  // ===== THUMB-RULE standard dimensions (Indian market, inches) =====
  // L x W/D x H — used to auto-fill when AI detects category
  var THUMB={
    // Beds (L x W, mattress footprint)
    'single bed':{L:78,W:36,H:18,cat:'bed'},
    'queen bed':{L:78,W:60,H:18,cat:'bed'},
    'king bed':{L:78,W:72,H:18,cat:'bed'},
    // Sofas (L x D x H)
    '1 seater sofa':{L:36,W:34,H:32,cat:'sofa'},
    '2 seater sofa':{L:58,W:34,H:32,cat:'sofa'},
    '3 seater sofa':{L:78,W:34,H:32,cat:'sofa'},
    '4 seater sofa':{L:96,W:34,H:32,cat:'sofa'},
    'l-shape sofa':{L:108,W:64,H:32,cat:'sofa'},
    // Dining tables (L x W x H)
    '2 seater dining':{L:30,W:30,H:30,cat:'dining'},
    '4 seater dining':{L:48,W:30,H:30,cat:'dining'},
    '6 seater dining':{L:72,W:36,H:30,cat:'dining'},
    '8 seater dining':{L:90,W:42,H:30,cat:'dining'},
    'dining chair':{L:18,W:18,H:34,cat:'chair'},
    // Tables
    'coffee table':{L:42,W:24,H:17,cat:'table'},
    'side table':{L:18,W:18,H:24,cat:'table'},
    'console table':{L:42,W:14,H:30,cat:'table'},
    'tv unit':{L:60,W:18,H:20,cat:'tvunit'},
    // Storage
    'wardrobe 2 door':{L:42,W:24,H:84,cat:'wardrobe'},
    'wardrobe 3 door':{L:60,W:24,H:84,cat:'wardrobe'},
    'wardrobe 4 door':{L:84,W:24,H:84,cat:'wardrobe'},
    'bookshelf':{L:36,W:12,H:72,cat:'storage'},
    'chest of drawers':{L:36,W:18,H:42,cat:'storage'},
    'bedside table':{L:18,W:16,H:24,cat:'table'}
  };
  function matchThumb(name){
    name=(name||'').toLowerCase();
    // direct
    for(var k in THUMB){if(name.indexOf(k)>=0)return k}
    // smart matching
    if(name.indexOf('sofa')>=0||name.indexOf('couch')>=0){
      if(name.indexOf('2')>=0)return '2 seater sofa';
      if(name.indexOf('4')>=0)return '4 seater sofa';
      if(name.indexOf('l ')>=0||name.indexOf('l-')>=0||name.indexOf('sectional')>=0)return 'l-shape sofa';
      return '3 seater sofa';
    }
    if(name.indexOf('bed')>=0){
      if(name.indexOf('king')>=0)return 'king bed';
      if(name.indexOf('single')>=0)return 'single bed';
      return 'queen bed';
    }
    if(name.indexOf('dining')>=0&&name.indexOf('chair')<0){
      if(name.indexOf('4')>=0)return '4 seater dining';
      if(name.indexOf('8')>=0)return '8 seater dining';
      return '6 seater dining';
    }
    if(name.indexOf('chair')>=0)return 'dining chair';
    if(name.indexOf('coffee')>=0||name.indexOf('center table')>=0||name.indexOf('centre')>=0)return 'coffee table';
    if(name.indexOf('console')>=0)return 'console table';
    if(name.indexOf('tv')>=0)return 'tv unit';
    if(name.indexOf('wardrobe')>=0||name.indexOf('almirah')>=0)return 'wardrobe 3 door';
    if(name.indexOf('book')>=0||name.indexOf('shelf')>=0)return 'bookshelf';
    if(name.indexOf('bedside')>=0||name.indexOf('night')>=0)return 'bedside table';
    if(name.indexOf('side table')>=0)return 'side table';
    return null;
  }

  function opt(arr,sel){return arr.map(function(o){return '<option'+(o===sel?' selected':'')+'>'+o+'</option>'}).join('')}
  function esc(s){return (s||'').replace(/"/g,'&quot;')}

  // ---------------- COMPONENTS (photo-filled, editable) ----------------
  var comps=[];
  var project=[]; // [{name, total, qty}] — multiple items for whole-project costing
  var lastTotal=0;
  function defComp(part,material,method,size){
    var w='',h='';
    // parse "4x2" style size guess
    if(size){var m=(''+size).match(/([\d.]+)\s*[xX×]\s*([\d.]+)/);if(m){w=m[1];h=m[2]}}
    return {part:part||'Component',material:material||'',method:method||'wood',w:w,h:h,thick:1.5,
      metal:'SS 304',form:'pipe',kgft:0.9,runft:'',rate:method==='glass'?350:RATES.woodRate,
      qual:'Mid-range',finish:0,fab:65,fabric:'Bouclé / designer',foam:'High-density foam',
      woodFinish:'Melamine polish',board:'Plywood (MR)'}
  }
  window.SUITE={
    upd:function(i,k,v){comps[i][k]=v;recompute()},
    del:function(i){comps.splice(i,1);renderComps();recompute()},
    setBoard:function(i,v){comps[i].board=v;comps[i].rate=BOARDS[v]||comps[i].rate;renderComps();recompute()},
    delImg:function(i){imgList.splice(i,1);renderThumbs();if(!imgList.length){$('preview').style.display='none';$('goBtn').disabled=true;$('goBtn').textContent='📷 Pehle photo daalo';}else{$('goBtn').textContent=imgList.length>1?('✨ '+imgList.length+' Photo Se Costing'):'✨ Costing Nikaalo';}},
    delProj:function(i){project.splice(i,1);renderProject()},
    render:function(){renderComps();recompute()}
  };
  function renderComps(){
    var el=$('compList');if(!el)return;var html='';
    comps.forEach(function(c,i){
      html+='<div class="comp"><div class="top">'+
        '<input value="'+esc(c.part)+'" oninput="SUITE.upd('+i+',\'part\',this.value)">'+
        '<button class="del" onclick="SUITE.del('+i+')">✕</button></div>'+
        '<div class="row"><div><label>Type</label><select onchange="SUITE.upd('+i+',\'method\',this.value);SUITE.render()">'+
        opt(['wood','metal','glass','upholstery'],c.method)+'</select></div>'+
        '<div><label>Material</label><input value="'+esc(c.material)+'" oninput="SUITE.upd('+i+',\'material\',this.value)"></div></div>';
      if(c.method==='metal'){
        html+='<div class="row"><div><label>Metal</label><select onchange="SUITE.upd('+i+',\'metal\',this.value)">'+opt(Object.keys(METAL_RATE),c.metal)+'</select></div>'+
          '<div><label>Form</label><select onchange="SUITE.upd('+i+',\'form\',this.value);SUITE.render()">'+opt(['sheet','pipe'],c.form)+'</select></div></div>';
        if(c.form==='pipe')html+='<div class="row"><div><label>kg/ft</label><input type="number" value="'+c.kgft+'" oninput="SUITE.upd('+i+',\'kgft\',this.value)"></div><div><label>Run length ft</label><input type="number" value="'+c.runft+'" oninput="SUITE.upd('+i+',\'runft\',this.value)" placeholder="AI guess"></div></div>';
        else html+='<div class="row3"><input type="number" placeholder="W ft" value="'+c.w+'" oninput="SUITE.upd('+i+',\'w\',this.value)"><input type="number" placeholder="H ft" value="'+c.h+'" oninput="SUITE.upd('+i+',\'h\',this.value)"><select onchange="SUITE.upd('+i+',\'thick\',this.value)"><option value="">thick mm</option>'+opt(METAL_THICK,''+c.thick)+'</select></div>';
        html+='<div class="row"><div><label>Finish ₹/sqft</label><input type="number" value="'+c.finish+'" oninput="SUITE.upd('+i+',\'finish\',this.value)"></div><div><label>Fab ₹/kg</label><input type="number" value="'+c.fab+'" oninput="SUITE.upd('+i+',\'fab\',this.value)"></div></div>';
      } else if(c.method==='glass'){
        html+='<div class="row3"><input type="number" placeholder="W ft" value="'+c.w+'" oninput="SUITE.upd('+i+',\'w\',this.value)"><input type="number" placeholder="H ft" value="'+c.h+'" oninput="SUITE.upd('+i+',\'h\',this.value)"><input type="number" placeholder="₹/sqft" value="'+c.rate+'" oninput="SUITE.upd('+i+',\'rate\',this.value)"></div>';
      } else if(c.method==='upholstery'){
        html+='<div class="row"><div><label>W ft</label><input type="number" value="'+c.w+'" oninput="SUITE.upd('+i+',\'w\',this.value)"></div><div><label>H ft</label><input type="number" value="'+c.h+'" oninput="SUITE.upd('+i+',\'h\',this.value)"></div></div>';
        html+='<div class="row"><div><label>Fabric</label><select onchange="SUITE.upd('+i+',\'fabric\',this.value)">'+opt(Object.keys(UPH_FABRIC),c.fabric)+'</select></div><div><label>Foam</label><select onchange="SUITE.upd('+i+',\'foam\',this.value)">'+opt(Object.keys(UPH_FOAM),c.foam)+'</select></div></div>';
      } else {
        html+='<div class="row"><div><label>Board Material</label><select onchange="SUITE.setBoard('+i+',this.value)">'+opt(Object.keys(BOARDS),c.board)+'</select></div>'+
          '<div><label>₹/sqft (auto)</label><input type="number" value="'+c.rate+'" oninput="SUITE.upd('+i+',\'rate\',this.value)"></div></div>';
        html+='<div class="row3"><input type="number" placeholder="W ft" value="'+c.w+'" oninput="SUITE.upd('+i+',\'w\',this.value)"><input type="number" placeholder="H ft" value="'+c.h+'" oninput="SUITE.upd('+i+',\'h\',this.value)"><select onchange="SUITE.upd('+i+',\'thick\',this.value)"><option value="">thick mm</option>'+opt(WOOD_THICK,''+c.thick)+'</select></div>';
        html+='<div class="row"><div><label>Quality</label><select onchange="SUITE.upd('+i+',\'qual\',this.value)">'+opt(Object.keys(QUALITY),c.qual)+'</select></div>'+
          '<div><label>Finish / Polish</label><select onchange="SUITE.upd('+i+',\'woodFinish\',this.value)">'+opt(Object.keys(FINISH).filter(function(f){return f.indexOf('metal')<0}),c.woodFinish)+'</select></div></div>';
      }
      html+='</div>';
    });
    el.innerHTML=html;
  }
  $('addCompBtn').addEventListener('click',function(){comps.push(defComp('New part','','wood'));renderComps();recompute()});

  function compCost(c){
    var w=parseFloat(c.w)||0,h=parseFloat(c.h)||0;
    if(c.method==='metal'){
      var d=METAL_DENSITY[c.metal]||8,rk=METAL_RATE[c.metal]||210,wt;
      if(c.form==='pipe')wt=(parseFloat(c.kgft)||0.9)*(parseFloat(c.runft)||0);
      else wt=(w*h*0.092903)*((parseFloat(c.thick)||1.5)/1000)*(d*1000);
      return {cost:wt*rk+wt*(parseFloat(c.fab)||65)+(w*h*2)*(parseFloat(c.finish)||0),detail:c.metal+' '+wt.toFixed(1)+'kg',wt:wt};
    } else if(c.method==='glass'){return {cost:w*h*(parseFloat(c.rate)||350),detail:(w*h).toFixed(1)+'sqft glass',wt:w*h*3};}
    else if(c.method==='upholstery'){var f=UPH_FABRIC[c.fabric]||380,fm=UPH_FOAM[c.foam]||1;return {cost:(w*h*1.8)*f*fm+(w*h*200),detail:(w*h).toFixed(1)+'sqft uph',wt:w*h*1.5};}
    else {var base=w*h*(parseFloat(c.rate)||RATES.woodRate)*(QUALITY[c.qual]||1);var fin=(w*h)*(FINISH[c.woodFinish]||0);return {cost:base+fin,detail:(w*h).toFixed(1)+'sqft wood'+(c.woodFinish&&c.woodFinish!=='None / raw'?' + '+c.woodFinish.split(' ')[0]:''),wt:w*h*1.2};}
  }

  // ---------------- COMPUTE (inline result) ----------------
  function recompute(){
    if(!comps.length){$('result').style.display='none';return}
    var qty=Math.max(1,parseFloat(($('qty')||{}).value)||1);
    var sub=0,wt=0,rows=[];
    var colors=['#e8b04c','#3a4654','#7bb38a','#bf6614','#8a7a64','#5a9a76','#2d5a78'];
    comps.forEach(function(c,i){var r=compCost(c);sub+=r.cost;wt+=r.wt;
      rows.push([c.part+' ('+c.method+' · '+r.detail+')',colors[i%colors.length],r.cost*qty])});
    var labour=sub*RATES.labour;
    var cost=sub+labour;
    var profit=cost*(RATES.profit/100);
    var beforeGst=cost+profit;
    var gst=beforeGst*(RATES.gst/100);
    var unit=beforeGst+gst;
    var rnd=RATES.round||1;
    var total=Math.round((unit*qty)/rnd)*rnd;
    lastTotal=total;
    rows.push(['Labour & finishing','#8a7a64',labour*qty]);
    rows.push(['Profit ('+RATES.profit+'%)','#1f7a4d',profit*qty]);
    rows.push(['GST ('+RATES.gst+'%)','#14572f',gst*qty]);
    $('grandTotal').textContent=rupee(total);
    $('perSub').textContent='Range '+rupee(Math.round(total*0.88/500)*500)+' – '+rupee(Math.round(total*1.15/500)*500)+' · '+qty+' unit(s)';
    $('costPrice').textContent=rupee(cost*qty);
    $('profitAmt').textContent=rupee(profit*qty);
    var html='';rows.forEach(function(r){if(Math.abs(r[2])<1)return;
      html+='<div class="brow"><span class="lab"><span class="ic" style="background:'+r[1]+'"></span>'+r[0]+'</span><span class="val">'+rupee(r[2])+'</span></div>'});
    $('breakdown').innerHTML=html;
    $('result').style.display='block';
  }

  // ---------------- PHOTO FLOW ----------------
  var imgList=[],mediaType=null,aiData=null,fileKind='image';
  // imgList = [{data, media, kind, name}] — multiple angles of SAME item
  $('drop').addEventListener('click',function(){$('file').click()});
  $('file').addEventListener('change',function(){
    if(this.files&&this.files.length){
      for(var k=0;k<this.files.length;k++)handleFile(this.files[k]);
    }
  });
  function handleFile(f){
    var isPdf=f.type==='application/pdf'||/\.pdf$/i.test(f.name);
    var isImg=f.type.startsWith('image/');
    if(!isPdf&&!isImg){$('err').style.display='block';$('err').textContent='Sirf image (JPG/PNG) ya PDF drawing upload karo.';return;}
    var r=new FileReader();r.onload=function(e){
      imgList.push({data:e.target.result.split(',')[1],media:isPdf?'application/pdf':f.type,kind:isPdf?'pdf':'image',name:f.name,url:e.target.result});
      renderThumbs();
      if($('catBox'))$('catBox').style.display='block';
      $('preview').style.display='block';$('goBtn').disabled=false;
      $('goBtn').textContent=imgList.length>1?('✨ '+imgList.length+' Photo Se Costing'):(isPdf?'✨ Drawing Se Costing':'✨ Costing Nikaalo');
    };
    r.readAsDataURL(f)}
  function renderThumbs(){
    var h='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">';
    imgList.forEach(function(im,i){
      if(im.kind==='pdf')h+='<div style="position:relative;padding:18px 10px;background:#f0f0f0;border-radius:8px;font-size:12px;font-weight:600">📄 PDF<span onclick="SUITE.delImg('+i+')" style="position:absolute;top:-6px;right:-6px;background:#b3261e;color:#fff;border-radius:50%;width:18px;height:18px;text-align:center;line-height:18px;cursor:pointer;font-size:11px">✕</span></div>';
      else h+='<div style="position:relative"><img src="'+im.url+'" style="width:70px;height:70px;object-fit:cover;border-radius:8px"><span onclick="SUITE.delImg('+i+')" style="position:absolute;top:-6px;right:-6px;background:#b3261e;color:#fff;border-radius:50%;width:18px;height:18px;text-align:center;line-height:18px;cursor:pointer;font-size:11px">✕</span></div>';
    });
    h+='</div><div style="font-size:12px;color:#7a6f5e">'+(imgList.length>1?'📐 '+imgList.length+' angles — ek hi item ke front/side/inside. AI sabko milake samjhega.':'Aur angles add kar sakte ho (front/side/inside) — better accuracy')+'</div>';
    $('thumbs').innerHTML=h;
  }

  $('goBtn').addEventListener('click',analyze);
  async function analyze(){
    if(!imgList.length)return;
    $('err').style.display='none';$('idcard').style.display='none';
    $('loading').style.display='block';$('goBtn').disabled=true;
    var anyPdf=imgList.some(function(x){return x.kind==='pdf'});
    var multi=imgList.length>1;
    var userCat=($('catSelect')||{}).value||'';
    var prompt='You are a furniture & metal-product expert. '+
      (anyPdf?'One or more inputs are technical DRAWINGS/PDF. READ all dimensions, measurements, material notes from them. Use ACTUAL dimensions shown — do NOT guess if a number is given. ':'')+
      (multi?'These '+imgList.length+' images are DIFFERENT ANGLES (front/side/inside) of the SAME single furniture item. Combine all views to identify it accurately and estimate sizes better. ':'Identify this item from the photo. ')+
      (userCat?'The user has CONFIRMED this item category is "'+userCat+'" — use this exact category, do not change it. Focus on identifying materials, finish and components. ':'')+
      'Break it into priced components. Respond ONLY with JSON (no markdown): '+
      '{"furniture_type":"specific name","category":"'+(userCat?userCat:'one of: single bed/queen bed/king bed/1 seater sofa/2 seater sofa/3 seater sofa/4 seater sofa/l-shape sofa/2 seater dining/4 seater dining/6 seater dining/8 seater dining/dining chair/coffee table/side table/console table/tv unit/wardrobe 2 door/wardrobe 3 door/wardrobe 4 door/bookshelf/chest of drawers/bedside table/other')+'","components":[{"part":"e.g. frame/seat/top/carcass","material":"e.g. SS 304, solid wood, veneer, bouclé fabric, glass","method":"metal/wood/glass/upholstery","approx_size":"'+(anyPdf?'EXACT size from drawing':'best guess like 2x2 ft')+'"}],"material_guess":"overall","build_quality":"budget/mid/premium/luxury","confidence":"low/medium/high"}. '+
      (userCat?'':'Pick the closest "category". ')+'ALWAYS provide at least one component. Use method "upholstery" for cushioned/fabric/leather, "metal" for steel/brass frames (approx_size as running length in ft), "wood" for ply/veneer/solid wood, "glass" for glass.'+
      (anyPdf?' Set confidence "high" if dimensions readable.':(multi?' Higher confidence since multiple angles given.':(userCat?' Higher confidence since category confirmed.':' Estimate sizes from typical proportions.')));
    try{
      var res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({images:imgList.map(function(x){return {data:x.data,media:x.media,kind:x.kind}}),prompt:prompt})});
      var data=await res.json();if(data.error)throw new Error(data.error);
      var text=(data.text||'').replace(/```json|```/g,'').trim();
      aiData=JSON.parse(text);
      applyAi(aiData);
    }catch(e){$('loading').style.display='none';$('goBtn').disabled=false;$('err').style.display='block';
      $('err').textContent='AI analyze nahi kar paya: '+e.message+' (Backend deploy hone ke baad chalega.)'}
  }

  function applyAi(d){
    $('loading').style.display='none';$('goBtn').disabled=false;
    // user-confirmed category takes priority over AI
    var userCat=($('catSelect')||{}).value||'';
    if(userCat)d.category=userCat;
    // thumb-rule: detect standard category and its dimensions
    var thumbKey=(userCat&&THUMB[userCat]?userCat:null)||matchThumb(d.category)||matchThumb(d.furniture_type);
    var thumb=thumbKey?THUMB[thumbKey]:null;
    var thumbLft=thumb?(thumb.L/12):0, thumbWft=thumb?(thumb.W/12):0; // inches → ft
    // id card
    $('idcard').style.display='block';
    $('idName').textContent=d.furniture_type||'Furniture';
    var m='Material: '+(d.material_guess||'?')+' · Quality: '+(d.build_quality||'?')+' · AI conf: <b>'+(d.confidence||'low').toUpperCase()+'</b>';
    if(thumb)m+='<br>📐 Standard size applied: <b>'+thumbKey+'</b> ('+thumb.L+'×'+thumb.W+'×'+thumb.H+' in) — edit if needed';
    $('idMeta').innerHTML=m;
    // build components
    var list=(d.components&&d.components.length)?d.components:[{part:d.furniture_type||'Item',material:d.material_guess||'',method:'wood',approx_size:''}];
    comps=list.map(function(c){
      var mm=(c.method||'').toLowerCase();
      if(['metal','wood','glass','upholstery'].indexOf(mm)<0){var mat=(c.material||'').toLowerCase();
        mm=(mat.indexOf('fabric')>=0||mat.indexOf('uphol')>=0||mat.indexOf('boucl')>=0||mat.indexOf('leather')>=0||mat.indexOf('cushion')>=0||mat.indexOf('seat')>=0)?'upholstery':
          (mat.indexOf('ss')>=0||mat.indexOf('steel')>=0||mat.indexOf('brass')>=0||mat.indexOf('metal')>=0||mat.indexOf('iron')>=0)?'metal':
          mat.indexOf('glass')>=0?'glass':'wood'}
      var comp=defComp(c.part,c.material,mm,c.approx_size);
      // for metal with running length guess in approx_size (e.g. "30 ft")
      if(mm==='metal'){var rl=(''+(c.approx_size||'')).match(/([\d.]+)\s*(ft|feet|')/i);if(rl){comp.form='pipe';comp.runft=rl[1]}}
      // THUMB-RULE: if no size from AI, use standard dimensions
      if(thumb){
        if(mm==='upholstery'||mm==='wood'||mm==='glass'){
          if(!comp.w||parseFloat(comp.w)<=0)comp.w=thumbLft.toFixed(1);
          if(!comp.h||parseFloat(comp.h)<=0)comp.h=thumbWft.toFixed(1);
        } else if(mm==='metal'&&comp.form==='pipe'&&(!comp.runft||parseFloat(comp.runft)<=0)){
          // estimate frame running length from perimeter of standard size
          comp.runft=Math.round(2*(thumbLft+thumbWft)+4*(thumb.H/12));
        }
      }
      // THICKNESS suggestion by category type
      var catType=thumb?thumb.cat:null;
      if(catType&&TYP_THICK[catType]){
        if(mm==='metal')comp.thick=TYP_THICK[catType].metal;
        else if(mm==='wood')comp.thick=TYP_THICK[catType].wood;
      }
      // part-specific wood thickness (back panel thin, top thick)
      if(mm==='wood'){var pn=(c.part||'').toLowerCase();
        if(pn.indexOf('back')>=0)comp.thick='6';
        else if(pn.indexOf('top')>=0&&catType==='dining')comp.thick='25';
        else if(pn.indexOf('shutter')>=0||pn.indexOf('door')>=0)comp.thick='18';
      }
      // apply quality from build_quality
      var bq=(d.build_quality||'').toLowerCase();
      if(bq.indexOf('premium')>=0)comp.qual='Premium';else if(bq.indexOf('lux')>=0)comp.qual='Luxury';else if(bq.indexOf('budget')>=0)comp.qual='Budget';
      // detect finish from material text
      if(mm==='wood'){
        var mat2=(c.material||'').toLowerCase();
        // detect board material
        if(mat2.indexOf('solid')>=0||mat2.indexOf('sheesham')>=0||mat2.indexOf('rosewood')>=0)comp.board='Solid wood (sheesham)';
        else if(mat2.indexOf('teak')>=0||mat2.indexOf('sagwan')>=0)comp.board='Solid wood (teak)';
        else if(mat2.indexOf('mango')>=0||mat2.indexOf('rubber')>=0||mat2.indexOf('mdf')<0&&mat2.indexOf('wood')>=0&&mat2.indexOf('ply')<0)comp.board='Solid wood (mango/rubber)';
        else if(mat2.indexOf('mdf')>=0)comp.board=mat2.indexOf('lam')>=0?'MDF (pre-laminated)':'MDF (plain)';
        else if(mat2.indexOf('block')>=0)comp.board='Block board';
        else if(mat2.indexOf('particle')>=0)comp.board='Particle board';
        else if(mat2.indexOf('hdhmr')>=0)comp.board='HDHMR';
        else if(mat2.indexOf('wpc')>=0)comp.board='WPC board';
        else if(mat2.indexOf('marine')>=0||mat2.indexOf('bwp')>=0)comp.board='Plywood (BWP/marine)';
        else if(mat2.indexOf('ply')>=0)comp.board='Plywood (MR)';
        if(comp.board&&BOARDS[comp.board])comp.rate=BOARDS[comp.board];
        if(mat2.indexOf('veneer')>=0)comp.woodFinish='Veneer + melamine';
        else if(mat2.indexOf('pu')>=0||mat2.indexOf('polyurethane')>=0)comp.woodFinish='PU polish (matt)';
        else if(mat2.indexOf('duco')>=0||mat2.indexOf('paint')>=0)comp.woodFinish='Duco / paint';
        else if(mat2.indexOf('epoxy')>=0||mat2.indexOf('resin')>=0)comp.woodFinish='Epoxy resin finish';
        else if(mat2.indexOf('acrylic')>=0)comp.woodFinish='Acrylic';
        else if(mat2.indexOf('laminate')>=0)comp.woodFinish='Lamination';
        else if(mat2.indexOf('gloss')>=0||mat2.indexOf('polyester')>=0)comp.woodFinish='Polyester high-gloss';
      }
      return comp;
    });
    renderComps();
    show('editCard');show('rateCard');show('cutCard');show('dxfCard');show('boqCard');show('finalActions');
    recompute();
    $('result').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function show(id){$(id).classList.remove('hidep')}
  function hide(id){$(id).classList.add('hidep')}

  $('resetBtn').addEventListener('click',function(){
    imgList=[];aiData=null;comps=[];
    $('preview').style.display='none';if($('thumbs'))$('thumbs').innerHTML='';
    if($('catBox'))$('catBox').style.display='none';if($('catSelect'))$('catSelect').value='';
    $('idcard').style.display='none';$('result').style.display='none';
    hide('editCard');hide('rateCard');hide('cutCard');hide('dxfCard');hide('boqCard');hide('finalActions');
    if($('boqResult')){$('boqResult').style.display='none';$('boqResult').innerHTML='';hide('boqPdfBtn');}
    $('goBtn').disabled=true;$('goBtn').textContent='📷 Pehle photo daalo';
    $('file').value='';
    window.scrollTo({top:0,behavior:'smooth'});
  });

  // ---------------- DETAILED COSTING / BOQ (AI) ----------------
  var boqData=null;
  if($('boqBtn'))$('boqBtn').addEventListener('click',detailedBOQ);
  async function detailedBOQ(){
    if(!comps.length){return}
    $('boqErr').style.display='none';$('boqResult').style.display='none';hide('boqPdfBtn');
    $('boqLoading').style.display='block';$('boqBtn').disabled=true;
    // gather context: item, components, dimensions, user's rates
    var itemName=($('idName')||{}).textContent||'Furniture';
    var compText=comps.map(function(c){
      return '- '+c.part+' | method:'+c.method+' | material:'+(c.material||'?')+
        (c.method==='wood'?' | size:'+(c.w||'?')+'x'+(c.h||'?')+'ft | finish:'+(c.woodFinish||'?'):'')+
        (c.method==='metal'?' | running:'+(c.runft||'?')+'ft | metal:'+c.metal:'')+
        ' | quality:'+c.qual;
    }).join('\n');
    var ratesText='Wood ₹'+RATES.woodRate+'/sqft, Labour factor '+RATES.labour+', Profit '+RATES.profit+'%, GST '+RATES.gst+'%';
    var calcTotal=($('grandTotal')||{}).textContent||'';
    var prompt='You are a senior furniture production engineer & estimator for the India (Delhi-NCR / UP) market. '+
      'Make a DETAILED costing report for this item. Item: "'+itemName+'". Components:\n'+compText+'\n'+
      'User business rates: '+ratesText+'. Tool calculated approx total: '+calcTotal+'. '+
      'Respond ONLY with JSON (no markdown):{'+
      '"boq":[{"item":"e.g. 18mm Plywood","qty":"e.g. 3.5","unit":"8x4 sheets/sqft/nos/litre/metre","rate":number_inr,"amount":number_inr}],'+
      '"hardware":[{"item":"e.g. Soft-close hinge","qty":number,"rate":number_inr,"amount":number_inr}],'+
      '"consumables":[{"item":"e.g. edge banding/adhesive/screws","qty":"","amount":number_inr}],'+
      '"labour":{"carpentry":number_inr,"polish_finish":number_inr,"assembly":number_inr,"total":number_inr},'+
      '"wastage_pct":number,"wastage_amount":number_inr,'+
      '"cost_layers":{"factory_cost":number_inr,"dealer_price":number_inr,"customer_price":number_inr,"profit_margin_pct":number},'+
      '"manufacturing":{"difficulty":"easy/medium/hard","cnc_vs_manual":"short advice","time_days":number},'+
      '"savings":["tip1","tip2","tip3"],'+
      '"summary":"2-line summary"}. '+
      'Use realistic India market rates. Make numbers consistent (amounts = qty*rate). Keep BOQ practical for a furniture workshop.';
    try{
      var res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt:prompt,textOnly:true})});
      var data=await res.json();if(data.error)throw new Error(data.error);
      var text=(data.text||'').replace(/```json|```/g,'').trim();
      boqData=JSON.parse(text);
      renderBOQ(boqData);
    }catch(e){$('boqLoading').style.display='none';$('boqBtn').disabled=false;
      $('boqErr').style.display='block';$('boqErr').textContent='Report nahi ban payi: '+e.message+' (Backend deploy ke baad chalega.)';}
  }
  function rrow(label,val){return '<div class="brow"><span class="lab">'+label+'</span><span class="val">'+val+'</span></div>'}
  function renderBOQ(d){
    $('boqLoading').style.display='none';$('boqBtn').disabled=false;
    var h='';
    function tbl(title,arr,cols){
      if(!arr||!arr.length)return'';
      var s='<div style="font-weight:800;color:#bf6614;margin:14px 0 6px;font-size:14px">'+title+'</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="background:#f3ece0">';
      cols.forEach(function(c){s+='<th style="text-align:left;padding:6px;border:1px solid #e0d6c4">'+c.h+'</th>'});
      s+='</tr>';
      arr.forEach(function(r){s+='<tr>';cols.forEach(function(c){var v=r[c.k];s+='<td style="padding:6px;border:1px solid #e0d6c4">'+(c.rupee&&v!=null?rupee(v):(v!=null?v:''))+'</td>'});s+='</tr>'});
      s+='</table></div>';return s;
    }
    h+=tbl('📦 BOQ — Material',d.boq,[{h:'Item',k:'item'},{h:'Qty',k:'qty'},{h:'Unit',k:'unit'},{h:'Rate',k:'rate',rupee:true},{h:'Amount',k:'amount',rupee:true}]);
    h+=tbl('🔩 Hardware',d.hardware,[{h:'Item',k:'item'},{h:'Qty',k:'qty'},{h:'Rate',k:'rate',rupee:true},{h:'Amount',k:'amount',rupee:true}]);
    h+=tbl('🧴 Consumables',d.consumables,[{h:'Item',k:'item'},{h:'Qty',k:'qty'},{h:'Amount',k:'amount',rupee:true}]);
    if(d.labour){h+='<div style="font-weight:800;color:#bf6614;margin:14px 0 6px;font-size:14px">👷 Labour</div>';
      h+=rrow('Carpentry',rupee(d.labour.carpentry||0))+rrow('Polish/Finish',rupee(d.labour.polish_finish||0))+rrow('Assembly',rupee(d.labour.assembly||0))+rrow('<b>Labour Total</b>','<b>'+rupee(d.labour.total||0)+'</b>');}
    if(d.wastage_amount!=null)h+=rrow('Wastage ('+(d.wastage_pct||0)+'%)',rupee(d.wastage_amount));
    if(d.cost_layers){var L=d.cost_layers;
      h+='<div style="font-weight:800;color:#bf6614;margin:14px 0 6px;font-size:14px">💰 Price Layers</div>';
      h+='<div style="background:#fff7ec;border-radius:10px;padding:10px">';
      h+=rrow('🏭 Factory Cost',rupee(L.factory_cost||0));
      h+=rrow('🤝 Dealer Price',rupee(L.dealer_price||0));
      h+=rrow('🛒 Customer Price','<b style="color:#bf6614">'+rupee(L.customer_price||0)+'</b>');
      h+=rrow('📈 Profit Margin',(L.profit_margin_pct||0)+'%');
      h+='</div>';}
    if(d.manufacturing){var M=d.manufacturing;
      h+='<div style="font-weight:800;color:#bf6614;margin:14px 0 6px;font-size:14px">⚙️ Manufacturing</div>';
      h+=rrow('Difficulty',(M.difficulty||'').toUpperCase())+rrow('CNC vs Manual',M.cnc_vs_manual||'')+rrow('Time',(M.time_days||'?')+' days');}
    if(d.savings&&d.savings.length){h+='<div style="font-weight:800;color:#1f7a4d;margin:14px 0 6px;font-size:14px">💡 Cost Kam Karne Ke Suggestions</div><ul style="margin:0;padding-left:18px;font-size:13px;color:#3a4654">';
      d.savings.forEach(function(s){h+='<li style="margin-bottom:4px">'+s+'</li>'});h+='</ul>';}
    if(d.summary)h+='<div style="margin-top:12px;padding:10px;background:#f3ece0;border-radius:8px;font-size:13px;font-style:italic">'+d.summary+'</div>';
    $('boqResult').innerHTML=h;$('boqResult').style.display='block';show('boqPdfBtn');
    $('boqResult').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  if($('boqPdfBtn'))$('boqPdfBtn').addEventListener('click',function(){window.print()});

  // ---------------- WhatsApp share ----------------
  if($('waBtn'))$('waBtn').addEventListener('click',function(){
    var itemName=($('idName')||{}).textContent||'Furniture';
    var total=($('grandTotal')||{}).textContent||'';
    var lines=['*Furniture Kranti — Costing*','',' *'+itemName+'*',''];
    // components breakdown
    comps.forEach(function(c){
      var r=compCost(c);
      lines.push('• '+c.part+' ('+(c.method)+'): '+rupee(r.cost));
    });
    lines.push('');
    lines.push('*Total (approx): '+total+'*');
    // BOQ price layers if available
    if(typeof boqData!=='undefined'&&boqData&&boqData.cost_layers){
      var L=boqData.cost_layers;
      lines.push('');
      lines.push('Customer Price: '+rupee(L.customer_price||0));
    }
    lines.push('');
    lines.push('_Approximate — final quote site measurement ke baad._');
    lines.push('Furniture Kranti · kaarukranti.in');
    var msg=encodeURIComponent(lines.join('\n'));
    window.open('https://wa.me/?text='+msg,'_blank');
  });

  // ---------------- QUOTE PDF (short & detailed) ----------------
  function pdfHeader(doc,W,sub){
    doc.setFillColor(29,24,18);doc.rect(0,0,W,70,'F');
    doc.setFillColor(255,103,31);doc.rect(0,70,W,4,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('FURNITURE KRANTI',40,35);
    doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(255,180,120);doc.text(sub||'Cost Estimate',40,55);
    doc.setFontSize(8);doc.setTextColor(255,210,170);doc.text('kaarukranti.in',W-120,55);
  }
  function quoteData(){
    var itemName=($('idName')||{}).textContent||'Furniture';
    var qty=Math.max(1,parseFloat(($('qty')||{}).value)||1);
    var rows=comps.map(function(c){var r=compCost(c);return {part:c.part,method:c.method,detail:r.detail,cost:r.cost*qty}});
    var total=lastTotal;
    return {itemName:itemName,qty:qty,rows:rows,total:total};
  }
  if($('pdfShortBtn'))$('pdfShortBtn').addEventListener('click',function(){
    if(!comps.length||!window.jspdf)return;
    var q=quoteData();var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({unit:'pt',format:'a4'});
    var W=doc.internal.pageSize.getWidth();pdfHeader(doc,W,'Cost Estimate (Summary)');
    var y=100;doc.setTextColor(40,30,20);doc.setFontSize(11);
    doc.setFont('helvetica','bold');doc.text('Item: ',40,y);doc.setFont('helvetica','normal');doc.text(q.itemName+(q.qty>1?'  (Qty '+q.qty+')':''),80,y);
    y+=16;doc.setFont('helvetica','bold');doc.text('Date: ',40,y);doc.setFont('helvetica','normal');doc.text(new Date().toLocaleDateString('en-IN'),80,y);
    // big total box
    y+=24;doc.setFillColor(255,247,236);doc.roundedRect(40,y,W-80,60,8,8,'F');
    doc.setTextColor(120,80,20);doc.setFontSize(10);doc.text('ESTIMATED PRICE (approx)',55,y+24);
    doc.setTextColor(191,102,20);doc.setFont('helvetica','bold');doc.setFontSize(22);doc.text('Rs '+Math.round(q.total).toLocaleString('en-IN'),55,y+48);
    y+=82;doc.setFontSize(8);doc.setTextColor(120,110,95);doc.setFont('helvetica','normal');
    doc.text('Approximate estimate. Final quote after site measurement. GST included. Valid 15 days.',40,y);
    doc.text('Furniture Kranti  |  kaarukranti.in  |  Photo Se Sahi Daam',40,y+14);
    doc.save((q.itemName||'quote').replace(/[^a-z0-9]/gi,'_')+'_quote.pdf');
  });
  if($('pdfFullBtn'))$('pdfFullBtn').addEventListener('click',function(){
    if(!comps.length||!window.jspdf)return;
    var q=quoteData();var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({unit:'pt',format:'a4'});
    var W=doc.internal.pageSize.getWidth();pdfHeader(doc,W,'Detailed Cost Estimate');
    var y=100;doc.setTextColor(40,30,20);doc.setFontSize(11);
    doc.setFont('helvetica','bold');doc.text('Item: ',40,y);doc.setFont('helvetica','normal');doc.text(q.itemName+(q.qty>1?'  (Qty '+q.qty+')':''),80,y);
    y+=16;doc.setFont('helvetica','bold');doc.text('Date: ',40,y);doc.setFont('helvetica','normal');doc.text(new Date().toLocaleDateString('en-IN'),80,y);
    // components table
    var body=q.rows.map(function(r,i){return [i+1,r.part,r.method,r.detail,'Rs '+Math.round(r.cost).toLocaleString('en-IN')]});
    doc.autoTable({startY:y+14,head:[['#','Component','Type','Detail','Amount']],body:body,theme:'grid',
      headStyles:{fillColor:[29,24,18],textColor:[255,255,255],fontSize:9},bodyStyles:{fontSize:9},
      alternateRowStyles:{fillColor:[250,246,238]},margin:{left:40,right:40}});
    var fy=doc.lastAutoTable.finalY+16;
    // BOQ if available
    if(typeof boqData!=='undefined'&&boqData&&boqData.cost_layers){
      var L=boqData.cost_layers;
      doc.setFontSize(10);doc.setTextColor(191,102,20);doc.setFont('helvetica','bold');doc.text('Price Breakdown',40,fy);fy+=6;
      var lb=[['Factory Cost','Rs '+Math.round(L.factory_cost||0).toLocaleString('en-IN')],['Dealer Price','Rs '+Math.round(L.dealer_price||0).toLocaleString('en-IN')],['Customer Price','Rs '+Math.round(L.customer_price||0).toLocaleString('en-IN')]];
      doc.autoTable({startY:fy+6,body:lb,theme:'plain',bodyStyles:{fontSize:10},margin:{left:40,right:300}});
      fy=doc.lastAutoTable.finalY+10;
    }
    // total box
    doc.setFillColor(255,247,236);doc.roundedRect(40,fy,W-80,54,8,8,'F');
    doc.setTextColor(120,80,20);doc.setFontSize(10);doc.text('TOTAL ESTIMATED PRICE (approx, GST incl.)',55,fy+22);
    doc.setTextColor(191,102,20);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('Rs '+Math.round(q.total).toLocaleString('en-IN'),55,fy+44);
    fy+=74;doc.setFontSize(8);doc.setTextColor(120,110,95);doc.setFont('helvetica','normal');
    doc.text('Approximate estimate. Final quote after site measurement. Valid 15 days.',40,fy);
    doc.text('Furniture Kranti  |  kaarukranti.in  |  Photo Se Sahi Daam',40,fy+14);
    doc.save((q.itemName||'quote').replace(/[^a-z0-9]/gi,'_')+'_detailed_quote.pdf');
  });

  // ---------------- PROJECT (multiple items) ----------------
  function renderProject(){
    if(!project.length){$('projectCard').style.display='none';return}
    $('projectCard').style.display='block';
    var gt=0,h='';
    project.forEach(function(p,i){gt+=p.total;
      h+='<div class="brow"><span class="lab">'+(i+1)+'. '+p.name+(p.qty>1?' ×'+p.qty:'')+'</span><span class="val">'+rupee(p.total)+' <span onclick="SUITE.delProj('+i+')" style="color:#b3261e;cursor:pointer;margin-left:6px">✕</span></span></div>';
    });
    $('projectList').innerHTML=h;
    $('projectTotal').textContent=rupee(gt);
  }
  if($('addItemBtn'))$('addItemBtn').addEventListener('click',function(){
    if(!comps.length)return;
    var nm=($('idName')||{}).textContent||'Item';
    var qty=Math.max(1,parseFloat(($('qty')||{}).value)||1);
    project.push({name:nm,total:lastTotal,qty:qty});
    renderProject();
    $('projectCard').scrollIntoView({behavior:'smooth',block:'nearest'});
    // ready for next item
    $('addItemBtn').textContent='✓ Added! Nayi photo daalo agle item ke liye';
    setTimeout(function(){$('addItemBtn').textContent='➕ Is Item Ko Project Me Add Karo'},2000);
  });
  if($('projWaBtn'))$('projWaBtn').addEventListener('click',function(){
    if(!project.length)return;
    var lines=['*Furniture Kranti — Project Costing*',''];
    var gt=0;
    project.forEach(function(p,i){gt+=p.total;lines.push((i+1)+'. '+p.name+(p.qty>1?' ×'+p.qty:'')+' — '+rupee(p.total))});
    lines.push('');lines.push('*Project Total: '+rupee(gt)+'*');
    lines.push('');lines.push('_Approximate — final quote site measurement ke baad._');
    lines.push('Furniture Kranti · kaarukranti.in');
    window.open('https://wa.me/?text='+encodeURIComponent(lines.join('\n')),'_blank');
  });

  // qty change
  document.addEventListener('input',function(e){if(e.target.id==='qty')recompute()});

  // ---------------- CUTTING LIST ----------------
  var cutData=null;
  function genCutting(){
    var t=18;
    var H=+$('cutH').value||2100,W=+$('cutW').value||1800,D=+$('cutD').value||600;
    var shut=+$('cutShut').value||0,shelf=+$('cutShelf').value||0,draw=+$('cutDraw').value||0;
    var bays=Math.max(1,Math.ceil(shut/2));
    var panels=[];
    panels.push(['Side panel (gable)',H,D,2]);
    panels.push(['Top + Bottom',W-2*t,D,2]);
    panels.push(['Back panel',H,W,1]);
    if(shelf>0)panels.push(['Shelf',(W/bays)-2*t,D-20,shelf]);
    var part=Math.max(0,bays-1);if(part>0)panels.push(['Vertical partition',H-2*t,D,part]);
    if(shut>0)panels.push(['Shutter',H-6,(W/shut)-6,shut]);
    if(draw>0){
      panels.push(['Drawer front',200,(W/bays)-6,draw]);
      panels.push(['Drawer side',180,D-50,draw*2]);
      panels.push(['Drawer back+base',(W/bays)-2*t,D-50,draw*2]);
    }
    panels=panels.filter(function(p){return p[3]>0});

    var board=$('cutBoard').selectedOptions[0];
    var density=+board.dataset.d||700,thick=(+board.dataset.t||18)/1000;
    var waste=1+(+$('cutWaste').value||0)/100;
    var rows=[],areaM2=0,totPanels=0;
    panels.forEach(function(p){
      var aOne=(p[0+1]/1000)*(p[2]/1000);
      var aTot=aOne*p[3];areaM2+=aTot;totPanels+=p[3];
      rows.push({name:p[0],L:p[1],W:p[2],qty:p[3],areaSqft:aTot*10.7639,wt:aOne*thick*density*p[3]});
    });
    var areaWaste=areaM2*waste;
    var areaSqft=areaWaste*10.7639;
    var weight=rows.reduce(function(a,r){return a+r.wt},0)*waste;
    var sheets=areaWaste/(2.440*1.220);
    cutData={rows:rows,areaSqft:areaSqft,weight:weight,sheets:sheets,panels:totPanels,
      name:$('cutName').value||'Wardrobe',board:board.text};

    var html='<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:6px">'+
      '<thead><tr style="background:#16120d;color:#fff"><th style="padding:6px;text-align:left">#</th><th style="padding:6px;text-align:left">Panel</th><th style="padding:6px;text-align:right">L mm</th><th style="padding:6px;text-align:right">W mm</th><th style="padding:6px;text-align:right">Qty</th><th style="padding:6px;text-align:right">Wt kg</th></tr></thead><tbody>';
    rows.forEach(function(r,i){html+='<tr style="border-bottom:1px solid #e0d8c8"><td style="padding:6px">'+(i+1)+'</td><td style="padding:6px">'+r.name+'</td><td style="padding:6px;text-align:right">'+Math.round(r.L)+'</td><td style="padding:6px;text-align:right">'+Math.round(r.W)+'</td><td style="padding:6px;text-align:right">'+r.qty+'</td><td style="padding:6px;text-align:right">'+r.wt.toFixed(1)+'</td></tr>'});
    html+='</tbody></table>';
    $('cutTableWrap').innerHTML=html;
    $('cutArea').textContent=areaSqft.toFixed(1);
    $('cutWeight').textContent=weight.toFixed(1);
    $('cutSheets').textContent=Math.ceil(sheets);
    $('cutPanels').textContent=totPanels;
    $('cutResult').style.display='block';
  }
  $('cutGenBtn').addEventListener('click',genCutting);

  $('cutPdfBtn').addEventListener('click',function(){
    if(!cutData||!window.jspdf)return;
    var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({unit:'pt',format:'a4'});
    var W=doc.internal.pageSize.getWidth();
    doc.setFillColor(29,24,18);doc.rect(0,0,W,70,'F');
    doc.setFillColor(232,132,44);doc.rect(0,70,W,4,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('FURNITURE KRANTI',40,35);
    doc.setFontSize(11);doc.setFont('helvetica','normal');doc.setTextColor(232,180,120);doc.text('Cutting List · Weight · Sheets',40,55);
    doc.setTextColor(40,30,20);doc.setFontSize(10);var y=95;
    doc.setFont('helvetica','bold');doc.text('Item: ',40,y);doc.setFont('helvetica','normal');doc.text(cutData.name,75,y);
    doc.setFont('helvetica','bold');doc.text('Board: ',300,y);doc.setFont('helvetica','normal');doc.text(cutData.board,340,y);
    y+=16;doc.setFont('helvetica','bold');doc.text('Date: ',40,y);doc.setFont('helvetica','normal');doc.text(new Date().toLocaleDateString('en-IN'),75,y);
    var body=cutData.rows.map(function(r,i){return [i+1,r.name,Math.round(r.L),Math.round(r.W),r.qty,r.areaSqft.toFixed(2),r.wt.toFixed(1)]});
    doc.autoTable({startY:y+14,head:[['#','Panel','L mm','W mm','Qty','Area sqft','Wt kg']],body:body,theme:'grid',
      headStyles:{fillColor:[29,24,18],textColor:[255,255,255],fontSize:9},bodyStyles:{fontSize:9},
      alternateRowStyles:{fillColor:[250,246,238]},margin:{left:40,right:40}});
    var fy=doc.lastAutoTable.finalY+20;
    doc.setFillColor(240,247,243);doc.roundedRect(40,fy,250,70,6,6,'F');
    doc.setTextColor(20,87,47);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('SUMMARY',52,fy+18);
    doc.setTextColor(40,30,20);doc.setFontSize(10);doc.setFont('helvetica','normal');
    doc.text('Board Area: '+cutData.areaSqft.toFixed(1)+' sqft',52,fy+36);
    doc.text('Total Weight: '+cutData.weight.toFixed(1)+' kg',52,fy+52);
    doc.setFillColor(240,247,243);doc.roundedRect(305,fy,250,70,6,6,'F');
    doc.setTextColor(40,30,20);
    doc.text('Sheets: '+Math.ceil(cutData.sheets)+' nos (8x4)',317,fy+36);
    doc.text('Panels: '+cutData.panels+' pieces',317,fy+52);
    doc.setFontSize(8);doc.setTextColor(120,110,95);
    doc.text('Sizes in mm. Sheet = 2440x1220mm. Verify against drawing before cutting. Furniture Kranti',40,fy+95);
    doc.save((cutData.name||'cutting-list').replace(/[^a-z0-9]/gi,'_')+'_cutting_list.pdf');
  });

  // ---------------- DXF GENERATOR (flat parts) ----------------
  var holes=[{x:30,y:30,d:8},{x:170,y:30,d:8}];
  function renderHoles(){
    var el=$('holeList');if(!el)return;var h='';
    holes.forEach(function(o,i){
      h+='<div class="row3" style="margin-bottom:7px">'+
        '<input type="number" placeholder="X mm" value="'+o.x+'" oninput="DXF.upd('+i+',\'x\',this.value)">'+
        '<input type="number" placeholder="Y mm" value="'+o.y+'" oninput="DXF.upd('+i+',\'y\',this.value)">'+
        '<div style="display:flex;gap:6px"><input type="number" placeholder="\u00d8 mm" value="'+o.d+'" oninput="DXF.upd('+i+',\'d\',this.value)" style="flex:1">'+
        '<button onclick="DXF.del('+i+')" style="background:none;border:none;color:#b94a3a;font-size:16px;cursor:pointer">\u2715</button></div></div>';
    });
    el.innerHTML=h;
  }
  window.DXF={
    upd:function(i,k,v){holes[i][k]=parseFloat(v)||0},
    del:function(i){holes.splice(i,1);renderHoles()}
  };
  var addHoleBtn=$('addHoleBtn');
  if(addHoleBtn){
    addHoleBtn.addEventListener('click',function(){holes.push({x:50,y:50,d:8});renderHoles()});
    $('dxfShape').addEventListener('change',function(){
      var c=this.value==='circle';
      $('dxfRectDims').style.display=c?'none':'grid';
      $('dxfCircleDims').style.display=c?'flex':'none';
    });
    $('dxfPreviewBtn').addEventListener('click',drawPreview);
    $('dxfDownloadBtn').addEventListener('click',downloadDXF);
    renderHoles();
  }

  function getPart(){
    var shape=$('dxfShape').value;
    if(shape==='circle'){var dia=+$('dxfDia').value||120;return {shape:'circle',dia:dia,L:dia,W:dia,r:0}}
    return {shape:'rect',L:+$('dxfL').value||200,W:+$('dxfW').value||100,r:+$('dxfR').value||0};
  }

  function drawPreview(){
    var p=getPart(),svg=$('dxfSvg');
    var pad=20,maxW=300,maxH=180;
    var sc=Math.min(maxW/p.L,maxH/p.W);
    var w=p.L*sc,h=p.W*sc;
    var s='<g transform="translate('+pad+','+pad+')">';
    if(p.shape==='circle'){
      s+='<circle cx="'+(w/2)+'" cy="'+(h/2)+'" r="'+(w/2)+'" fill="#eef3f7" stroke="#3a4654" stroke-width="1.5"/>';
    } else {
      s+='<rect x="0" y="0" width="'+w+'" height="'+h+'" rx="'+(p.r*sc)+'" fill="#eef3f7" stroke="#3a4654" stroke-width="1.5"/>';
    }
    holes.forEach(function(o){
      var hx=o.x*sc, hy=h-(o.y*sc); // flip Y for screen
      s+='<circle cx="'+hx+'" cy="'+hy+'" r="'+(o.d/2*sc)+'" fill="#fff" stroke="#bf6614" stroke-width="1.2"/>';
      s+='<circle cx="'+hx+'" cy="'+hy+'" r="1" fill="#bf6614"/>';
    });
    s+='</g>';
    svg.innerHTML=s;
    svg.setAttribute('viewBox','0 0 '+(p.L*sc+2*pad)+' '+(p.W*sc+2*pad));
    $('dxfPreviewWrap').style.display='block';
  }

  function dxfHeader(){return '0\nSECTION\n2\nENTITIES\n'}
  function dxfFooter(){return '0\nENDSEC\n0\nEOF\n'}
  function dxfLine(x1,y1,x2,y2){return '0\nLINE\n8\n0\n10\n'+x1+'\n20\n'+y1+'\n11\n'+x2+'\n21\n'+y2+'\n'}
  function dxfCircle(cx,cy,r){return '0\nCIRCLE\n8\n0\n10\n'+cx+'\n20\n'+cy+'\n40\n'+r+'\n'}
  function dxfArc(cx,cy,r,a1,a2){return '0\nARC\n8\n0\n10\n'+cx+'\n20\n'+cy+'\n40\n'+r+'\n50\n'+a1+'\n51\n'+a2+'\n'}

  function downloadDXF(){
    var p=getPart();
    var dxf=dxfHeader();
    if(p.shape==='circle'){
      dxf+=dxfCircle(p.dia/2,p.dia/2,p.dia/2);
    } else {
      var L=p.L,W=p.W,r=Math.min(p.r,Math.min(L,W)/2);
      if(r>0){
        // rounded rectangle: 4 lines + 4 arcs
        dxf+=dxfLine(r,0,L-r,0);            // bottom
        dxf+=dxfLine(L,r,L,W-r);            // right
        dxf+=dxfLine(L-r,W,r,W);            // top
        dxf+=dxfLine(0,W-r,0,r);            // left
        dxf+=dxfArc(L-r,r,r,270,360);       // BR
        dxf+=dxfArc(L-r,W-r,r,0,90);        // TR
        dxf+=dxfArc(r,W-r,r,90,180);        // TL
        dxf+=dxfArc(r,r,r,180,270);         // BL
      } else {
        dxf+=dxfLine(0,0,L,0)+dxfLine(L,0,L,W)+dxfLine(L,W,0,W)+dxfLine(0,W,0,0);
      }
    }
    holes.forEach(function(o){if(o.d>0)dxf+=dxfCircle(o.x,o.y,o.d/2)});
    dxf+=dxfFooter();
    var blob=new Blob([dxf],{type:'application/dxf'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download=(($('dxfName').value||'part').replace(/[^a-z0-9]/gi,'_'))+'.dxf';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------- INIT ----------------
  buildRateGrid();
})();
