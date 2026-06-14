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
  const shortName = name.length>14 ? name.slice(0,14) : name;
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
/* Value already billed for an order */
function getOrderBilledValue(o){
  return (o.items||[]).reduce((s,i)=> s + (Number(i.billedQty)||0)*(Number(i.rate)||0), 0);
}

let approvalsOutstandingMap = {}; // outletId -> {os, plan, received}, from latest open date
let approvalsTab = 'pending';

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

function initApprovalsPanel(containerSelector, companyId, getOrders, onChange){
  const root = $(containerSelector);
  if(!root) return;

  root.innerHTML = `
    <div class="pill-tabs" id="apprTabs">
      <button class="pill-tab" data-t="pending">Pending Approval</button>
      <button class="pill-tab" data-t="ready">Ready for Billing</button>
      <button class="pill-tab" data-t="billed">Billed</button>
      <button class="pill-tab" data-t="rejected">Rejected</button>
    </div>
    <div id="apprList"><div class="spinner"></div></div>
  `;
  $all('#apprTabs .pill-tab').forEach(b=>{
    b.classList.toggle('active', b.dataset.t===approvalsTab);
    b.addEventListener('click', ()=>{
      approvalsTab = b.dataset.t;
      $all('#apprTabs .pill-tab').forEach(x=>x.classList.toggle('active', x===b));
      renderApprovalsList(companyId, getOrders());
    });
  });

  loadApprovalsOutstanding(companyId).then(()=> renderApprovalsList(companyId, getOrders()));
}

function renderApprovalsList(companyId, orders){
  const listEl = $('#apprList');
  if(!listEl) return;
  orders = orders || [];

  orders = orders.filter(o=> inSalesHeadScope(o.salesmanName));

  let filtered;
  if(approvalsTab==='pending') filtered = orders.filter(o=> o.approvalStatus==='pending');
  else if(approvalsTab==='ready') filtered = orders.filter(o=> o.approvalStatus==='approved' && o.status!=='billed');
  else if(approvalsTab==='billed') filtered = orders.filter(o=> o.approvalStatus==='approved' && o.status==='billed');
  else filtered = orders.filter(o=> o.approvalStatus==='rejected');

  if(filtered.length===0){
    const msgs = {pending:'No orders waiting for approval.', ready:'No approved orders awaiting billing.', billed:'No billed orders yet.', rejected:'No rejected orders.'};
    listEl.innerHTML = `<div class="empty-state"><div class="es-icon">✅</div><h4>Nothing here</h4><p>${msgs[approvalsTab]}</p></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(o=>{
    const os = approvalsOutstandingMap[o.outletId];
    const itemsList = (o.items||[]).map(it=>`${escapeHtml(it.itemName)} × ${it.orderedQty}`).join(', ');
    let actions = '';
    if(approvalsTab==='pending'){
      actions = `
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn btn-success btn-sm" data-approve="${o.id}">✓ Approve</button>
          <button class="btn btn-danger btn-sm" data-reject="${o.id}">✕ Reject</button>
        </div>`;
    } else if(approvalsTab==='ready' || approvalsTab==='billed'){
      actions = `<div style="margin-top:8px;"><span class="badge badge-${o.status==='billed'?'green':o.status==='partial'?'blue':'amber'}">${o.status}</span></div>`;
    } else {
      actions = o.rejectionReason ? `<div class="helper-text" style="margin-top:6px;">Reason: ${escapeHtml(o.rejectionReason)}</div>` : '';
    }
    const cardClass = approvalsTab==='rejected' ? 'pending' : (approvalsTab==='billed' ? 'billed' : (approvalsTab==='ready' ? 'partial' : ''));
    return `
      <div class="list-card ${cardClass}">        <div class="lc-top">
          <div>
            <div class="lc-title">${escapeHtml(o.outletName)} ${o.isNewOutlet?'<span class="badge badge-amber">New Outlet</span>':''}</div>
            <div class="lc-meta">${fmtDateDisplay(o.date)} · ${escapeHtml(o.salesmanName)} · ${escapeHtml(o.brand)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700;">${fmtINR(o.totalValue)}</div>
          </div>
        </div>
        <div class="lc-meta" style="margin-top:4px;">${itemsList}</div>
        ${os ? `<div class="lc-meta" style="margin-top:6px;">
            Outstanding: <b>${fmtINR(os.os)}</b> &nbsp;•&nbsp; Plan: ${fmtINR(os.plan)} &nbsp;•&nbsp; Received: ${fmtINR(os.received)}
          </div>` : (approvalsTab==='pending' ? `<div class="helper-text" style="margin-top:6px;">No current outstanding data for this outlet.</div>` : '')}
        ${actions}
      </div>`;
  }).join('');

  if(approvalsTab==='pending'){
    listEl.querySelectorAll('[data-approve]').forEach(btn=>{
      btn.addEventListener('click', ()=> approveOrder(companyId, orders.find(o=>o.id===btn.dataset.approve)));
    });
    listEl.querySelectorAll('[data-reject]').forEach(btn=>{
      btn.addEventListener('click', ()=> rejectOrder(companyId, orders.find(o=>o.id===btn.dataset.reject)));
    });
  }
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
function openOrderItemsModal(order){
  const ds = getOrderDisplayStatus(order);
  const showBilled = order.status==='partial' || order.status==='billed';

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

  openModal(`
    <h3>${escapeHtml(order.outletName)} — Item Details</h3>
    <div class="helper-text" style="margin-bottom:10px;">
      ${fmtDateDisplay(order.date)} · ${escapeHtml(order.salesmanName)} · ${escapeHtml(order.brand)}
      &nbsp; <span class="badge badge-${ds.color}">${ds.label}</span>
    </div>
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
    <div style="margin-top:14px;">
      <button class="btn btn-outline" id="closeOrderItemsBtn">Close</button>
    </div>
  `);
  $('#closeOrderItemsBtn').addEventListener('click', closeModal);
}
