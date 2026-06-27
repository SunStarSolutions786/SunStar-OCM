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
  n = Math.round(Number(n)||0);
  return '₹' + n.toLocaleString('en-IN', {maximumFractionDigits:0});
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
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
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
    const backdrop = root.querySelector('#sidebarBackdrop');
    const setOpen = (open)=>{
      sidebar.classList.toggle('open', open);
      if(backdrop) backdrop.classList.toggle('open', open);
    };
    if(toggle) toggle.addEventListener('click', ()=> setOpen(!sidebar.classList.contains('open')));
    if(backdrop) backdrop.addEventListener('click', ()=> setOpen(false));
    sidebar && sidebar.addEventListener('click', e=>{
      if(e.target.closest('.nav-item') && window.innerWidth<=880) setOpen(false);
    });
  });
  return root;
}

/* ---------- PWA setup: per-role install name + manifest ---------- */
function setupPWA(){
  let name = 'SunStar OCM';
  if(APP.role==='admin'){
    name = APP.companyData ? `${APP.companyData.name} — Admin` : 'SunStar OCM — Admin';
  } else if(APP.role==='employee'){
    name = APP.salesman ? `SunStar OCM — ${APP.salesman}` : 'SunStar OCM — Orders';
  } else if(APP.role==='saleshead'){
    name = APP.salesHeadConfig ? `SunStar OCM — ${APP.salesHeadConfig.name}` : 'SunStar OCM — Sales Head';
  } else if(APP.role==='superadmin'){
    name = 'SunStar OCM — Super Admin';
  }
  const shortName = 'SunStar OCM';
  const base = location.origin + location.pathname.replace(/\/[^\/]*$/, '/');

  const manifest = {
    name, short_name: shortName,
    start_url: location.href,
    scope: base,
    display:'standalone', orientation:'portrait',
    background_color:'#f6f7fb', theme_color:'#1e2a4a',
    icons:[
      {src: base+'icon-192.png', sizes:'192x192', type:'image/png', purpose:'any'},
      {src: base+'icon-512.png', sizes:'512x512', type:'image/png', purpose:'any'},
      {src: base+'icon-192-maskable.png', sizes:'192x192', type:'image/png', purpose:'maskable'},
      {src: base+'icon-512-maskable.png', sizes:'512x512', type:'image/png', purpose:'maskable'}
    ]
  };
  const blob = new Blob([JSON.stringify(manifest)], {type:'application/json'});
  const link = document.getElementById('appManifest');
  if(link) link.setAttribute('href', URL.createObjectURL(blob));

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register(base+'service-worker.js').catch(()=>{});
  }
}

function setPageTitle(title){
  const elT = $('#pageTitle');
  if(elT) elT.textContent = title;
}

function swapContent(renderFn){ renderFn(); }

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
      setupPWA();
      renderSuperAdminEntry();
    } else if(view === 'admin'){
      APP.role='admin';
      APP.companyId = params.get('company') || null;
      setupPWA();
      renderAdminEntry();
    } else if(view === 'order'){
      APP.role='employee';
      APP.token = params.get('token') || null;
      APP.salesman = params.get('sm') || null;
      setupPWA();
      renderEmployeeEntry();
    } else if(view === 'saleshead'){
      APP.role='saleshead';
      APP.companyId = params.get('company') || null;
      APP.salesHeadId = params.get('head') || null;
      setupPWA();
      renderSalesHeadEntry();
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

/* ============================================================
   SHARED — Order Approval Panel (used by Admin & Sales Head)
============================================================ */
function inSalesHeadScope(salesmanName){
  if(APP.role!=='saleshead') return true;
  const scope = (APP.salesHeadConfig && APP.salesHeadConfig.salesmen) || [];
  if(!scope.length) return true;
  return scope.includes(salesmanName);
}

/* Unified order status used across Orders (Admin/Employee/Sales Head) */
function getOrderDisplayStatus(o){
  if(o.approvalStatus==='pending') return {key:'pending_approval', label:'Pending Approval', color:'amber'};
  if(o.approvalStatus==='rejected') return {key:'rejected', label:'Rejected', color:'red'};
  if(o.status==='billed') return {key:'billed', label:'Billed', color:'green'};
  if(o.status==='partial') return {key:'partial', label:'Partial', color:'blue'};
  return {key:'ready', label:'Ready for Billing', color:'blue'};
}

/* Value remaining to be billed for an order */
function getOrderPendingValue(o){
  return (o.items||[]).reduce((s,i)=> s + (Number(i.remainingQty)||0)*(Number(i.rate)||0), 0);
}

let approvalsOutstandingMap = {}; // outletId -> {os, plan, received}, from latest open date

async function loadApprovalsOutstanding(companyId){
  approvalsOutstandingMap = {};
  try{
    const snap = await DB.collection('companies').doc(companyId).collection('outstanding')
      .orderBy('__name__','desc').limit(1).get();
    if(!snap.empty){
      const doc = snap.docs[0];
      if(doc.data().status==='open'){
        Object.entries(doc.data().outlets||{}).forEach(([id,o])=>{
          approvalsOutstandingMap[id] = o;
        });
      }
    }
  }catch(e){ console.error('Outstanding lookup error', e); }
}

function approveOrder(companyId, order){
  DB.collection('companies').doc(companyId).collection('orders').doc(order.id)
    .update({approvalStatus:'approved'})
    .then(()=> showToast('Order approved','success'));
}

function rejectOrder(companyId, order){
  const reason = prompt('Reason for rejection (optional):','') || '';
  const itemsRef = DB.collection('companies').doc(companyId).collection('items');
  const orderRef = DB.collection('companies').doc(companyId).collection('orders').doc(order.id);
  DB.runTransaction(async tx=>{
    const refs = order.items.map(i=> itemsRef.doc(i.itemId));
    const docs = await Promise.all(refs.map(r=>tx.get(r)));
    order.items.forEach((it,idx)=>{
      const restore = it.remainingQty||0;
      if(restore>0){
        const curQty = (docs[idx].data() && docs[idx].data().qty) || 0;
        tx.update(refs[idx], {qty: curQty + restore});
      }
    });
    tx.update(orderRef, {approvalStatus:'rejected', rejectionReason:reason});
  }).then(()=> showToast('Order rejected — stock restored','success'))
    .catch(err=> showToast('Error: '+err.message,'error'));
}

/* ============================================================
   SHARED — Order Item-wise Detail Modal
   (used by Admin Orders, Employee My Orders, Sales Head Orders)
============================================================ */
function openOrderItemsModal(order, onChange){
  const ds = getOrderDisplayStatus(order);
  const showBilled = order.status==='partial' || order.status==='billed';
  const os = order.outletId ? approvalsOutstandingMap[order.outletId] : null;

  const rows = (order.items||[]).map(it=>{
    const value = (it.orderedQty||0)*(it.rate||0);
    const billedValue = (it.billedQty||0)*(it.rate||0);
    return `
      <tr>
        <td>${escapeHtml(it.itemName)}</td>
        <td style="text-align:center;">${it.orderedQty}</td>
        <td style="text-align:right;">${fmtINR(it.rate)}</td>
        <td style="text-align:right;">${fmtINR(value)}</td>
        ${showBilled ? `<td style="text-align:center;">${it.billedQty||0}</td><td style="text-align:right;">${fmtINR(billedValue)}</td>` : ''}
      </tr>`;
  }).join('');

  const totalQty = (order.items||[]).reduce((s,i)=>s+(i.orderedQty||0),0);
  const totalValue = order.totalValue || (order.items||[]).reduce((s,i)=>s+(i.orderedQty||0)*(i.rate||0),0);
  const totalBilledQty = (order.items||[]).reduce((s,i)=>s+(i.billedQty||0),0);
  const totalBilledValue = (order.items||[]).reduce((s,i)=>s+(i.billedQty||0)*(i.rate||0),0);

  let noteHtml = '';
  if(ds.key==='pending_approval' && os){
    noteHtml = `<div class="card" style="background:var(--amber-100);border-color:var(--amber-600);margin-bottom:12px;">
      <div class="card-title" style="margin:0 0 4px;">Outlet Outstanding (latest open date)</div>
      <div class="lc-meta">Outstanding: <b>${fmtINR(os.os)}</b> · Plan: <b>${fmtINR(os.plan)}</b> · Received: <b>${fmtINR(os.received)}</b></div>
    </div>`;
  } else if(ds.key==='pending_approval'){
    noteHtml = `<div class="helper-text" style="margin-bottom:12px;">No current outstanding data found for this outlet.</div>`;
  } else if(ds.key==='rejected' && order.rejectionReason){
    noteHtml = `<div class="helper-text" style="margin-bottom:12px;">Rejection reason: ${escapeHtml(order.rejectionReason)}</div>`;
  }

  const canApprove = ds.key==='pending_approval' && APP.role==='saleshead';

  openModal(`
    <h3>${escapeHtml(order.outletName)} — Item Details</h3>
    <div class="helper-text" style="margin-bottom:10px;">
      ${fmtDateDisplay(order.date)} · ${escapeHtml(order.salesmanName)} · ${escapeHtml(order.brand)}
      &nbsp; <span class="badge badge-${ds.color}">${ds.label}</span>
    </div>
    ${noteHtml}
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Item</th><th>Qty</th><th>Rate</th><th>Value</th>
          ${showBilled ? `<th>Billed Qty</th><th>Billed Value</th>` : ''}
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="font-weight:700;">
            <td>Total</td>
            <td style="text-align:center;">${fmtNum(totalQty)}</td>
            <td></td>
            <td style="text-align:right;">${fmtINR(totalValue)}</td>
            ${showBilled ? `<td style="text-align:center;">${fmtNum(totalBilledQty)}</td><td style="text-align:right;">${fmtINR(totalBilledValue)}</td>` : ''}
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
      ${canApprove ? `<button class="btn btn-success" id="modalApproveBtn">✓ Approve</button>
        <button class="btn btn-danger" id="modalRejectBtn">✕ Reject</button>` : ''}
      <button class="btn btn-outline" id="closeOrderItemsBtn">Close</button>
    </div>
  `);
  $('#closeOrderItemsBtn').addEventListener('click', closeModal);
  if(canApprove){
    $('#modalApproveBtn').addEventListener('click', ()=>{
      approveOrder(APP.companyId, order);
      closeModal();
      if(onChange) onChange();
    });
    $('#modalRejectBtn').addEventListener('click', ()=>{
      rejectOrder(APP.companyId, order);
      closeModal();
      if(onChange) onChange();
    });
  }
}
