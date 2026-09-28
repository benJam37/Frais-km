const { createClient } = supabase;
const client = createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = id => document.getElementById(id);
let user = null;
let calculatedKm = null;
let trips = [];

function todayISO(){
  const d = new Date(), off = d.getTimezoneOffset();
  return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
}
function fmt(n){return Number(n).toLocaleString("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:1})+" km"}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function setMsg(id,msg,error=false){$(id).textContent=msg;$(id).style.color=error?"#991b1b":"#374151"}

function showAuth(tab="login"){
  $("authView").classList.remove("hidden"); $("appView").classList.add("hidden"); $("logout").classList.add("hidden");
  $("loginForm").classList.toggle("hidden",tab!=="login"); $("signupForm").classList.toggle("hidden",tab!=="signup");
  $("tabLogin").classList.toggle("active",tab==="login"); $("tabSignup").classList.toggle("active",tab==="signup");
}
function showApp(){
  $("authView").classList.add("hidden"); $("appView").classList.remove("hidden"); $("logout").classList.remove("hidden");
  $("date").value ||= todayISO();
}

async function loadProfile(){
  const {data,error}=await client.from("profiles").select("first_name,last_name").eq("id",user.id).maybeSingle();
  if(error){setMsg("tripMessage","Profil inaccessible : "+error.message,true);return}
  $("hello").textContent = "Bonjour "+esc(data?.first_name||"👋")+" 👋";
}

async function loadTrips(){
  const {data,error}=await client.from("trips").select("id,trip_date,departure,arrival,distance_km,reason,created_at").eq("user_id",user.id).order("trip_date",{ascending:false}).order("created_at",{ascending:false});
  if(error){setMsg("tripMessage","Impossible de charger les trajets : "+error.message,true);return}
  trips=data||[];
  populateYears(); renderStats(); renderHistory();
}

function populateYears(){
  const years=[...new Set([new Date().getFullYear(),...trips.map(t=>Number(t.trip_date.slice(0,4)))])].sort((a,b)=>b-a);
  const current=$("yearSelect").value;
  $("yearSelect").innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join("");
  if(years.includes(Number(current))) $("yearSelect").value=current;
  const y=$("yearSelect").value||new Date().getFullYear();
  const months=[...new Set(trips.filter(t=>t.trip_date.startsWith(y+"-")).map(t=>t.trip_date.slice(0,7)))].sort().reverse();
  const hm=$("historyMonth").value;
  $("historyMonth").innerHTML=`<option value="all">Toute l'année</option>`+months.map(m=>`<option value="${m}">${new Date(m+"-01T12:00:00").toLocaleDateString("fr-FR",{month:"long"})}</option>`).join("");
  if(months.includes(hm)||hm==="all") $("historyMonth").value=hm||"all";
}
function renderStats(){
  const y=Number($("yearSelect").value);
  const yt=trips.filter(t=>Number(t.trip_date.slice(0,4))===y).reduce((s,t)=>s+Number(t.distance_km),0);
  $("yearTotal").textContent=fmt(yt);
  const names=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  $("months").innerHTML=names.map((n,i)=>{
    const m=String(i+1).padStart(2,"0");
    const total=trips.filter(t=>t.trip_date.startsWith(`${y}-${m}-`)).reduce((s,t)=>s+Number(t.distance_km),0);
    return `<div class="month"><span>${n}</span><strong>${fmt(total)}</strong></div>`;
  }).join("");
}
function renderHistory(){
  const y=Number($("yearSelect").value);
  const m=$("historyMonth").value;
  const arr=trips.filter(t=>Number(t.trip_date.slice(0,4))===y && (m==="all"||t.trip_date.startsWith(m)));
  $("history").innerHTML=arr.length?arr.map(t=>`
    <div class="trip">
      <div class="tripTop"><strong>${new Date(t.trip_date+"T12:00:00").toLocaleDateString("fr-FR")}</strong><span class="km">${fmt(t.distance_km)}</span></div>
      <div>${esc(t.departure)} → ${esc(t.arrival)}</div>
      <div class="small">${esc(t.reason||"Sans motif")}</div>
      <div class="tripActions"><button class="secondary edit" data-id="${t.id}">Modifier</button><button class="delete" data-id="${t.id}">Supprimer</button></div>
    </div>`).join(""):'<div class="small">Aucun trajet pour cette période.</div>';
}

async function geocode(q){
  const u="https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=fr&q="+encodeURIComponent(q);
  const r=await fetch(u,{headers:{Accept:"application/json"}});
  if(!r.ok) throw new Error("Géocodage indisponible");
  const d=await r.json(); if(!d.length) throw new Error("Adresse introuvable : "+q);
  return {lat:+d[0].lat,lon:+d[0].lon};
}
async function route(a,b){
  const u=`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
  const r=await fetch(u); if(!r.ok) throw new Error("Calcul d'itinéraire indisponible");
  const d=await r.json(); if(d.code!=="Ok"||!d.routes?.length) throw new Error("Itinéraire introuvable");
  return d.routes[0].distance/1000;
}

$("tabLogin").onclick=()=>showAuth("login");
$("tabSignup").onclick=()=>showAuth("signup");

$("loginForm").onsubmit=async e=>{
  e.preventDefault();setMsg("authMessage","Connexion…");
  const {error}=await client.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
  if(error)setMsg("authMessage",error.message,true);
};
$("signupForm").onsubmit=async e=>{
  e.preventDefault();setMsg("authMessage","Création du compte…");
  const {error}=await client.auth.signUp({
    email:$("signupEmail").value.trim(),password:$("signupPassword").value,
    options:{data:{first_name:$("firstName").value.trim(),last_name:$("lastName").value.trim()},emailRedirectTo:location.href}
  });
  if(error)setMsg("authMessage",error.message,true);
  else setMsg("authMessage","Compte créé. Vérifie ton e-mail si une confirmation est demandée.");
};
$("logout").onclick=()=>client.auth.signOut();

$("calculate").onclick=async()=>{
  const a=$("departure").value.trim(),b=$("arrival").value.trim();
  if(!a||!b){setMsg("tripMessage","Renseigne le départ et l'arrivée.",true);return}
  $("calculate").disabled=true;setMsg("tripMessage","Calcul en cours…");
  try{
    const [pa,pb]=await Promise.all([geocode(a),geocode(b)]);
    calculatedKm=await route(pa,pb);
    $("result").classList.remove("hidden");$("result").textContent="Distance routière : "+fmt(calculatedKm);
    $("saveTrip").disabled=false;setMsg("tripMessage","");
  }catch(e){calculatedKm=null;$("saveTrip").disabled=true;$("result").classList.add("hidden");setMsg("tripMessage",e.message,true)}
  finally{$("calculate").disabled=false}
};
$("reverse").onclick=()=>{const a=$("departure").value;$("departure").value=$("arrival").value;$("arrival").value=a};
$("gps").onclick=()=>{
  if(!navigator.geolocation){setMsg("tripMessage","GPS indisponible.",true);return}
  setMsg("tripMessage","Localisation en cours…");
  navigator.geolocation.getCurrentPosition(async p=>{
    try{
      const u=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.coords.latitude}&lon=${p.coords.longitude}`;
      const r=await fetch(u),d=await r.json();$("departure").value=d.display_name||`${p.coords.latitude},${p.coords.longitude}`;setMsg("tripMessage","");
    }catch{$("departure").value=`${p.coords.latitude},${p.coords.longitude}`;setMsg("tripMessage","Position GPS récupérée.")}
  },()=>setMsg("tripMessage","Impossible d'obtenir la position.",true));
};
$("tripForm").onsubmit=async e=>{
  e.preventDefault();if(calculatedKm==null)return;
  const {error}=await client.from("trips").insert({user_id:user.id,trip_date:$("date").value,departure:$("departure").value.trim(),arrival:$("arrival").value.trim(),distance_km:calculatedKm,reason:$("reason").value.trim()});
  if(error){setMsg("tripMessage",error.message,true);return}
  calculatedKm=null;$("saveTrip").disabled=true;$("result").classList.add("hidden");$("departure").value="";$("arrival").value="";$("reason").value="";
  setMsg("tripMessage","Trajet enregistré ✅");await loadTrips();
};
$("yearSelect").onchange=()=>{populateYears();renderStats();renderHistory()};
$("historyMonth").onchange=renderHistory;
$("history").onclick=async e=>{
  const b=e.target.closest("button");if(!b)return;
  const id=b.dataset.id,t=trips.find(x=>String(x.id)===id);if(!t)return;
  if(b.classList.contains("delete")){
    if(!confirm("Supprimer ce trajet ?"))return;
    const {error}=await client.from("trips").delete().eq("id",id).eq("user_id",user.id);
    if(error){setMsg("tripMessage",error.message,true);return} await loadTrips();
  } else {
    $("date").value=t.trip_date;$("departure").value=t.departure;$("arrival").value=t.arrival;$("reason").value=t.reason||"";
    calculatedKm=Number(t.distance_km);$("result").classList.remove("hidden");$("result").textContent="Distance enregistrée : "+fmt(calculatedKm);$("saveTrip").disabled=false;
    setMsg("tripMessage","Trajet chargé. Enregistrer créera une nouvelle ligne.");
    window.scrollTo({top:0,behavior:"smooth"});
  }
};

async function boot(){
  if(window.SUPABASE_URL.includes("COLLE_ICI")||window.SUPABASE_PUBLISHABLE_KEY.includes("COLLE_ICI")){
    showAuth();setMsg("authMessage","La connexion Supabase n'est pas encore configurée. Termine l'étape de configuration indiquée avec la V2.",true);return;
  }
  const {data}=await client.auth.getSession();
  if(data.session){user=data.session.user;showApp();await loadProfile();await loadTrips()}else showAuth();
}
client.auth.onAuthStateChange((_event,session)=>{
  if(session&&!user){user=session.user;showApp();loadProfile();loadTrips()}
  if(!session){user=null;showAuth()}
});
boot();
