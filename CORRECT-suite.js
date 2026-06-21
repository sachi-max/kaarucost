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

  function opt(arr,sel){return arr.map(function(o){return '<option'+(o===sel?' selected':'')+'>'+o+'</option>'}).join('')}
  function esc(s){return (s||'').replace(/"/g,'&quot;')}

  // ---------------- COMPONENTS (photo-filled, editable) ----------------
  var comps=[];
  function defComp(part,material,method,size){
    var w='',h='';
    // parse "4x2" style size guess
    if(size){var m=(''+size).match(/([\d.]+)\s*[xX×]\s*([\d.]+)/);if(m){w=m[1];h=m[2]}}
    return {part:part||'Component',material:material||'',method:method||'wood',w:w,h:h,thick:1.5,
      metal:'SS 304',form:'pipe',kgft:0.9,runft:'',rate:method==='glass'?350:RATES.woodRate,
      qual:'Mid-range',finish:0,fab:65,fabric:'Bouclé / designer',foam:'High-density foam'}
  }
  window.SUITE={
    upd:function(i,k,v){comps[i][k]=v;recompute()},
    del:function(i){comps.splice(i,1);renderComps();recompute()},
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
        else html+='<div class="row3"><input type="number" placeholder="W ft" value="'+c.w+'" oninput="SUITE.upd('+i+',\'w\',this.value)"><input type="number" placeholder="H ft" value="'+c.h+'" oninput="SUITE.upd('+i+',\'h\',this.value)"><input type="number" placeholder="thick mm" value="'+c.thick+'" oninput="SUITE.upd('+i+',\'thick\',this.value)"></div>';
        html+='<div class="row"><div><label>Finish ₹/sqft</label><input type="number" value="'+c.finish+'" oninput="SUITE.upd('+i+',\'finish\',this.value)"></div><div><label>Fab ₹/kg</label><input type="number" value="'+c.fab+'" oninput="SUITE.upd('+i+',\'fab\',this.value)"></div></div>';
      } else if(c.method==='glass'){
        html+='<div class="row3"><input type="number" placeholder="W ft" value="'+c.w+'" oninput="SUITE.upd('+i+',\'w\',this.value)"><input type="number" placeholder="H ft" value="'+c.h+'" oninput="SUITE.upd('+i+',\'h\',this.value)"><input type="number" placeholder="₹/sqft" value="'+c.rate+'" oninput="SUITE.upd('+i+',\'rate\',this.value)"></div>';
      } else if(c.method==='upholstery'){
        html+='<div class="row"><div><label>W ft</label><input type="number" value="'+c.w+'" oninput="SUITE.upd('+i+',\'w\',this.value)"></div><div><label>H ft</label><input type="number" value="'+c.h+'" oninput="SUITE.upd('+i+',\'h\',this.value)"></div></div>';
        html+='<div class="row"><div><label>Fabric</label><select onchange="SUITE.upd('+i+',\'fabric\',this.value)">'+opt(Object.keys(UPH_FABRIC),c.fabric)+'</select></div><div><label>Foam</label><select onchange="SUITE.upd('+i+',\'foam\',this.value)">'+opt(Object.keys(UPH_FOAM),c.foam)+'</select></div></div>';
      } else {
        html+='<div class="row3"><input type="number" placeholder="W ft" value="'+c.w+'" oninput="SUITE.upd('+i+',\'w\',this.value)"><input type="number" placeholder="H ft" value="'+c.h+'" oninput="SUITE.upd('+i+',\'h\',this.value)"><input type="number" placeholder="₹/sqft" value="'+c.rate+'" oninput="SUITE.upd('+i+',\'rate\',this.value)"></div>';
        html+='<div><label>Quality</label><select onchange="SUITE.upd('+i+',\'qual\',this.value)">'+opt(Object.keys(QUALITY),c.qual)+'</select></div>';
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
    else {return {cost:w*h*(parseFloat(c.rate)||RATES.woodRate)*(QUALITY[c.qual]||1),detail:(w*h).toFixed(1)+'sqft wood',wt:w*h*1.2};}
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
  var imgData=null,mediaType=null,aiData=null;
  $('drop').addEventListener('click',function(){$('file').click()});
  $('file').addEventListener('change',function(){if(this.files[0])handleFile(this.files[0])});
  function handleFile(f){if(!f.type.startsWith('image/'))return;mediaType=f.type;
    var r=new FileReader();r.onload=function(e){imgData=e.target.result.split(',')[1];$('img').src=e.target.result;
      $('preview').style.display='block';$('goBtn').disabled=false;$('goBtn').textContent='✨ Costing Nikaalo';};
    r.readAsDataURL(f)}

  $('goBtn').addEventListener('click',analyze);
  async function analyze(){
    if(!imgData)return;
    $('err').style.display='none';$('idcard').style.display='none';$('result').style.display='none';
    hide('editCard');hide('rateCard');hide('cutCard');hide('dxfCard');hide('finalActions');
    $('loading').style.display='block';$('goBtn').disabled=true;
    var prompt='You are a furniture & metal-product expert. Identify this item and break it into priced components. Respond ONLY with JSON (no markdown): '+
      '{"furniture_type":"specific name","components":[{"part":"e.g. frame/seat/top/carcass","material":"e.g. SS 304, solid wood, veneer, bouclé fabric, glass","method":"metal/wood/glass/upholstery","approx_size":"best guess like 2x2 ft, or running length for metal frames like 30 ft"}],"material_guess":"overall","build_quality":"budget/mid/premium/luxury","confidence":"low/medium/high"}. '+
      'ALWAYS provide at least one component. Use method "upholstery" for cushioned/fabric/leather parts, "metal" for steel/brass frames (give approx_size as running length in ft), "wood" for ply/veneer/solid wood panels, "glass" for glass. Estimate sizes from typical furniture proportions.';
    try{
      var res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({imageData:imgData,mediaType:mediaType,prompt:prompt})});
      var data=await res.json();if(data.error)throw new Error(data.error);
      var text=(data.text||'').replace(/```json|```/g,'').trim();
      aiData=JSON.parse(text);
      applyAi(aiData);
    }catch(e){$('loading').style.display='none';$('goBtn').disabled=false;$('err').style.display='block';
      $('err').textContent='AI analyze nahi kar paya: '+e.message+' (Backend deploy hone ke baad chalega.)'}
  }

  function applyAi(d){
    $('loading').style.display='none';$('goBtn').disabled=false;
    // id card
    $('idcard').style.display='block';
    $('idName').textContent=d.furniture_type||'Furniture';
    var m='Material: '+(d.material_guess||'?')+' · Quality: '+(d.build_quality||'?')+' · AI conf: <b>'+(d.confidence||'low').toUpperCase()+'</b>';
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
      // apply quality from build_quality
      var bq=(d.build_quality||'').toLowerCase();
      if(bq.indexOf('premium')>=0)comp.qual='Premium';else if(bq.indexOf('lux')>=0)comp.qual='Luxury';else if(bq.indexOf('budget')>=0)comp.qual='Budget';
      return comp;
    });
    renderComps();
    show('editCard');show('rateCard');show('cutCard');show('dxfCard');show('finalActions');
    recompute();
    $('result').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function show(id){$(id).classList.remove('hidep')}
  function hide(id){$(id).classList.add('hidep')}

  $('resetBtn').addEventListener('click',function(){
    imgData=null;aiData=null;comps=[];
    $('preview').style.display='none';$('img').src='';
    $('idcard').style.display='none';$('result').style.display='none';
    hide('editCard');hide('rateCard');hide('cutCard');hide('dxfCard');hide('finalActions');
    $('goBtn').disabled=true;$('goBtn').textContent='📷 Pehle photo daalo';
    $('file').value='';
    window.scrollTo({top:0,behavior:'smooth'});
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
