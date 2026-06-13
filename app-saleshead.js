/* ============================================================
   SunStar OCM — app-saleshead.js
   Sales Head: lightweight login, approve/reject orders with
   outlet outstanding visibility
============================================================ */

function renderSalesHeadEntry(){
  if(!APP.companyId){
    $('#appRoot').innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <div class="auth-logo" style="background:var(--red-600);">!</div><h2>Invalid Link</h2>
      <div class="auth-sub">No company specified. Please use the link provided by your Admin.</div>
    </div></div>`;
    return;
  }
  DB.collection('companies').doc(APP.companyId).get().then(doc=>{
    if(!doc.exists){
      $('#appRoot').innerHTML = `<div class="auth-wrap"><div class="auth-card">
        <div class="auth-logo" style="background:var(--red-600);">!</div><h2>Company Not Found</h2>
      </div></div>`;
      return;
    }
    APP.companyData = Object.assign({id:doc.id}, doc.data());

    if(!APP.companyData.salesHeadPassword){
      $('#appRoot').innerHTML = `<div class="auth-wrap"><div class="auth-card">
        <div class="auth-logo" style="background:var(--red-600);">!</div><h2>Not Set Up</h2>
        <div class="auth-sub">Sales Head access has not been enabled for this company yet. Please ask your Admin to set it up under Subscription.</div>
      </div></div>`;
      return;
    }

    const sub = getSubscriptionStatus(APP.companyData);
    if(!sub.active){
      $('#appRoot').innerHTML = `<div class="auth-wrap"><div class="auth-card">
        <div class="auth-logo" style="background:var(--red-600);">!</div><h2>Subscription Expired</h2>
        <div class="auth-sub">This company's subscription is currently inactive.</div>
      </div></div>`;
      return;
    }

    if(sessionStorage.getItem('saleshead_auth_'+APP.companyId)==='1'){
      renderSalesHeadApp();
    } else {
      renderSalesHeadLogin();
    }
  });
}

function renderSalesHeadLogin(){
  const root = el(`
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">S</div>
        <h2>${escapeHtml(APP.companyData.name)}</h2>
        <div class="auth-sub">Sales Head Login — SunStar OCM</div>
        <div class="auth-error" id="shErr">Incorrect password. Please try again.</div>
        <div class="field">
          <label>Password</label>
          <input type="password" class="input" id="shPass" placeholder="Enter Sales Head password">
        </div>
        <button class="btn btn-accent btn-block" id="shLoginBtn">Log In</button>
      </div>
    </div>
  `);
  $('#appRoot').innerHTML='';
  $('#appRoot').appendChild(root);

  const doLogin = ()=>{
    const p = $('#shPass').value.trim();
    if(p === APP.companyData.salesHeadPassword){
      sessionStorage.setItem('saleshead_auth_'+APP.companyId,'1');
      renderSalesHeadApp();
    } else {
      $('#shErr').classList.add('show');
    }
  };
  $('#shLoginBtn').addEventListener('click', doLogin);
  $('#shPass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
}

function renderSalesHeadApp(){
  $('#appRoot').innerHTML='';
  const root = el(`
    <div class="emp-shell">
      <div class="emp-topbar">
        <div class="et-row">
          <div>
            <div class="et-title">${escapeHtml(APP.companyData.name)}</div>
            <div class="et-sub">Sales Head</div>
          </div>
          <div class="et-avatar" id="shAvatar" title="Log out">SH</div>
        </div>
      </div>
      <div class="emp-content" id="empContent"></div>
      <div class="bottom-nav">
        <div class="bottom-nav-inner" id="empBottomNav"></div>
      </div>
    </div>
  `);
  $('#appRoot').appendChild(root);

  $('#shAvatar').addEventListener('click', ()=>{
    if(confirm('Log out of Sales Head panel?')){
      sessionStorage.removeItem('saleshead_auth_'+APP.companyId);
      location.reload();
    }
  });

  const navItems = [
    {key:'order', label:'New Order', icon:'🛒'},
    {key:'myorders', label:'Orders', icon:'📋'},
    {key:'approvals', label:'Approvals', icon:'✅'},
    {key:'collection', label:'Collection', icon:'💰'},
    {key:'reports', label:'Reports', icon:'📈'}
  ];
  empActiveTab = 'approvals';
  const navEl = $('#empBottomNav');
  navItems.forEach(item=>{
    const btn = el(`<button class="bn-item ${empActiveTab===item.key?'active':''}" data-key="${item.key}">
      <span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`);
    btn.addEventListener('click', ()=>{ empActiveTab=item.key; renderEmpTab(); });
    navEl.appendChild(btn);
  });

  // Live outlets & items (shared with employee tabs)
  APP.unsub.forEach(u=>u());
  APP.unsub=[];
  const unsub1 = DB.collection('companies').doc(APP.companyId).collection('outlets').onSnapshot(snap=>{
    APP.outlets=[];
    snap.forEach(d=> APP.outlets.push(Object.assign({id:d.id}, d.data())));
    if(empActiveTab==='order') renderEmpTab();
  });
  const unsub2 = DB.collection('companies').doc(APP.companyId).collection('items').onSnapshot(snap=>{
    APP.items=[];
    snap.forEach(d=> APP.items.push(Object.assign({id:d.id}, d.data())));
    if(empActiveTab==='order') renderEmpTab();
  });
  APP.unsub.push(unsub1, unsub2);

  renderEmpTab();
}

/* ---------- Approvals tab wrapper for Sales Head ---------- */
function renderShApprovalsTab(){
  const bar = $('#empCartBar'); if(bar) bar.remove();
  const content = $('#empContent');
  content.innerHTML = `<div id="apprPanel"></div>`;

  let liveOrders = [];
  const unsub = DB.collection('companies').doc(APP.companyId).collection('orders')
    .orderBy('createdAt','desc').limit(300).onSnapshot(snap=>{
      liveOrders=[];
      snap.forEach(d=> liveOrders.push(Object.assign({id:d.id}, d.data())));
      renderApprovalsList(APP.companyId, liveOrders);
    });
  APP.unsub.push(unsub);

  initApprovalsPanel('#apprPanel', APP.companyId, ()=>liveOrders);
}
