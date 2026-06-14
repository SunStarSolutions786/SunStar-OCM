/* ============================================================
   SunStar OCM — app-saleshead.js
   Sales Head: lightweight login (multi-head supported), full
   employee-style app with order approval built into Orders tab
============================================================ */

function renderSalesHeadEntry(){
  if(!APP.companyId || !APP.salesHeadId){
    $('#appRoot').innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <div class="auth-logo" style="background:var(--red-600);">!</div><h2>Invalid Link</h2>
      <div class="auth-sub">This Sales Head link is incomplete. Please ask your Admin for the correct link.</div>
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
    const head = (APP.companyData.salesHeads||[]).find(h=>h.id===APP.salesHeadId);
    if(!head){
      $('#appRoot').innerHTML = `<div class="auth-wrap"><div class="auth-card">
        <div class="auth-logo" style="background:var(--red-600);">!</div><h2>Not Set Up</h2>
        <div class="auth-sub">This Sales Head account no longer exists. Please ask your Admin for an updated link.</div>
      </div></div>`;
      return;
    }
    APP.salesHeadConfig = head;

    const sub = getSubscriptionStatus(APP.companyData);
    if(!sub.active){
      $('#appRoot').innerHTML = `<div class="auth-wrap"><div class="auth-card">
        <div class="auth-logo" style="background:var(--red-600);">!</div><h2>Subscription Expired</h2>
        <div class="auth-sub">This company's subscription is currently inactive.</div>
      </div></div>`;
      return;
    }

    const sessKey = 'saleshead_auth_'+APP.companyId+'_'+APP.salesHeadId;
    if(sessionStorage.getItem(sessKey)==='1'){
      renderSalesHeadApp();
    } else {
      renderSalesHeadLogin();
    }
  });
}

function renderSalesHeadLogin(){
  const head = APP.salesHeadConfig;
  const root = el(`
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">S</div>
        <h2>${escapeHtml(APP.companyData.name)}</h2>
        <div class="auth-sub">Sales Head Login — ${escapeHtml(head.name)}</div>
        <div class="auth-error" id="shErr">Incorrect password. Please try again.</div>
        <div class="field">
          <label>Password</label>
          <input type="password" class="input" id="shPass" placeholder="Enter password">
        </div>
        <button class="btn btn-accent btn-block" id="shLoginBtn">Log In</button>
      </div>
    </div>
  `);
  $('#appRoot').innerHTML='';
  $('#appRoot').appendChild(root);

  const doLogin = ()=>{
    const p = $('#shPass').value.trim();
    if(p === head.password){
      sessionStorage.setItem('saleshead_auth_'+APP.companyId+'_'+APP.salesHeadId,'1');
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
            <div class="et-sub">Sales Head · ${escapeHtml(APP.salesHeadConfig.name)}</div>
          </div>
          <div class="et-avatar" id="shAvatar" title="Log out">${escapeHtml(APP.salesHeadConfig.name.slice(0,2).toUpperCase())}</div>
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
      sessionStorage.removeItem('saleshead_auth_'+APP.companyId+'_'+APP.salesHeadId);
      location.reload();
    }
  });

  const navItems = [
    {key:'order', label:'New Order', icon:'🛒'},
    {key:'myorders', label:'Orders', icon:'📋'},
    {key:'collection', label:'Collection', icon:'💰'},
    {key:'reports', label:'Reports', icon:'📈'}
  ];
  empActiveTab = 'myorders';
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
