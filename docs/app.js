"use strict";

/*
  SKYCONNECTION — hardened browser demo engine
  IMPORTANT: GitHub Pages/static HTML cannot securely host real user databases,
  passwords, private ID documents, or authoritative verification. This build
  hardens the browser demo, but production deployment must move auth/data/uploads
  to a server-side backend with HttpOnly/Secure/SameSite sessions.
*/
const DB_KEY = "skyconnection_db_v5";
const SESSION_KEY = "skyconnection_session_v5";
let MAX_MESSAGE_LENGTH = 1000;
let MAX_BIO_LENGTH = 500;
let MAX_IMAGE_BYTES = 2 * 1024 * 1024;
let MAX_DB_BYTES = 4 * 1024 * 1024;
let MIN_PASSWORD_LENGTH = 10;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg","image/png","image/webp"]);

let currentUser = null;
let activeChatTargetId = null;
let reportTargetId = null;
let toastTimer = null;

const defaultAvatar = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80";

let initialUsers = [];
let initialEvents = [];
let APP_CONFIG = null;


async function loadStaticData(){
  try{
    const [cfgRes,dataRes]=await Promise.all([fetch("config.json",{cache:"no-store"}),fetch("data.json",{cache:"no-store"})]);
    if(!cfgRes.ok||!dataRes.ok) throw new Error("Static JSON unavailable");
    APP_CONFIG=await cfgRes.json(); const data=await dataRes.json();
    initialUsers=Array.isArray(data.users)?data.users:[]; initialEvents=Array.isArray(data.events)?data.events:[];
    MAX_MESSAGE_LENGTH=Number(APP_CONFIG.maxMessageLength)||1000; MAX_BIO_LENGTH=Number(APP_CONFIG.maxBioLength)||500; MAX_IMAGE_BYTES=Number(APP_CONFIG.maxImageBytes)||2097152; MAX_DB_BYTES=Number(APP_CONFIG.maxDatabaseBytes)||4194304; MIN_PASSWORD_LENGTH=Number(APP_CONFIG.minPasswordLength)||10;
  }catch(err){ console.warn("Static JSON unavailable; using safe defaults.",err); APP_CONFIG={maxMessageLength:1000,maxBioLength:500,maxImageBytes:2097152,maxDatabaseBytes:4194304,minPasswordLength:10}; initialUsers=[]; initialEvents=[]; }
}

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function text(v,max=1000){ return String(v ?? "").trim().slice(0,max); }
function safeId(v){ return /^[A-Za-z0-9_-]{1,80}$/.test(String(v||"")) ? String(v) : null; }
function normalizeEmail(v){ return String(v||"").trim().toLowerCase().slice(0,254); }
function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function sanitizeHTML(str){
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function safeImageUrl(v){
  try { const u=new URL(String(v||""),location.href); if(u.protocol==="https:" && u.hostname==="images.unsplash.com") return u.href; } catch(_){}
  return defaultAvatar;
}
function escapeAttr(v){ return sanitizeHTML(v).replace(/`/g,"&#096;"); }

function showToast(message,type="success"){
  const t=document.getElementById("toast"); if(!t)return;
  t.textContent=text(message,200); t.className=`toast show ${type}`;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.className="toast",3000);
}
function storageGet(key){ try{return localStorage.getItem(key);}catch(_){return null;} }
function storageSet(key,value){ try{ if(value.length>MAX_DB_BYTES) throw new Error("quota"); localStorage.setItem(key,value); return true;}catch(_){showToast("Local storage is unavailable or full. No data was saved.","error");return false;} }
function getSession(){ try{return sessionStorage.getItem(SESSION_KEY);}catch(_){return null;} }
function setSession(id){ try{ if(id)sessionStorage.setItem(SESSION_KEY,id);else sessionStorage.removeItem(SESSION_KEY); }catch(_){} }

function cleanUser(u){
  if(!u || !safeId(u.id)) return null;
  return {id:String(u.id),email:normalizeEmail(u.email),name:text(u.name,120),dob:/^\d{4}-\d{2}-\d{2}$/.test(u.dob)?u.dob:"",gender:text(u.gender,40),nationality:text(u.nationality,80),staff:text(u.staff,40),role:text(u.role,60),airline:text(u.airline,100),location:text(u.location,80),avatarUrl:safeImageUrl(u.avatarUrl),bio:text(u.bio,MAX_BIO_LENGTH),verified:Boolean(u.verified),privacy:{discoverable:u.privacy?.discoverable!==false,allowMessages:u.privacy?.allowMessages!==false,showAirline:u.privacy?.showAirline!==false,showBase:u.privacy?.showBase!==false},purposes:Array.isArray(u.purposes)?u.purposes.map(x=>text(x,40)).filter(Boolean).slice(0,10):[],passwordRecord:(u.passwordRecord?.algo==="PBKDF2-SHA-256"&&typeof u.passwordRecord.hash==="string"&&typeof u.passwordRecord.salt==="string")?{algo:"PBKDF2-SHA-256",iterations:Number(u.passwordRecord.iterations)||150000,salt:u.passwordRecord.salt,hash:u.passwordRecord.hash}:undefined};
}
function newDB(){
  return {version:5,users:clone(initialUsers),matches:[{user1:"1",user2:"2",status:"mutual",requester:"1"},{user1:"1",user2:"3",status:"pending",requester:"3"}],likes:[{from:"1",to:"2"},{from:"2",to:"1"},{from:"3",to:"1"}],passes:[],messages:[{id:"m1",sender:"1",receiver:"2",text:"Hey Sofia! Nice to connect with another crew member here.",timestamp:Date.now()-3600000},{id:"m2",sender:"2",receiver:"1",text:"Hi Alex! Always great to meet folks from other carriers. How is your roster looking this month?",timestamp:Date.now()-1800000}],events:clone(initialEvents),reports:[]};
}
function normalizeDB(db){
  const base=newDB(); if(!db||typeof db!=="object")return base;
  base.users=Array.isArray(db.users)?db.users.map(cleanUser).filter(Boolean):base.users;
  const ids=new Set(base.users.map(u=>u.id));
  const pairKey=(a,b)=>[String(a),String(b)].sort().join("|");
  const pairs=new Set();
  base.matches=Array.isArray(db.matches)?db.matches.filter(m=>ids.has(m.user1)&&ids.has(m.user2)&&m.user1!==m.user2&&(m.status==="pending"||m.status==="mutual")&&(!pairs.has(pairKey(m.user1,m.user2))&&pairs.add(pairKey(m.user1,m.user2)))).map(m=>({user1:String(m.user1),user2:String(m.user2),status:m.status,requester:String(m.requester)})):base.matches;
  const seenLikes=new Set(); base.likes=Array.isArray(db.likes)?db.likes.filter(x=>ids.has(x.from)&&ids.has(x.to)&&x.from!==x.to&&!seenLikes.has(`${x.from}|${x.to}`)&&seenLikes.add(`${x.from}|${x.to}`)).map(x=>({from:String(x.from),to:String(x.to)})):[];
  const seenPass=new Set(); base.passes=Array.isArray(db.passes)?db.passes.filter(x=>ids.has(x.from)&&ids.has(x.to)&&x.from!==x.to&&!seenPass.has(`${x.from}|${x.to}`)&&seenPass.add(`${x.from}|${x.to}`)).map(x=>({from:String(x.from),to:String(x.to)})):[];
  base.messages=Array.isArray(db.messages)?db.messages.filter(m=>ids.has(m.sender)&&ids.has(m.receiver)&&m.sender!==m.receiver).slice(-500).map(m=>({id:safeId(m.id)||crypto.randomUUID(),sender:String(m.sender),receiver:String(m.receiver),text:text(m.text,MAX_MESSAGE_LENGTH),timestamp:Number.isFinite(Number(m.timestamp))?Number(m.timestamp):Date.now()})):[];
  base.events=Array.isArray(db.events)?db.events.map(e=>({id:safeId(e.id)||crypto.randomUUID(),title:text(e.title,120),date:text(e.date,100),location:text(e.location,160),description:text(e.description,500),attendees:Array.isArray(e.attendees)?e.attendees.filter(x=>ids.has(x)).map(String):[]})):clone(initialEvents);
  base.reports=Array.isArray(db.reports)?db.reports.slice(-200).map(r=>({id:safeId(r.id)||crypto.randomUUID(),reporter:String(r.reporter),target:String(r.target),reason:text(r.reason,300),timestamp:Number(r.timestamp)||Date.now()})).filter(r=>ids.has(r.reporter)&&ids.has(r.target)):[];
  return base;
}
function getDB(){
  let db; const raw=storageGet(DB_KEY);
  if(raw){try{db=normalizeDB(JSON.parse(raw));}catch(_){db=null;}}
  if(!db){
    // Migrate the old browser demo without retaining plaintext passwords.
    const old=storageGet("skyconnection_db_v4");
    if(old){try{const parsed=JSON.parse(old);db=normalizeDB(parsed);}catch(_){}
      try{localStorage.removeItem("skyconnection_db_v4");}catch(_){}
    }
  }
  if(!db) db=newDB();
  saveDB(db); return db;
}
function saveDB(db){ const clean=normalizeDB(db); storageSet(DB_KEY,JSON.stringify(clean)); return clean; }

async function derivePasswordHash(password,saltBytes){
  const enc=new TextEncoder();
  const material=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:saltBytes,iterations:150000,hash:"SHA-256"},material,256);
  return Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function makePasswordRecord(password){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  return {algo:"PBKDF2-SHA-256",iterations:150000,salt:btoa(String.fromCharCode(...salt)),hash:await derivePasswordHash(password,salt)};
}
async function verifyPassword(password,record){
  try{
    if(record?.algo!=="PBKDF2-SHA-256") return false;
    const salt=Uint8Array.from(atob(record.salt),c=>c.charCodeAt(0));
    const hash=await derivePasswordHash(password,salt);
    return hash===record.hash;
  }catch(_){return false;}
}
function purgeLegacyPlaintextStore(){
  try { localStorage.removeItem("skyconnection_db_v4"); } catch(_) {}
}


async function readImageFile(input){
  const file=input?.files?.[0]; if(!file)return null;
  if(file.size>MAX_IMAGE_BYTES){showToast("Image exceeds the 2MB limit.","error");return null;}
  if(!ALLOWED_IMAGE_TYPES.has(file.type)){showToast("Use JPG, PNG or WebP only.","error");return null;}
  return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>resolve(null);r.readAsDataURL(file);});
}
function calculateAge(dob){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob))return null;
  const d=new Date(dob+"T00:00:00"); if(Number.isNaN(d.getTime()))return null;
  const now=new Date(); let age=now.getFullYear()-d.getFullYear(); const m=now.getMonth()-d.getMonth(); if(m<0||(m===0&&now.getDate()<d.getDate()))age--; return age>=18&&age<=120?age:null;
}
function findUser(db,id){return db.users.find(u=>u.id===id)||null;}
function mutual(db,a,b){return db.matches.some(m=>m.status==="mutual"&&((m.user1===a&&m.user2===b)||(m.user1===b&&m.user2===a)));}
function canMessage(db,a,b){const target=findUser(db,b);return !!target&&a!==b&&target.privacy.allowMessages&&mutual(db,a,b);}
function msg(el,textValue,type){el.textContent=textValue;el.className=`msg ${type||""}`;}

function showLanding(){document.getElementById("landing").classList.remove("hidden");document.getElementById("dashboard").style.display="none";}
function showDashboard(){
  document.getElementById("landing").classList.add("hidden");document.getElementById("dashboard").style.display="block";
  const a=document.getElementById("navAvatar"); a.textContent="";
  if(currentUser.avatarUrl){const img=document.createElement("img");img.src=safeImageUrl(currentUser.avatarUrl);img.alt="Avatar";img.referrerPolicy="no-referrer";a.appendChild(img);}else a.textContent=(currentUser.name||"?").charAt(0);
  setupDashboardNavigation();renderDiscoverCard();renderMatches();renderMessagesList();renderEvents();renderProfile();
}
function setupDashboardNavigation(){
  document.querySelectorAll("#navLinks button").forEach(btn=>{btn.onclick=()=>{document.querySelectorAll("#navLinks button").forEach(b=>b.classList.remove("active"));btn.classList.add("active");const id=btn.dataset.view;document.querySelectorAll(".content .view").forEach(v=>v.classList.toggle("active",v.id===id));};});
  const av=document.getElementById("navAvatar"); if(av)av.onclick=()=>document.querySelector('[data-view="profile"]')?.click();
}

function renderDiscoverCard(){
  const area=document.getElementById("discoverArea"),db=getDB();
  const excluded=new Set([currentUser.id,...db.likes.filter(x=>x.from===currentUser.id).map(x=>x.to),...db.passes.filter(x=>x.from===currentUser.id).map(x=>x.to)]);
  const candidates=db.users.filter(u=>u.id!==currentUser.id&&!excluded.has(u.id)&&u.privacy.discoverable&&u.verified);
  if(!candidates.length){area.innerHTML='<div class="emptyDeck"><h3>You\'re All Caught Up!</h3><p>No new verified crew profiles are available in your discovery circle right now.</p></div>';return;}
  const target=candidates[0],age=calculateAge(target.dob);
  area.innerHTML=`<div class="tinderCard"><div class="tinderPhoto"><div class="online">Verified Crew</div><img src="${escapeAttr(safeImageUrl(target.avatarUrl))}" alt="${escapeAttr(target.name)}" referrerpolicy="no-referrer"></div><div class="tinderBody"><h3>${sanitizeHTML(target.name)}${age!==null?', '+age:''}</h3><div class="tinderMeta">${target.privacy.showAirline?sanitizeHTML(target.airline)+' • ':''}${sanitizeHTML(target.role)}<br>Base: ${target.privacy.showBase?sanitizeHTML(target.location):'Confidential'}</div><p style="font-size:13px;color:var(--text-muted);margin:0 0 16px;line-height:1.6">${sanitizeHTML(target.bio)}</p><div class="chips">${target.purposes.map(p=>`<div class="chip">${sanitizeHTML(p)}</div>`).join("")}</div><div class="tinderActions"><button class="passBtn" data-action="pass" data-id="${escapeAttr(target.id)}">Pass</button><button class="likeBtn" data-action="like" data-id="${escapeAttr(target.id)}">Connect ♡</button></div></div></div>`;
}
function handlePass(targetId){
  if(!currentUser||!safeId(targetId)||targetId===currentUser.id)return; const db=getDB(); if(!findUser(db,targetId))return;
  if(!db.passes.some(x=>x.from===currentUser.id&&x.to===targetId))db.passes.push({from:currentUser.id,to:targetId}); saveDB(db);renderDiscoverCard();
}
function handleLike(targetId){
  if(!currentUser||!safeId(targetId)||targetId===currentUser.id)return; const db=getDB(); const target=findUser(db,targetId); if(!target||!target.privacy.discoverable)return;
  if(!db.likes.some(x=>x.from===currentUser.id&&x.to===targetId))db.likes.push({from:currentUser.id,to:targetId});
  const existing=db.matches.find(m=>(m.user1===currentUser.id&&m.user2===targetId)||(m.user1===targetId&&m.user2===currentUser.id));
  if(mutual(db,currentUser.id,targetId)){ if(existing)existing.status="mutual";else db.matches.push({user1:currentUser.id,user2:targetId,status:"mutual",requester:currentUser.id});showToast("It’s a Mutual Connection! 🎉"); }
  else if(!existing) {db.matches.push({user1:currentUser.id,user2:targetId,status:"pending",requester:currentUser.id});showToast("Connection request sent!");}
  saveDB(db);renderDiscoverCard();renderMatches();renderMessagesList();
}
window.handlePass=handlePass;window.handleLike=handleLike;

function renderMatches(){
 const db=getDB(),matchesList=document.getElementById("matchesList"),requestsList=document.getElementById("requestsList");
 const userMatches=db.matches.filter(m=>m.user1===currentUser.id||m.user2===currentUser.id),mutuals=userMatches.filter(m=>m.status==="mutual"),requests=userMatches.filter(m=>m.status==="pending"&&m.requester!==currentUser.id);
 matchesList.innerHTML=mutuals.length?mutuals.map(m=>{const id=m.user1===currentUser.id?m.user2:m.user1,u=findUser(db,id);if(!u)return"";return `<div class="match"><div class="match-info"><div class="mavatar"><img src="${escapeAttr(safeImageUrl(u.avatarUrl))}" alt="" referrerpolicy="no-referrer"></div><div><b>${sanitizeHTML(u.name)}</b><small>${sanitizeHTML(u.airline)} • ${sanitizeHTML(u.role)}</small></div></div><div class="actions"><button class="smallBtn" data-action="chat" data-id="${escapeAttr(u.id)}">Message</button></div></div>`;}).join(""):'<p style="font-size:12px;color:var(--text-muted)">No mutual connections yet.</p>';
 requestsList.innerHTML=requests.length?requests.map(m=>{const id=m.user1===currentUser.id?m.user2:m.user1,u=findUser(db,id);if(!u)return"";return `<div class="match"><div class="match-info"><div class="mavatar"><img src="${escapeAttr(safeImageUrl(u.avatarUrl))}" alt="" referrerpolicy="no-referrer"></div><div><b>${sanitizeHTML(u.name)}</b><small>${sanitizeHTML(u.airline)}</small></div></div><div class="actions"><button class="smallBtn" data-action="accept" data-u1="${escapeAttr(m.user1)}" data-u2="${escapeAttr(m.user2)}">Accept</button></div></div>`;}).join(""):'<p style="font-size:12px;color:var(--text-muted)">No pending requests.</p>';
}
function acceptRequest(u1,u2){
 if(!currentUser||![u1,u2].includes(currentUser.id))return;const db=getDB(),m=db.matches.find(x=>x.user1===u1&&x.user2===u2&&x.requester!==currentUser.id&&x.status==="pending");if(!m)return;m.status="mutual";saveDB(db);showToast("Connection accepted!");renderMatches();renderMessagesList();
}
window.acceptRequest=acceptRequest;

function renderMessagesList(){
 const db=getDB(),list=document.getElementById("chatList"),matches=db.matches.filter(m=>(m.user1===currentUser.id||m.user2===currentUser.id)&&m.status==="mutual");
 if(!matches.length){list.innerHTML='<p style="font-size:12px;color:var(--text-muted);padding:12px">No active message threads.</p>';return;}
 list.innerHTML=matches.map(m=>{const id=m.user1===currentUser.id?m.user2:m.user1,u=findUser(db,id);if(!u)return"";return `<div class="chatContact ${activeChatTargetId===u.id?'active':''}" data-action="chat" data-id="${escapeAttr(u.id)}"><div class="mavatar"><img src="${escapeAttr(safeImageUrl(u.avatarUrl))}" alt="" referrerpolicy="no-referrer"></div><div style="min-width:0;flex:1"><b style="font-size:13px;display:block">${sanitizeHTML(u.name)}</b><small style="color:var(--text-muted);font-size:11px">${sanitizeHTML(u.airline)}</small></div></div>`;}).join("");
}
function openChat(targetId){
 const db=getDB(); if(!safeId(targetId)||!canMessage(db,currentUser.id,targetId)){showToast("Messaging is only available for mutual connections.","error");return;}
 activeChatTargetId=targetId;document.querySelector('[data-view="messages"]')?.click();renderMessagesList();const u=findUser(db,targetId);document.getElementById("chatHeadTitle").textContent=u?.name||"Chat";document.getElementById("chatInput").disabled=false;document.getElementById("sendBtn").disabled=false;renderActiveMessages();
 if(innerWidth<=650){document.getElementById("chatList").style.display="none";document.getElementById("chatWindow").classList.remove("mobile-list");}
}
window.openChat=openChat;
function renderActiveMessages(){
 const c=document.getElementById("messagesContainer");if(!activeChatTargetId){c.textContent="Select a conversation to start chatting.";return;}
 const db=getDB();if(!canMessage(db,currentUser.id,activeChatTargetId)){c.textContent="This conversation is unavailable.";return;}
 const thread=db.messages.filter(m=>(m.sender===currentUser.id&&m.receiver===activeChatTargetId)||(m.sender===activeChatTargetId&&m.receiver===currentUser.id)).sort((a,b)=>a.timestamp-b.timestamp);
 if(!thread.length){c.textContent="No messages yet. Say hello!";c.style.color="var(--text-muted)";return;}
 c.innerHTML="";thread.forEach(m=>{const row=document.createElement("div");row.style.cssText=`display:flex;justify-content:${m.sender===currentUser.id?'flex-end':'flex-start'}`;const bubble=document.createElement("div");bubble.className=`bubble ${m.sender===currentUser.id?'me':''}`;bubble.textContent=m.text;const time=document.createElement("span");time.className="bubbleTime";time.textContent=new Date(m.timestamp).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});bubble.appendChild(time);row.appendChild(bubble);c.appendChild(row);});c.scrollTop=c.scrollHeight;
}
function sendMessage(){
 const input=document.getElementById("chatInput"),textValue=text(input.value,MAX_MESSAGE_LENGTH);if(!textValue||!activeChatTargetId)return;const db=getDB();if(!canMessage(db,currentUser.id,activeChatTargetId)){showToast("Messaging is unavailable.","error");return;}db.messages.push({id:crypto.randomUUID(),sender:currentUser.id,receiver:activeChatTargetId,text:textValue,timestamp:Date.now()});saveDB(db);input.value="";renderActiveMessages();
}

function renderEvents(){
 const grid=document.getElementById("eventsGrid"),db=getDB();grid.innerHTML=db.events.map(ev=>{const joined=ev.attendees.includes(currentUser.id);return `<div class="event"><div><div class="date">${sanitizeHTML(ev.date)}</div><h3>${sanitizeHTML(ev.title)}</h3><p style="font-size:12px;font-weight:600;color:var(--primary);margin-bottom:8px">${sanitizeHTML(ev.location)}</p><p>${sanitizeHTML(ev.description)}</p></div><div><div class="eventStatus">${ev.attendees.length} Crew Attending</div><button class="smallBtn" style="width:100%" data-action="event" data-id="${escapeAttr(ev.id)}">${joined?'View Details / Attending':'View & Join'}</button></div></div>`;}).join("");
}
function openEventModal(eventId){const db=getDB(),ev=db.events.find(e=>e.id===eventId);if(!ev)return;document.getElementById("modalEventTitle").textContent=ev.title;document.getElementById("modalEventBody").innerHTML=`<b>Date:</b> ${sanitizeHTML(ev.date)}<br><b>Location:</b> ${sanitizeHTML(ev.location)}<br><br>${sanitizeHTML(ev.description)}<br><br><b>Confirmed Attendees:</b> ${ev.attendees.length} Crew Members`;const b=document.getElementById("modalJoinBtn");b.textContent=ev.attendees.includes(currentUser.id)?"Leave Event":"Join Gathering";b.onclick=()=>toggleJoinEvent(ev.id);document.getElementById("eventModal").classList.add("show");}
function closeEventModal(){document.getElementById("eventModal").classList.remove("show");}
function toggleJoinEvent(eventId){const db=getDB(),ev=db.events.find(e=>e.id===eventId);if(!ev)return;const i=ev.attendees.indexOf(currentUser.id);if(i>=0){ev.attendees.splice(i,1);showToast("You have left this gathering.");}else{ev.attendees.push(currentUser.id);showToast("Successfully joined gathering! See you there.");}saveDB(db);closeEventModal();renderEvents();}
window.openEventModal=openEventModal;window.closeEventModal=closeEventModal;window.toggleJoinEvent=toggleJoinEvent;

function renderProfile(){
 const hero=document.getElementById("profileHero"),details=document.getElementById("profileDetails");hero.textContent="";if(currentUser.avatarUrl){const img=document.createElement("img");img.src=safeImageUrl(currentUser.avatarUrl);img.alt="Profile";img.referrerPolicy="no-referrer";hero.appendChild(img);}else hero.textContent=currentUser.name.charAt(0);document.getElementById("profileName").textContent=currentUser.name;details.innerHTML=`<b>Airline:</b> ${sanitizeHTML(currentUser.airline)}<br><b>Role:</b> ${sanitizeHTML(currentUser.role)}<br><b>Base:</b> ${sanitizeHTML(currentUser.location)}<br><b>Nationality:</b> ${sanitizeHTML(currentUser.nationality)}<br><b>Bio:</b> ${sanitizeHTML(currentUser.bio)}`;
}
function openEditModal(){document.getElementById("editName").value=currentUser.name;document.getElementById("editLocation").value=currentUser.location;document.getElementById("editRole").value=currentUser.role;document.getElementById("editBio").value=currentUser.bio||"";document.getElementById("editModal").classList.add("show");}
function closeEditModal(){document.getElementById("editModal").classList.remove("show");}
function openPrivacyModal(){const p=currentUser.privacy;document.getElementById("privacyDiscover").checked=p.discoverable;document.getElementById("privacyMessages").checked=p.allowMessages;document.getElementById("privacyAirline").checked=p.showAirline;document.getElementById("privacyBase").checked=p.showBase;document.getElementById("privacyModal").classList.add("show");}
function closePrivacyModal(){document.getElementById("privacyModal").classList.remove("show");}
function savePrivacy(){const db=getDB(),u=findUser(db,currentUser.id);if(!u)return;u.privacy={discoverable:Boolean(document.getElementById("privacyDiscover").checked),allowMessages:Boolean(document.getElementById("privacyMessages").checked),showAirline:Boolean(document.getElementById("privacyAirline").checked),showBase:Boolean(document.getElementById("privacyBase").checked)};currentUser=saveDB(db).users.find(x=>x.id===u.id);closePrivacyModal();showToast("Privacy preferences saved.");showDashboard();}
function logout(){setSession(null);currentUser=null;activeChatTargetId=null;showToast("Logged out successfully.");showLanding();}
function deleteAccount(){if(!confirm("Delete your local account and local profile data? This cannot be undone."))return;const db=getDB();db.users=db.users.filter(u=>u.id!==currentUser.id);db.likes=db.likes.filter(x=>x.from!==currentUser.id&&x.to!==currentUser.id);db.passes=db.passes.filter(x=>x.from!==currentUser.id&&x.to!==currentUser.id);db.matches=db.matches.filter(x=>x.user1!==currentUser.id&&x.user2!==currentUser.id);db.messages=db.messages.filter(x=>x.sender!==currentUser.id&&x.receiver!==currentUser.id);db.events.forEach(e=>e.attendees=e.attendees.filter(id=>id!==currentUser.id));saveDB(db);logout();showToast("Account deleted.");}
window.openEditModal=openEditModal;window.closeEditModal=closeEditModal;window.openPrivacyModal=openPrivacyModal;window.closePrivacyModal=closePrivacyModal;window.savePrivacy=savePrivacy;window.logout=logout;window.deleteAccount=deleteAccount;

function closeReportModal(){document.getElementById("reportModal")?.classList.remove("show");}
function submitReport(){
 if(!reportTargetId)return;const db=getDB();if(!findUser(db,reportTargetId))return;const reason=text(document.getElementById("reportReason")?.value||"No reason provided",300);db.reports.push({id:crypto.randomUUID(),reporter:currentUser.id,target:reportTargetId,reason,timestamp:Date.now()});saveDB(db);reportTargetId=null;closeReportModal();showToast("Report submitted. Thank you.");
}
window.closeReportModal=closeReportModal;window.submitReport=submitReport;

function bindDelegation(){
 document.addEventListener("click",e=>{
   const el=e.target.closest("[data-action]");if(!el)return;const a=el.dataset.action;
   if(a==="pass")handlePass(el.dataset.id);else if(a==="like")handleLike(el.dataset.id);else if(a==="chat")openChat(el.dataset.id);else if(a==="accept")acceptRequest(el.dataset.u1,el.dataset.u2);else if(a==="event")openEventModal(el.dataset.id);
 });
 const send=document.getElementById("sendBtn"),input=document.getElementById("chatInput");if(send)send.onclick=sendMessage;if(input)input.onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}};
 const back=document.getElementById("backChats");if(back)back.onclick=()=>{document.getElementById("chatList").style.display="block";document.getElementById("chatWindow").classList.add("mobile-list");};
 const edit=document.getElementById("editForm");if(edit)edit.addEventListener("submit",async e=>{e.preventDefault();const db=getDB(),u=findUser(db,currentUser.id);if(!u)return;const name=text(document.getElementById("editName").value,120),loc=text(document.getElementById("editLocation").value,80),bio=text(document.getElementById("editBio").value,MAX_BIO_LENGTH),role=text(document.getElementById("editRole").value,60);if(name.length<2||bio.length>MAX_BIO_LENGTH){showToast("Please check your profile fields.","error");return;}const photo=await readImageFile(document.getElementById("editPhoto"));u.name=name;u.location=loc||"Global";u.role=role;u.bio=bio;if(photo)u.avatarUrl=photo;currentUser=saveDB(db).users.find(x=>x.id===u.id);closeEditModal();showToast("Profile updated successfully!");showDashboard();});
}

async function initAuth(){
  const signupForm=document.getElementById("signupForm");
  const loginForm=document.getElementById("loginForm");
  if(!signupForm||!loginForm) throw new Error("Authentication forms missing");

  loginForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const btn=document.getElementById("loginBtn"),out=document.getElementById("loginMsg");
    if(btn) btn.disabled=true;
    try{
      const email=normalizeEmail(document.getElementById("loginEmail")?.value);
      const password=String(document.getElementById("loginPassword")?.value||"");
      if(!validEmail(email)||!password){ msg(out,"Please enter a valid email and password.","error"); return; }
      const db=getDB(),u=db.users.find(x=>x.email===email);
      if(!u || !(await verifyPassword(password,u.passwordRecord))){ msg(out,"Invalid email or password.","error"); return; }
      currentUser=u; setSession(u.id); if(out) msg(out,"Login successful.","success"); showDashboard();
    }catch(err){ console.error(err); msg(out,"Unable to log in right now. Please try again.","error"); }
    finally{ if(btn) btn.disabled=false; }
  });

  signupForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const btn=signupForm.querySelector('button[type="submit"]'),out=document.getElementById("signupMsg");
    if(btn) btn.disabled=true;
    try{
      const fd=new FormData(signupForm);
      const email=normalizeEmail(fd.get("email"));
      const password=String(fd.get("password")||"");
      const first=text(fd.get("first"),40),last=text(fd.get("last"),40),dob=String(fd.get("dob")||"");
      if(!validEmail(email)||password.length<MIN_PASSWORD_LENGTH||first.length<2||last.length<2){msg(out,`Please use a valid email, a password of at least ${MIN_PASSWORD_LENGTH} characters, and valid names.`,"error");return;}
      const age=calculateAge(dob); if(age===null){msg(out,"You must be 18 or older.","error");return;}
      const db=getDB(); if(db.users.some(u=>u.email===email)){msg(out,"An account with this email already exists.","error");return;}
      const id=crypto.randomUUID();
      const u=cleanUser({id,email,passwordRecord:await makePasswordRecord(password),name:`${first} ${last}`,dob,gender:text(fd.get("gender"),40),nationality:text(fd.get("nationality"),80),staff:text(fd.get("staff"),40),role:text(fd.get("role"),60),airline:text(fd.get("airline"),100),location:text(fd.get("location"),80),avatarUrl:defaultAvatar,bio:text(fd.get("bio"),MAX_BIO_LENGTH),verified:false,privacy:{discoverable:true,allowMessages:true,showAirline:true,showBase:true},purposes:[]});
      if(!u||!u.passwordRecord) throw new Error("Could not create account");
      db.users.push(u); saveDB(db); currentUser=u; setSession(u.id); msg(out,"Account created successfully.","success"); showDashboard();
    }catch(err){console.error(err);msg(out,"Unable to create your account right now.","error");}
    finally{if(btn)btn.disabled=false;}
  });
}

function initTabs(){
 const s=document.getElementById("signupTab"),l=document.getElementById("loginTab"),sw=document.getElementById("switchBtn"),sb=document.getElementById("signupBox"),lb=document.getElementById("loginBox"),title=document.getElementById("authTitle"),sub=document.getElementById("authSub");
 function signup(){s.classList.add("active");l.classList.remove("active");sb.classList.remove("hidden");lb.classList.add("hidden");title.textContent="Create Your Account";sub.textContent="Join the exclusive global cabin crew network";sw.textContent="Log In";}
 function login(){l.classList.add("active");s.classList.remove("active");lb.classList.remove("hidden");sb.classList.add("hidden");title.textContent="Welcome Back";sub.textContent="Access your SkyConnection community profile";sw.textContent="Sign Up";}
 s.onclick=signup;l.onclick=login;sw.onclick=()=>sb.classList.contains("hidden")?signup():login();
}
function initVerification(){const s=document.getElementById("verifyStatus");if(s){s.textContent="Pending review";s.classList.remove("good");}}
function bindStaticActions(){document.addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const a=b.dataset.action;switch(a){case"edit-profile":openEditModal();break;case"privacy-settings":openPrivacyModal();break;case"logout":logout();break;case"delete-account":deleteAccount();break;case"close-event":closeEventModal();break;case"close-edit":closeEditModal();break;case"close-privacy":closePrivacyModal();break;case"save-privacy":savePrivacy();break;case"close-report":closeReportModal();break;case"submit-report":submitReport();break;}});}

function checkActiveSession(){
 const id=getSession();if(!id){showLanding();return;}const db=getDB(),u=findUser(db,id);if(!u){setSession(null);showLanding();return;}currentUser=u;showDashboard();
}

window.addEventListener("storage",e=>{if(e.key===DB_KEY&&currentUser)checkActiveSession();});
document.addEventListener("DOMContentLoaded",async()=>{
  try{
    if(!window.crypto?.subtle||!window.crypto?.randomUUID)throw new Error("Secure crypto unavailable");
    purgeLegacyPlaintextStore();await loadStaticData();getDB();initTabs();initVerification();await initAuth();bindDelegation();bindStaticActions();await checkActiveSession();
  }catch(e){console.error(e);document.body.innerHTML='<main style="padding:40px;font-family:system-ui"><h1>SkyConnection could not start</h1><p>Please use a modern browser over HTTPS.</p></main>';}
});
