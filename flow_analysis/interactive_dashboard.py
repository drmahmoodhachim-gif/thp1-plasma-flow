"""
Build the live E1 explorer (Claude's 3D view plus 2D gates, viability, figures).

    python interactive_dashboard.py --data "../Flow Files" --out "../interface"
"""
import os, json, argparse
import numpy as np
import config as C
import flowdata as F
from figures_fancy import _viab
from figures_part2 import trend_test

CLASSES = ["Plasma particles / debris", "Doublets", "Live cells", "Dead cells"]
GATE = [(x, min(y, C.SCALE_MAX)) for x, y in C.REC_ALL_CELLS]


def build_payload(data, gates, max_per_class=2500, seed=0):
    rng = np.random.default_rng(seed)
    payload = {}
    for k in C.SAMPLES:
        d = data[k]
        g = gates[k]
        cls = np.full(len(d[C.FSC_A]), CLASSES[0], dtype=object)
        cls[g["cells"] & ~g["singlets"]] = CLASSES[1]
        cls[g["live"]] = CLASSES[2]
        cls[g["dead"]] = CLASSES[3]
        tube = {}
        for c in CLASSES:
            idx = np.where(cls == c)[0]
            if len(idx) > max_per_class:
                idx = rng.choice(idx, max_per_class, replace=False)
            tube[c] = dict(
                x=np.round(d[C.FSC_A][idx]).astype(int).tolist(),
                y=np.round(np.minimum(d[C.SSC_A][idx], 262143)).astype(int).tolist(),
                z=np.round(F.logicle(d[C.DYE][idx]), 4).tolist(),
                n=int((cls == c).sum()),
            )
        v, L, D = _viab(g)
        lo, hi = F.wilson_ci(L, L + D)
        tube["_viab"] = round(v, 1)
        tube["_live"] = int(L)
        tube["_dead"] = int(D)
        tube["_lo"] = round(100 * lo, 1)
        tube["_hi"] = round(100 * hi, 1)
        tube["_dose"] = C.DOSE.get(k)
        tube["_repeat"] = k in C.REPEAT_TUBES
        payload[C.pretty(k)] = tube
    T = trend_test(gates)
    lr = T["lr"]
    meta = dict(
        ticks=dict(vals=F.logicle(F.LOGICLE_TICKS).round(4).tolist(), text=F.LOGICLE_LABELS),
        cut=round(float(F.logicle([C.DYE_CUTOFF])[0]), 4),
        gate=GATE + [GATE[0]],
        slope10=round(float(T["slope10"]), 2),
        ci10=[round(float(T["ci10"][0]), 2), round(float(T["ci10"][1]), 2)],
        p=round(float(lr.pvalue), 2),
        r2=round(float(lr.rvalue ** 2), 2),
        intercept=round(float(lr.intercept), 3),
        slope=round(float(lr.slope), 5),
    )
    return payload, meta


def write_html(payload, meta, out):
    html = (
        DASHBOARD.replace("__DATA__", json.dumps(payload, separators=(",", ":")))
        .replace("__META__", json.dumps(meta, separators=(",", ":")))
    )
    path = os.path.join(out, "index.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print("  wrote", path)
    return path


DASHBOARD = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>E1 · THP-1 + mouse plasma explorer</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.27.0/plotly.min.js"></script>
<style>
:root{
  --bg:#0F1826; --panel:#152033; --card:#1B2A41; --line:#2E4262;
  --teal:#17A398; --coral:#E4572E; --purple:#7B6FD0; --grey:#8A94A6;
  --text:#E6ECF4; --muted:#9FB0C8; --soft:#CADCFC;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--text);
  font-family:Calibri,Segoe UI,Helvetica,Arial,sans-serif}
body{display:flex;flex-direction:column;min-height:100vh}
header{padding:14px 20px 8px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
h1{font-size:20px;margin:0 0 4px;font-family:Cambria,Georgia,serif;font-weight:700}
.sub{margin:0;color:var(--muted);font-size:13px;max-width:720px;line-height:1.4}
.views{display:flex;gap:6px}
.views button,.tabs button,.fig-nav button{
  background:var(--card);color:var(--soft);border:1px solid var(--line);
  border-radius:16px;padding:6px 12px;font-size:13px;cursor:pointer}
.views button.on,.tabs button.on,.fig-nav button.on{background:var(--teal);color:#fff;border-color:var(--teal)}
.tabs{display:flex;flex-wrap:wrap;gap:6px;padding:6px 20px 8px}
#stats{padding:0 20px 10px;font-size:13px;color:var(--muted)} #stats b{color:#fff}
main{flex:1;padding:0 16px 16px;min-height:0}
#explorer{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.9fr);grid-template-rows:minmax(280px,1fr) 210px;gap:10px;height:calc(100vh - 168px);min-height:560px}
#plot3d,#plotDose,#plot2d,#plotDye{background:var(--panel);border:1px solid var(--line);border-radius:8px;min-height:0}
.side{display:grid;grid-template-rows:auto minmax(0,1fr) minmax(0,1fr);gap:10px;min-height:0}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px 14px}
.kpi .big{font-size:32px;font-weight:700;color:#fff;font-family:Cambria,Georgia,serif;line-height:1}
.kpi .label{font-size:12px;color:var(--muted);margin-top:2px}
.bars{display:grid;gap:6px;margin-top:10px}
.bar-row{display:grid;grid-template-columns:118px 1fr 58px;gap:8px;align-items:center;font-size:12px;color:var(--muted)}
.track{height:8px;background:#0F1826;border-radius:4px;overflow:hidden}
.fill{height:100%}
#figures{display:none;height:calc(100vh - 168px);min-height:560px;flex-direction:column}
#figures.show{display:flex}
.fig-nav{display:flex;flex-wrap:wrap;gap:6px;padding:0 0 10px}
.fig-stage{flex:1;min-height:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;display:flex;align-items:center;justify-content:center;padding:12px}
.fig-stage img{max-width:100%;max-height:100%;object-fit:contain}
.fig-cap{padding:8px 4px 0;color:var(--muted);font-size:13px}
@media (max-width:1100px){
  #explorer{grid-template-columns:1fr;grid-template-rows:420px auto 240px 240px 210px;height:auto}
  .side{grid-template-rows:auto 240px 240px}
}
</style>
</head>
<body>
<header>
  <div>
    <h1>THP-1 + mouse plasma · live flow explorer</h1>
    <p class="sub">Claude’s 3D FSC × SSC × dye explorer, rebuilt from the E1 scripts and your FCS files. Drag to rotate, scroll to zoom, click a legend item to hide a group. Arrow keys switch tubes.</p>
  </div>
  <div class="views">
    <button id="btnExplorer" class="on" type="button">Explorer</button>
    <button id="btnFigures" type="button">Figures</button>
  </div>
</header>
<div class="tabs" id="tabs"></div>
<div id="stats"></div>
<main>
  <div id="explorer">
    <div id="plot3d"></div>
    <div class="side">
      <div class="kpi" id="kpi"></div>
      <div id="plot2d"></div>
      <div id="plotDye"></div>
    </div>
    <div id="plotDose" style="grid-column:1/-1"></div>
  </div>
  <div id="figures">
    <div class="fig-nav" id="figNav"></div>
    <div class="fig-stage"><img id="figImg" alt="Analysis figure"></div>
    <div class="fig-cap" id="figCap"></div>
  </div>
</main>
<script>
const DATA=__DATA__, META=__META__;
const COL={"Plasma particles / debris":"#8A94A6","Doublets":"#7B6FD0","Live cells":"#17A398","Dead cells":"#E4572E"};
const SIZE={"Plasma particles / debris":1.6,"Doublets":2.2,"Live cells":2.4,"Dead cells":3.4};
const OP={"Plasma particles / debris":0.25,"Doublets":0.6,"Live cells":0.75,"Dead cells":0.95};
const FIGS=[
  {src:"figures/fig10_summary_panel.png", title:"Fig 10 · Summary panel", cap:"Recommended gate, dye separation, particle vs cell rates, dose trend, and viability at 0% vs 70% plasma."},
  {src:"figures/fig11_ridgeline.png", title:"Fig 11 · Dye ridgeline", cap:"Logicle dye intensity of singlets in every tube. Ridge height is √density so rare dead cells stay visible."},
  {src:"figures/fig12_density_difference.png", title:"Fig 12 · Density difference", cap:"Where events appear or disappear at 70% vs 0% plasma, for all events and for live cells only."},
  {src:"figures/fig13_gating_funnel.png", title:"Fig 13 · Gating funnel", cap:"Events remaining after each gate. Plasma adds particles at the top; similar cell numbers remain at the bottom."},
  {src:"figures/fig14_jointplot.png", title:"Fig 14 · Live-cell joint plot", cap:"Live THP-1 size vs granularity at 0% and 70% plasma. Acquisition order is confounded with dose."},
  {src:"figures/fig15_viability_donuts.png", title:"Fig 15 · Viability donuts", cap:"Live / dead split for every tube under the recommended gating."},
  {src:"figures/fig16_debris_evidence.png", title:"Fig 16 · Debris evidence", cap:"Small events in plasma tubes are dye-negative; heat-killed debris is dye-bright."}
];
const names=Object.keys(DATA);
let cur=names.includes("70% rep")?"70% rep":names[0];
let figIdx=0;
const tabs=document.getElementById("tabs");
names.forEach(n=>{
  const b=document.createElement("button"); b.type="button"; b.textContent=n;
  b.onclick=()=>{cur=n;draw(true)}; tabs.appendChild(b);
});
document.getElementById("btnExplorer").onclick=()=>setView("explorer");
document.getElementById("btnFigures").onclick=()=>setView("figures");
const figNav=document.getElementById("figNav");
FIGS.forEach((f,i)=>{
  const b=document.createElement("button"); b.type="button"; b.textContent=f.title.split(" · ")[0];
  b.onclick=()=>{figIdx=i;showFig()}; figNav.appendChild(b);
});
function setView(v){
  document.getElementById("btnExplorer").classList.toggle("on", v==="explorer");
  document.getElementById("btnFigures").classList.toggle("on", v==="figures");
  document.getElementById("explorer").style.display=v==="explorer"?"grid":"none";
  document.getElementById("figures").classList.toggle("show", v==="figures");
  if(v==="figures") showFig();
  if(v==="explorer") { draw(false); drawDose(); }
}
function showFig(){
  [...figNav.children].forEach((b,i)=>b.classList.toggle("on", i===figIdx));
  document.getElementById("figImg").src=FIGS[figIdx].src;
  document.getElementById("figCap").textContent=FIGS[figIdx].title+" — "+FIGS[figIdx].cap;
}
function darkAx(title, extra){
  return Object.assign({
    title:{text:title,font:{color:"#CADCFC",size:11}},
    gridcolor:"#2E4262", zerolinecolor:"#2E4262", color:"#9FB0C8",
    tickfont:{size:10}
  }, extra||{});
}
function traces3d(t){
  const traces=[];
  Object.keys(COL).forEach(c=>{
    const s=t[c]; if(!s||!s.x.length) return;
    traces.push({type:"scatter3d",mode:"markers",name:`${c} (${s.n.toLocaleString()})`,
      x:s.x,y:s.y,z:s.z,
      marker:{size:SIZE[c],color:COL[c],opacity:OP[c]},
      hovertemplate:"FSC %{x}<br>SSC %{y}<extra>"+c+"</extra>"});
  });
  traces.push({type:"mesh3d",x:[0,262144,262144,0],y:[0,0,262144,262144],z:[META.cut,META.cut,META.cut,META.cut],
    i:[0,0],j:[1,2],k:[2,3],color:"#FFFFFF",opacity:0.08,name:"live/dead cut-off",hoverinfo:"skip",showlegend:true});
  return traces;
}
function traces2d(t){
  const traces=[];
  Object.keys(COL).forEach(c=>{
    const s=t[c]; if(!s||!s.x.length) return;
    traces.push({type:"scattergl",mode:"markers",name:c,x:s.x,y:s.y,showlegend:false,
      marker:{size:c==="Dead cells"?5:3,color:COL[c],opacity:c==="Plasma particles / debris"?0.18:0.55},
      hovertemplate:"FSC %{x}<br>SSC %{y}<extra>"+c+"</extra>"});
  });
  traces.push({type:"scatter",mode:"lines",name:"All-cells gate",x:META.gate.map(p=>p[0]),y:META.gate.map(p=>p[1]),
    line:{color:"#FFFFFF",width:2},hoverinfo:"skip"});
  return traces;
}
function tracesDye(t){
  const traces=[];
  Object.keys(COL).forEach(c=>{
    const s=t[c]; if(!s||!s.x.length) return;
    traces.push({type:"scattergl",mode:"markers",name:c,x:s.x,y:s.z,showlegend:false,
      marker:{size:c==="Dead cells"?5:3,color:COL[c],opacity:c==="Plasma particles / debris"?0.18:0.55},
      hovertemplate:"FSC %{x}<br>dye %{y:.2f}<extra>"+c+"</extra>"});
  });
  traces.push({type:"scatter",mode:"lines",name:"cut-off",x:[0,262144],y:[META.cut,META.cut],
    line:{color:"#FFFFFF",width:1,dash:"dash"},hoverinfo:"skip"});
  return traces;
}
function kpiHtml(name,t){
  const tot=Object.keys(COL).reduce((a,c)=>a+(t[c]?t[c].n:0),0);
  const maxN=Math.max(...Object.keys(COL).map(c=>t[c]?t[c].n:0),1);
  const rows=Object.keys(COL).map(c=>{
    const n=t[c]?t[c].n:0; const pct=100*n/tot;
    return `<div class="bar-row"><span>${c}</span><div class="track"><div class="fill" style="width:${100*n/maxN}%;background:${COL[c]}"></div></div><span>${n.toLocaleString()} · ${pct.toFixed(1)}%</span></div>`;
  }).join("");
  const ci=(t._lo!=null)?` <span style="font-size:12px;color:var(--muted);font-weight:400">(${t._lo}–${t._hi})</span>`:"";
  return `<div class="big">${t._viab}%${ci}</div>
    <div class="label">viability · ${name} · ${t._live.toLocaleString()} live / ${t._dead.toLocaleString()} dead singlets</div>
    <div class="bars">${rows}</div>`;
}
function draw(keepCam){
  [...tabs.children].forEach(b=>b.classList.toggle("on", b.textContent===cur));
  const t=DATA[cur];
  const tot=Object.keys(COL).reduce((a,c)=>a+(t[c]?t[c].n:0),0);
  document.getElementById("stats").innerHTML=`<b>${cur}</b> · ${tot.toLocaleString()} events · viability <b>${t._viab}%</b> (live ÷ live+dead singlets) · max 2,500 points shown per group`;
  document.getElementById("kpi").innerHTML=kpiHtml(cur,t);
  const gd=document.getElementById("plot3d");
  const ax=title=>({title:{text:title,font:{color:"#CADCFC"}},gridcolor:"#2E4262",zerolinecolor:"#2E4262",color:"#9FB0C8",backgroundcolor:"#0F1826",showbackground:true});
  const layout={paper_bgcolor:"#152033",plot_bgcolor:"#152033",font:{color:"#E6ECF4"},margin:{l:0,r:0,t:8,b:0},
    legend:{x:0.01,y:0.98,bgcolor:"rgba(15,24,38,0.7)",font:{size:11}},
    scene:{xaxis:ax("FSC-A (size)"),yaxis:ax("SSC-A (granularity)"),
      zaxis:Object.assign(ax("Viability dye"),{tickvals:META.ticks.vals,ticktext:META.ticks.text}),
      camera:(keepCam&&gd.layout&&gd.layout.scene)?gd.layout.scene.camera:{eye:{x:1.6,y:-1.6,z:0.8}},aspectmode:"cube"}};
  Plotly.react(gd, traces3d(t), layout, {responsive:true,displaylogo:false});
  const common2d={paper_bgcolor:"#152033",plot_bgcolor:"#0F1826",font:{color:"#E6ECF4",size:11},
    margin:{l:48,r:12,t:28,b:40},showlegend:false};
  Plotly.react("plot2d", traces2d(t), Object.assign({}, common2d, {
    title:{text:"FSC-A vs SSC-A · all-cells gate",font:{size:12,color:"#CADCFC"}},
    xaxis:darkAx("FSC-A (size)",{range:[0,262144]}),
    yaxis:darkAx("SSC-A (granularity)",{range:[0,262144]})
  }), {responsive:true,displaylogo:false});
  Plotly.react("plotDye", tracesDye(t), Object.assign({}, common2d, {
    title:{text:"FSC-A vs dye · live/dead cut-off",font:{size:12,color:"#CADCFC"}},
    xaxis:darkAx("FSC-A (size)",{range:[0,262144]}),
    yaxis:darkAx("Viability dye",{tickvals:META.ticks.vals,ticktext:META.ticks.text})
  }), {responsive:true,displaylogo:false});
}
function drawDose(){
  const xs=[], ys=[], yLo=[], yHi=[], text=[], custom=[];
  names.forEach(n=>{
    const t=DATA[n]; if(t._dose==null) return;
    xs.push(t._dose + (t._repeat?1.6:0));
    ys.push(t._viab); yLo.push(t._viab-t._lo); yHi.push(t._hi-t._viab);
    text.push(n); custom.push(n);
  });
  const lineX=Array.from({length:71},(_,i)=>i);
  const lineY=lineX.map(x=>META.intercept+META.slope*x);
  const traces=[
    {type:"scatter",mode:"lines",x:lineX,y:lineY,line:{color:"#17A398",width:2,dash:"dash"},name:"linear trend",hoverinfo:"skip"},
    {type:"scatter",mode:"markers",x:xs,y:ys,text:text,customdata:custom,
      error_y:{type:"data",array:yHi,arrayminus:yLo,color:"#9FB0C8",thickness:1,width:4},
      marker:{size:10,color:xs.map(x=>x<1?"#CADCFC":"#17A398"),symbol:text.map(n=>DATA[n]._repeat?"square":"circle"),
        line:{color:"#0F1826",width:1}},
      hovertemplate:"%{text}<br>%{y:.1f}%<extra></extra>",name:"tube viability"}
  ];
  const hk=DATA["HK"];
  if(hk) traces.push({type:"scatter",mode:"lines",x:[0,70],y:[hk._viab,hk._viab],
    line:{color:"#E4572E",width:1,dash:"dot"},name:`heat-killed ${hk._viab}%`,hoverinfo:"skip"});
  Plotly.react("plotDose", traces, {
    paper_bgcolor:"#152033",plot_bgcolor:"#0F1826",font:{color:"#E6ECF4"},
    margin:{l:52,r:16,t:36,b:44},
    title:{text:`Viability vs % mouse plasma  ·  ${META.slope10}% per +10% plasma (95% CI ${META.ci10[0]} to ${META.ci10[1]})  ·  p = ${META.p}  ·  R² = ${META.r2}`,
      font:{size:12,color:"#CADCFC"}},
    xaxis:darkAx("Mouse plasma (%)",{range:[-4,74],dtick:10}),
    yaxis:darkAx("Viability (%)",{range:[78,102]}),
    legend:{orientation:"h",y:1.18,x:0,font:{size:11},bgcolor:"rgba(0,0,0,0)"},
    hovermode:"closest"
  }, {responsive:true,displaylogo:false});
  document.getElementById("plotDose").on("plotly_click", ev=>{
    if(ev.points&&ev.points[0]&&ev.points[0].customdata){ cur=ev.points[0].customdata; draw(true); }
  });
}
document.addEventListener("keydown", e=>{
  if(e.target && ["INPUT","TEXTAREA"].includes(e.target.tagName)) return;
  const i=names.indexOf(cur);
  if(e.key==="ArrowRight"&&i<names.length-1){cur=names[i+1];draw(true)}
  if(e.key==="ArrowLeft"&&i>0){cur=names[i-1];draw(true)}
});
draw(false); drawDose();
</script>
</body></html>
"""


def make(data, gates, out):
    os.makedirs(out, exist_ok=True)
    payload, meta = build_payload(data, gates)
    return write_html(payload, meta, out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=C.DATA_DIR)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "interface"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    data, _meta = F.load_all(a.data)
    gates = {k: F.recommended_gating(d) for k, d in data.items()}
    make(data, gates, a.out)
