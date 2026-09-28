const $ = id => document.getElementById(id);
const KEY = "frais-km-trajets-v1";
let calculatedKm = null;

function todayISO(){
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
}
$("date").value = todayISO();

function load(){ try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return []} }
function saveAll(a){localStorage.setItem(KEY,JSON.stringify(a))}
function fmt(n){return n.toLocaleString("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:1})+" km"}
function sum(filter){return load().filter(filter).reduce((s,t)=>s+t.km,0)}
function refresh(){
  const d=$("date").value || todayISO();
  const [y,m]=d.split("-").map(Number);
  $("dayTotal").textContent=fmt(sum(t=>t.date===d));
  $("monthTotal").textContent=fmt(sum(t=>{const x=t.date.split("-").map(Number);return x[0]===y&&x[1]===m}));
  $("yearTotal").textContent=fmt(sum(t=>t.date.startsWith(String(y))));
  const arr=load().sort((a,b)=>b.created-a.created);
  $("history").innerHTML=arr.length?arr.map(t=>`
    <div class="trip">
      <div class="tripTop"><strong>${new Date(t.date+"T12:00:00").toLocaleDateString("fr-FR")}</strong><span class="km">${fmt(t.km)}</span></div>
      <div>${escapeHtml(t.departure)} → ${escapeHtml(t.arrival)}</div>
      <div class="small">${escapeHtml(t.reason||"Sans motif")}</div>
    </div>`).join(""):'<div class="empty">Aucun trajet enregistré.</div>';
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

async function geocode(q){
  const u="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=fr&q="+encodeURIComponent(q);
  const r=await fetch(u,{headers:{"Accept":"application/json"}});
  if(!r.ok) throw new Error("Géocodage indisponible");
  const data=await r.json();
  if(!data.length) throw new Error("Adresse introuvable : "+q);
  return {lat:+data[0].lat,lon:+data[0].lon};
}
async function route(a,b){
  const u=`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
  const r=await fetch(u);
  if(!r.ok) throw new Error("Calcul d'itinéraire indisponible");
  const data=await r.json();
  if(data.code!=="Ok"||!data.routes?.length) throw new Error("Itinéraire introuvable");
  return data.routes[0].distance/1000;
}
$("calculate").onclick=async()=>{
  const a=$("departure").value.trim(), b=$("arrival").value.trim();
  if(!a||!b){$("message").textContent="Renseigne le départ et l'arrivée.";return}
  $("message").textContent="Calcul en cours…";
  $("calculate").disabled=true;
  try{
    const [pa,pb]=await Promise.all([geocode(a),geocode(b)]);
    calculatedKm=await route(pa,pb);
    $("result").classList.remove("hidden");
    $("result").textContent="Distance routière : "+fmt(calculatedKm);
    $("save").disabled=false;$("message").textContent="";
  }catch(e){calculatedKm=null;$("save").disabled=true;$("result").classList.add("hidden");$("message").textContent=e.message}
  finally{$("calculate").disabled=false}
};
$("reverse").onclick=()=>{const a=$("departure").value;$("departure").value=$("arrival").value;$("arrival").value=a}
$("save").onclick=()=>{
  if(calculatedKm==null)return;
  const arr=load();
  arr.push({date:$("date").value||todayISO(),departure:$("departure").value.trim(),arrival:$("arrival").value.trim(),km:calculatedKm,reason:$("reason").value.trim(),created:Date.now()});
  saveAll(arr);calculatedKm=null;$("save").disabled=true;$("result").classList.add("hidden");
  $("departure").value="";$("arrival").value="";$("reason").value="";
  $("message").textContent="Trajet enregistré ✅";refresh();
};
$("date").onchange=refresh;
$("clear").onclick=()=>{if(confirm("Supprimer tous les trajets ?")){localStorage.removeItem(KEY);refresh()}};
$("gps").onclick=()=>{
  if(!navigator.geolocation){$("message").textContent="Géolocalisation non disponible.";return}
  $("message").textContent="Localisation en cours…";
  navigator.geolocation.getCurrentPosition(async p=>{
    const q=`${p.coords.latitude},${p.coords.longitude}`;
    try{
      const u="https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat="+p.coords.latitude+"&lon="+p.coords.longitude;
      const r=await fetch(u); const d=await r.json();
      $("departure").value=d.display_name||q; $("message").textContent="";
    }catch{$("departure").value=q;$("message").textContent="Position GPS récupérée."}
  },()=>$("message").textContent="Impossible d'obtenir la position.");
};
refresh();
