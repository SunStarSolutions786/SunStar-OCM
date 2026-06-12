/* ============================================================
   SunStar OCM — app-core.js
   Firebase init, shared utilities, router, shared UI helpers
============================================================ */

let DB, AUTH;
const APP = {
  role: null,        // 'superadmin' | 'admin' | 'employee'
  companyId: null,
  companyData: null,
  token: null,
  salesman: null,
  unsub: []          // active onSnapshot listeners to detach on logout
};

/* ---------- Firebase init ---------- */
firebase.initializeApp(FIREBASE_CONFIG);
DB = firebase.firestore();
AUTH = firebase.auth();

/* ---------- Generic helpers ---------- */
function $(sel, ctx){ return (ctx||document).querySelector(sel); }
function $all(sel, ctx){ return Array.from((ctx||document).querySelectorAll(sel)); }
function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild; }
function escapeHtml(str){
  if(str===null||str===undefined) return '';
  return String(str).replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function fmtINR(n){
  n = Number(n)||0;
  return '₹' + n.toLocaleString('en-IN', {maximumFractionDigits:2});
}
function fmtNum(n){ return Number(n||0).toLocaleString('en-IN'); }
function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fmtDateDisplay(dateStr){
  if(!dateStr) return '—';
  const d = new Date(dateStr+'T00:00:00');
  if(isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
}
function daysBetween(dateStr){
  const today = new Date(todayStr()+'T00:00:00');
  const d = new Date(dateStr+'T00:00:00');
  return Math.round((d-today)/86400000);
}
function genToken(len=10){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s='';
  for(let i=0;i<len;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function uid(prefix=''){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ---------- Toast ---------- */
let toastTimer;
function showToast(msg, type){
  const t = $('#toast');
  t.textContent = msg;
  t.style.background = type==='error' ? 'var(--red-600)' : (type==='success' ? 'var(--green-600)' : 'var(--indigo-900)');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2600);
}

/* ---------- Modal ---------- */
function openModal(innerHtml){
  let overlay = $('#modalOverlay');
  if(!overlay){
    overlay = el(`<div id="modalOverlay" class="modal-overlay"><div class="modal" id="modalBody"></div></div>`);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e=>{ if(e.target===overlay) closeModal(); });
  }
  $('#modalBody').innerHTML = innerHtml;
  overlay.classList.add('open');
}
function closeModal(){
  const overlay = $('#modalOverlay');
  if(overlay) overlay.classList.remove('open');
}

/* ---------- Subscription status helper ----------
   Returns { label, color, daysLeft, active }
   color: green | amber | red | gray (unlimited)
------------------------------------------------- */
function getSubscriptionStatus(company){
  if(!company.expiryDate){
    return { label:'Unlimited', color:'gray', daysLeft:null, active:true };
  }
  const days = daysBetween(company.expiryDate);
  if(days < 0){
    return { label:'Expired '+Math.abs(days)+'d ago', color:'red', daysLeft:days, active:false };
  }
  if(days === 0){
    return { label:'Expires today', color:'red', daysLeft:days, active:true };
  }
  if(days <= 7){
    return { label:days+' day'+(days===1?'':'s')+' left', color:'red', daysLeft:days, active:true };
  }
  if(days <= 15){
    return { label:days+' days left', color:'amber', daysLeft:days, active:true };
  }
  return { label:days+' days left', color:'green', daysLeft:days, active:true };
}

/* ---------- Layout shell builder ----------
   Used by Admin & Super Admin (sidebar layout).
   navItems: [{key, label, icon}]
   Returns root element; content goes into #pageContent
------------------------------------------------- */
function buildShellLayout({brandName, brandSub, navItems, activeKey, onNav, footerHtml, roleClass}){
  const root = el(`
    <div class="app ${roleClass||''}">
      <div class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <div class="mark">S</div>
          <div>
            <div class="name">${escapeHtml(brandName)}</div>
            <div class="sub">${escapeHtml(brandSub)}</div>
          </div>
        </div>
        <div class="nav" id="navList"></div>
        <div class="sidebar-footer" id="sidebarFooter">${footerHtml||''}</div>
      </div>
      <div class="main">
        <div class="topbar">
          <div style="display:flex;align-items:center;gap:10px;">
            <button class="menu-toggle" id="menuToggle">☰</button>
            <h1 id="pageTitle"></h1>
          </div>
          <div class="topbar-right" id="topbarRight"></div>
        </div>
        <div class="content" id="pageContent"></div>
      </div>
    </div>
  `);
  const navList = root.querySelector('#navList');
  navItems.forEach(item=>{
    const btn = el(`<button class="nav-item ${item.key===activeKey?'active':''}" data-key="${item.key}">
        <span class="nav-icon">${item.icon}</span><span>${escapeHtml(item.label)}</span>
      </button>`);
    btn.addEventListener('click', ()=>onNav(item.key));
    navList.appendChild(btn);
  });
  // mobile menu toggle
  setTimeout(()=>{
    const toggle = root.querySelector('#menuToggle');
    const sidebar = root.querySelector('#sidebar');
    if(toggle) toggle.addEventListener('click', ()=> sidebar.classList.toggle('open'));
    sidebar && sidebar.addEventListener('click', e=>{
      if(e.target.closest('.nav-item') && window.innerWidth<=880) sidebar.classList.remove('open');
    });
  });
  return root;
}

function setPageTitle(title){
  const elT = $('#pageTitle');
  if(elT) elT.textContent = title;
}

/* ---------- Router ---------- */
function init(){
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');

  AUTH.signInAnonymously().catch(err=>{
    console.error('Auth error', err);
  });

  AUTH.onAuthStateChanged(user=>{
    if(!user) return;
    $('#loadingScreen').style.display='none';
    $('#appRoot').style.display='block';

    if(view === 'superadmin'){
      APP.role='superadmin';
      renderSuperAdminEntry();
    } else if(view === 'admin'){
      APP.role='admin';
      APP.companyId = params.get('company') || null;
      renderAdminEntry();
    } else if(view === 'order'){
      APP.role='employee';
      APP.token = params.get('token') || null;
      APP.salesman = params.get('sm') || null;
      renderEmployeeEntry();
    } else {
      renderLanding();
    }
  });
}

function renderLanding(){
  const root = el(`
    <div class="auth-wrap">
      <div class="auth-card" style="max-width:440px;">
        <div class="auth-logo">S</div>
        <h2>SunStar OCM</h2>
        <div class="auth-sub">Order &amp; Collection Management</div>
        <div class="helper-text" style="text-align:center;line-height:1.7;">
          This application is accessed via role-specific links provided by your administrator.<br><br>
          <b>Super Admin</b> — append <code>?view=superadmin</code><br>
          <b>Admin</b> — append <code>?view=admin&amp;company=ID</code><br>
          <b>Employee</b> — use the link shared by your admin
        </div>
      </div>
    </div>
  `);
  $('#appRoot').appendChild(root);
}

window.addEventListener('DOMContentLoaded', init);
