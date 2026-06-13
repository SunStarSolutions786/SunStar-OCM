/* ============================================================
   SunStar OCM — app-employee.js
   Employee: no-login universal link — place orders, view own orders
============================================================ */

let empSelectedOutlet = null;
let empOutletIsNew = false;
let empBrandFilter = null;
let empCart = {}; // itemId -> {itemName, brand, rate, qty, stockQty}
let empActiveTab = 'order';

/* ---------- Entry ---------- */
function showEmpFullScreenMessage(title, msg){
  $('#appRoot').innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo" style="background:var(--red-600);">!</div>
        <h2>${escapeHtml(title)}</h2>
        <div class="auth-sub">${msg}</div>
      </div>
    </div>`;
}

function renderEmployeeEntry(){
  if(!APP.token){
    showEmpFullScreenMessage('Invalid Link','This link is missing required information. Please ask your office for the correct link.');
    return;
  }
  DB.collection('companies').where('employeeToken','==',APP.token).limit(1).get().then(snap=>{
    if(snap.empty){
      showEmpFullScreenMessage('Invalid Link','This link is no longer valid. Please ask your office for an updated link.');
      return;
    }
    const doc = snap.docs[0];
    APP.companyId = doc.id;
    APP.companyData = Object.assign({id:doc.id}, doc.data());
    const sub = getSubscriptionStatus(APP.companyData);
    if(!sub.active){
      showEmpFullScreenMessage('Access Suspended','Your company\'s subscription has expired. Please contact your office to restore access.');
      return;
    }
    if(!APP.salesman){
      const saved = sessionStorage.getItem('emp_sm_'+APP.token);
      if(saved) APP.salesman = saved;
    } else {
      sessionStorage.setItem('emp_sm_'+APP.token, APP.salesman);
    }
    if(APP.salesman) loadEmployeeData();
    else renderSalesmanPicker();
  });
}

function renderSalesmanPicker(){
  $('#appRoot').innerHTML='';
  const root = el(`
    <div class="emp-shell">
      <div class="emp-topbar">
        <div class="et-row">
          <div>
            <div class="et-title">${escapeHtml(APP.companyData.name)}</div>
            <div class="et-sub">SunStar OCM</div>
          </div>
        </div>
      </div>
      <div class="emp-content">
        <div class="card">
          <div class="card-title">Select Your Name</div>
          <div id="salesmanList"></div>
          <div class="empty-state hidden" id="smEmpty">
            <div class="es-icon">🧑‍💼</div><h4>No salesmen found</h4>
            <p>Ask your admin to add outlets with salesman names in the Master.</p>
          </div>
        </div>
      </div>
    </div>
  `);
  $('#appRoot').appendChild(root);

  DB.collection('companies').doc(APP.companyId).collection('outlets').get().then(snap=>{
    const names = new Set();
    snap.forEach(d=>{ const sm=d.data().salesmanName; if(sm) names.add(sm); });
    const list = $('#salesmanList');
    if(names.size===0){ $('#smEmpty').classList.remove('hidden'); return; }
    [...names].sort().forEach(name=>{
      const btn = el(`<button class="btn btn-outline btn-block" style="margin-bottom:8px;justify-content:flex-start;">${escapeHtml(name)}</button>`);
      btn.addEventListener('click', ()=>{
        APP.salesman = name;
        sessionStorage.setItem('emp_sm_'+APP.token, name);
        loadEmployeeData();
      });
      list.appendChild(btn);
    });
  });
}

function loadEmployeeData(){
  $('#appRoot').innerHTML='';
  const root = el(`
    <div class="emp-shell">
      <div class="emp-topbar">
        <div class="et-row">
          <div>
            <div class="et-title">${escapeHtml(APP.companyData.name)}</div>
            <div class="et-sub">${escapeHtml(APP.salesman)}</div>
          </div>
          <div class="et-avatar" id="empAvatar" title="Switch user">${escapeHtml(APP.salesman.slice(0,2).toUpperCase())}</div>
        </div>
      </div>
      <div class="emp-content" id="empContent"></div>
      <div class="bottom-nav">
        <div class="bottom-nav-inner" id="empBottomNav"></div>
      </div>
    </div>
  `);
  $('#appRoot').appendChild(root);

  $('#empAvatar').addEventListener('click', ()=>{
    if(confirm('Switch to a different salesman name?')){
      sessionStorage.removeItem('emp_sm_'+APP.token);
      APP.salesman=null;
      renderSalesmanPicker();
    }
  });

  const navItems = [
    {key:'order', label:'New Order', icon:'🛒'},
    {key:'myorders', label:'My Orders', icon:'📋'},
    {key:'collection', label:'Collection', icon:'💰'},
    {key:'reports', label:'Reports', icon:'📈'}
  ];
  const navEl = $('#empBottomNav');
  navItems.forEach(item=>{
    const btn = el(`<button class="bn-item ${empActiveTab===item.key?'active':''}" data-key="${item.key}">
      <span class="nav-icon">${item.icon}</span><span>${item.label}</span></button>`);
    btn.addEventListener('click', ()=>{ empActiveTab=item.key; renderEmpTab(); });
    navEl.appendChild(btn);
  });

  // Live outlets & items
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

function renderEmpTab(){
  $all('.bn-item').forEach(b=> b.classList.toggle('active', b.dataset.key===empActiveTab));
  if(empActiveTab==='order') renderEmpOrderTab();
  else if(empActiveTab==='collection') renderEmpCollectionTab();
  else if(empActiveTab==='reports') renderEmpReportsTab();
  else if(empActiveTab==='approvals') renderShApprovalsTab();
  else renderEmpMyOrdersTab();
}

/* ============================================================
   ORDER TAB
============================================================ */
function renderEmpOrderTab(){
  const content = $('#empContent');
  let myOutlets;
  if(APP.role==='saleshead'){
    myOutlets = (APP.outlets||[]).filter(o=> inSalesHeadScope(o.salesmanName))
      .slice().sort((a,b)=>a.outletName.localeCompare(b.outletName));
  } else {
    myOutlets = (APP.outlets||[]).filter(o=>o.salesmanName===APP.salesman);
  }

  content.innerHTML = `
    <div class="card">
      <div class="field" style="margin-bottom:0;">
        <label>Outlet</label>
        <select class="input" id="empOutletSelect">
          <option value="">— Select Outlet —</option>
          ${myOutlets.map(o=>`<option value="${escapeHtml(o.outletName)}" ${!empOutletIsNew && empSelectedOutlet===o.outletName?'selected':''}>${escapeHtml(o.outletName)}${APP.role==='saleshead'?' — '+escapeHtml(o.salesmanName||'Unassigned'):''}</option>`).join('')}
          <option value="__other__" ${empOutletIsNew?'selected':''}>✏️ Other (outlet not listed)</option>
        </select>
      </div>
      <div class="field hidden" id="empOtherOutletField" style="margin-top:10px;margin-bottom:0;">
        <label>Type Outlet Name</label>
        <input class="input" id="empOtherOutletInput" placeholder="Enter new outlet name" value="${empOutletIsNew?escapeHtml(empSelectedOutlet||''):''}">
        <div class="helper-text">Your admin will verify this name and add it to the Master.</div>
      </div>
    </div>
    ${myOutlets.length===0 ? `<div class="helper-text" style="margin-top:8px;">No outlets are mapped to your name yet. You can still place an order by typing the outlet name above.</div>` : ''}
    <div id="empOrderBody"></div>
  `;
  const otherField = $('#empOtherOutletField');
  const otherInput = $('#empOtherOutletInput');
  if(empOutletIsNew) otherField.classList.remove('hidden');

  $('#empOutletSelect').addEventListener('change', e=>{
    if(e.target.value==='__other__'){
      empOutletIsNew = true;
      otherField.classList.remove('hidden');
      empSelectedOutlet = otherInput.value.trim() || null;
    } else {
      empOutletIsNew = false;
      otherField.classList.add('hidden');
      empSelectedOutlet = e.target.value || null;
    }
    empCart = {}; empBrandFilter = null;
    renderEmpOrderBody();
  });
  otherInput.addEventListener('input', ()=>{
    empSelectedOutlet = otherInput.value.trim() || null;
    renderEmpOrderBody();
  });
  renderEmpOrderBody();
}

function renderEmpOrderBody(){
  const body = $('#empOrderBody');
  if(!empSelectedOutlet){ body.innerHTML=''; const bar=$('#empCartBar'); if(bar) bar.remove(); return; }

  const brands = [...new Set((APP.items||[]).map(i=>i.brand).filter(Boolean))].sort();
  if(!empBrandFilter && brands.length) empBrandFilter = brands[0];

  if(brands.length===0){
    body.innerHTML = `<div class="empty-state"><div class="es-icon">🗃️</div><h4>No stock available</h4><p>Ask your admin to upload stock.</p></div>`;
    return;
  }

  body.innerHTML = `
    <div class="pill-tabs" id="empBrandTabs"></div>
    <div class="field" style="margin-bottom:10px;">
      <input class="input" id="empItemSearch" placeholder="Search item...">
    </div>
    <div id="empItemList"></div>
  `;
  $('#empItemSearch').addEventListener('input', ()=> renderEmpItemList());
  const tabsEl = $('#empBrandTabs');
  brands.forEach(b=>{
    const btn = el(`<button class="pill-tab ${empBrandFilter===b?'active':''}">${escapeHtml(b)}</button>`);
    btn.addEventListener('click', ()=>{ empBrandFilter=b; empCart={}; renderEmpOrderBody(); });
    tabsEl.appendChild(btn);
  });
  renderEmpItemList();
  renderEmpCartBar();
}

function renderEmpItemList(){
  const search = norm($('#empItemSearch') ? $('#empItemSearch').value : '');
  let items = (APP.items||[]).filter(i=>i.brand===empBrandFilter);
  if(search) items = items.filter(i=> norm(i.itemName).includes(search));
  const listEl = $('#empItemList');
  if(items.length===0){
    listEl.innerHTML = `<div class="empty-state"><div class="es-icon">📦</div><h4>No items found</h4></div>`;
  } else {
    listEl.innerHTML='';
    items.forEach(it=>{
      const cartQty = empCart[it.id] ? empCart[it.id].qty : 0;
      const card = el(`
        <div class="list-card">
          <div class="lc-top">
            <div>
              <div class="lc-title">${escapeHtml(it.itemName)}</div>
              <div class="lc-meta">In stock: ${fmtNum(it.qty)} &nbsp;•&nbsp; ${fmtINR(it.rate)}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
            <button class="btn btn-outline btn-sm" data-act="dec">−</button>
            <input type="number" class="input" style="text-align:center;max-width:80px;" min="0" value="${cartQty}" data-itemid="${it.id}">
            <button class="btn btn-outline btn-sm" data-act="inc">+</button>
          </div>
        </div>
      `);
      const input = card.querySelector('input');
      const setQty = (val)=>{
        val = Math.max(0, Number(val)||0);
        input.value = val;
        if(val>0) empCart[it.id] = {itemId:it.id, itemName:it.itemName, brand:it.brand, rate:it.rate, qty:val, stockQty:it.qty};
        else delete empCart[it.id];
        renderEmpCartBar();
      };
      card.querySelector('[data-act="dec"]').addEventListener('click', ()=> setQty(Number(input.value)-1));
      card.querySelector('[data-act="inc"]').addEventListener('click', ()=> setQty(Number(input.value)+1));
      input.addEventListener('input', ()=> setQty(input.value));
      listEl.appendChild(card);
    });
  }
  renderEmpCartBar();
}

function renderEmpCartBar(){
  let bar = $('#empCartBar');
  const items = Object.values(empCart);
  if(items.length===0){ if(bar) bar.remove(); return; }
  const total = items.reduce((s,i)=>s+i.qty*i.rate,0);
  const count = items.reduce((s,i)=>s+i.qty,0);
  if(!bar){
    bar = el(`<div id="empCartBar" style="position:fixed;left:0;right:0;bottom:62px;z-index:45;padding:0 14px;max-width:560px;margin:0 auto;width:100%;"></div>`);
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <button id="placeOrderBtn" class="btn btn-accent btn-block" style="box-shadow:var(--shadow-md);padding:13px;">
      ${count} item${count>1?'s':''} · ${fmtINR(total)} — Review Order
    </button>
  `;
  $('#placeOrderBtn').addEventListener('click', openOrderConfirmModal);
}

function openOrderConfirmModal(){
  const items = Object.values(empCart);
  const total = items.reduce((s,i)=>s+i.qty*i.rate,0);
  openModal(`
    <h3>Confirm Order</h3>
    <div class="helper-text" style="margin-bottom:10px;">
      Outlet: <b>${escapeHtml(empSelectedOutlet)}</b> &nbsp;|&nbsp; Brand: <b>${escapeHtml(empBrandFilter)}</b>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Value</th></tr></thead>
        <tbody>
          ${items.map(i=>`<tr><td>${escapeHtml(i.itemName)}</td><td>${i.qty}</td><td>${fmtINR(i.rate)}</td><td>${fmtINR(i.qty*i.rate)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="3" style="text-align:right;font-weight:700;">Total</td><td style="font-weight:700;">${fmtINR(total)}</td></tr></tfoot>
      </table>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;">
      <button class="btn btn-accent" id="confirmOrderBtn">Place Order</button>
      <button class="btn btn-outline" id="cancelOrderBtn">Back</button>
    </div>
  `);
  $('#cancelOrderBtn').addEventListener('click', closeModal);
  $('#confirmOrderBtn').addEventListener('click', submitOrder);
}

function submitOrder(){
  const items = Object.values(empCart);
  if(items.length===0) return;
  const btn = $('#confirmOrderBtn');
  btn.disabled = true; btn.textContent='Placing...';

  const itemsRef = DB.collection('companies').doc(APP.companyId).collection('items');
  const orderRef = DB.collection('companies').doc(APP.companyId).collection('orders').doc();

  DB.runTransaction(async tx=>{
    const refs = items.map(i=> itemsRef.doc(i.itemId));
    const docs = await Promise.all(refs.map(r=>tx.get(r)));
    docs.forEach((d,idx)=>{
      const curQty = (d.data() && d.data().qty) || 0;
      tx.update(refs[idx], {qty: curQty - items[idx].qty});
    });
    const total = items.reduce((s,i)=>s+i.qty*i.rate,0);
    const matchedOutlet = APP.role==='saleshead'
      ? (APP.outlets||[]).find(o=> o.outletName===empSelectedOutlet)
      : (APP.outlets||[]).find(o=> o.outletName===empSelectedOutlet && o.salesmanName===APP.salesman);
    const orderSalesman = APP.role==='saleshead'
      ? (matchedOutlet && matchedOutlet.salesmanName ? matchedOutlet.salesmanName : 'Sales Head')
      : APP.salesman;
    tx.set(orderRef, {
      date: todayStr(),
      outletName: empSelectedOutlet,
      outletId: matchedOutlet ? matchedOutlet.id : null,
      isNewOutlet: !matchedOutlet,
      salesmanName: orderSalesman,
      placedBy: APP.role==='saleshead' ? 'Sales Head' : APP.salesman,
      brand: empBrandFilter,
      items: items.map(i=>({itemId:i.itemId, itemName:i.itemName, orderedQty:i.qty, rate:i.rate, value:i.qty*i.rate, billedQty:0, remainingQty:i.qty, stockAtOrder:i.stockQty})),
      totalValue: total,
      status: 'pending',
      approvalStatus: APP.role==='saleshead' ? 'approved' : 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }).then(()=>{
    showToast('Order placed successfully','success');
    empCart = {};
    closeModal();
    const bar = $('#empCartBar'); if(bar) bar.remove();
    renderEmpOrderBody();
  }).catch(err=>{
    showToast('Error: '+err.message,'error');
    btn.disabled=false; btn.textContent='Place Order';
  });
}

/* ============================================================
   MY ORDERS TAB
============================================================ */
let empOrdersFilter = 'all';

let empOrdersSalesmanFilter = '';

function renderEmpMyOrdersTab(){
  const bar = $('#empCartBar'); if(bar) bar.remove();
  const content = $('#empContent');
  const isSH = APP.role==='saleshead';
  content.innerHTML = `
    <div class="pill-tabs" id="empOrderStatusTabs">
      <button class="pill-tab ${empOrdersFilter==='all'?'active':''}" data-f="all">All</button>
      <button class="pill-tab ${empOrdersFilter==='pending'?'active':''}" data-f="pending">Pending</button>
      <button class="pill-tab ${empOrdersFilter==='partial'?'active':''}" data-f="partial">Partial</button>
      <button class="pill-tab ${empOrdersFilter==='billed'?'active':''}" data-f="billed">Billed</button>
    </div>
    ${isSH ? `<div class="field"><select class="input" id="empOrdersSalesmanFilter"><option value="">All Salesmen</option></select></div>` : ''}
    <div id="empOrdersList"><div class="spinner"></div></div>
  `;
  $all('#empOrderStatusTabs .pill-tab').forEach(b=>{
    b.addEventListener('click', ()=>{ empOrdersFilter=b.dataset.f; renderEmpMyOrdersTab(); });
  });
  if(isSH){
    $('#empOrdersSalesmanFilter').addEventListener('change', e=>{ empOrdersSalesmanFilter=e.target.value; renderEmpMyOrdersTab(); });
  }

  let query = DB.collection('companies').doc(APP.companyId).collection('orders');
  if(!isSH) query = query.where('salesmanName','==',APP.salesman);
  query.orderBy('createdAt','desc').limit(isSH?300:100).get().then(snap=>{
      let orders=[];
      snap.forEach(d=> orders.push(Object.assign({id:d.id}, d.data())));
      if(isSH){
        orders = orders.filter(o=> inSalesHeadScope(o.salesmanName));
        const salesmen = [...new Set(orders.map(o=>o.salesmanName))].sort();
        const sel = $('#empOrdersSalesmanFilter');
        const cur = empOrdersSalesmanFilter;
        sel.innerHTML = '<option value="">All Salesmen</option>' + salesmen.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        sel.value = cur;
        if(empOrdersSalesmanFilter) orders = orders.filter(o=>o.salesmanName===empOrdersSalesmanFilter);
      }
      if(empOrdersFilter!=='all') orders = orders.filter(o=>o.status===empOrdersFilter);
      const listEl = $('#empOrdersList');
      if(orders.length===0){
        listEl.innerHTML = `<div class="empty-state"><div class="es-icon">📋</div><h4>No orders found</h4></div>`;
        return;
      }
      listEl.innerHTML = orders.map(o=>`
        <div class="list-card ${o.status}">
          <div class="lc-top">
            <div>
              <div class="lc-title">${escapeHtml(o.outletName)}</div>
              <div class="lc-meta">${fmtDateDisplay(o.date)} · ${isSH?escapeHtml(o.salesmanName)+' · ':''}${escapeHtml(o.brand)} · ${o.items.length} item(s)</div>
            </div>
            <span class="badge badge-${o.status==='billed'?'green':o.status==='partial'?'blue':'amber'}">${o.status}</span>
          </div>
          <div style="font-weight:700;margin-top:6px;">${fmtINR(o.totalValue)}</div>
        </div>
      `).join('');
    });
}

/* ============================================================
   COLLECTION TAB (Employee) — view OS, enter Plan
============================================================ */
let empCollDate = todayStr();

function renderEmpCollectionTab(){
  const bar = $('#empCartBar'); if(bar) bar.remove();
  const content = $('#empContent');
  const isSH = APP.role==='saleshead';
  content.innerHTML = `
    <div class="card">
      <div class="field" style="margin-bottom:0;">
        <label>Date</label>
        <input type="date" class="input" id="empCollDateInput" value="${empCollDate}">
      </div>
    </div>
    <div class="field">
      <input class="input" id="empCollSearch" placeholder="Search outlet...">
    </div>
    ${isSH ? `<div class="field"><select class="input" id="empCollSalesmanFilter"><option value="">All Salesmen</option></select></div>` : ''}
    <div id="empCollList"><div class="spinner"></div></div>
  `;
  $('#empCollDateInput').addEventListener('change', e=>{ empCollDate=e.target.value; loadEmpCollection(); });
  $('#empCollSearch').addEventListener('input', ()=> renderEmpCollList());
  if(isSH){
    $('#empCollSalesmanFilter').addEventListener('change', e=>{ empCollSalesmanFilter=e.target.value; renderEmpCollList(); });
  }
  loadEmpCollection();
}

let empCollEntries = [];
let empCollSalesmanFilter = '';

function loadEmpCollection(){
  const listEl = $('#empCollList');
  listEl.innerHTML = `<div class="spinner"></div>`;
  DB.collection('companies').doc(APP.companyId).collection('outstanding').doc(empCollDate).get().then(doc=>{
    const data = doc.exists ? doc.data() : {status:'open', outlets:{}};
    if(data.status==='finalized'){
      listEl.innerHTML = `<div class="empty-state"><div class="es-icon">🔒</div><h4>Date Finalized</h4><p>This date has been finalized by your admin.</p></div>`;
      return;
    }
    if(APP.role==='saleshead'){
      empCollEntries = Object.entries(data.outlets||{}).filter(([id,o])=> inSalesHeadScope(o.salesmanName));
      const sel = $('#empCollSalesmanFilter');
      if(sel){
        const salesmen = [...new Set(empCollEntries.map(([id,o])=>o.salesmanName).filter(Boolean))].sort();
        const cur = empCollSalesmanFilter;
        sel.innerHTML = '<option value="">All Salesmen</option>' + salesmen.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        sel.value = cur;
      }
    } else {
      empCollEntries = Object.entries(data.outlets||{}).filter(([id,o])=> o.salesmanName===APP.salesman);
    }
    empCollEntries.sort((a,b)=> (a[1].outletName||'').localeCompare(b[1].outletName||''));
    renderEmpCollList();
  });
}

function renderEmpCollList(){
  const listEl = $('#empCollList');
  if(empCollEntries.length===0){
    listEl.innerHTML = `<div class="empty-state"><div class="es-icon">💰</div><h4>No outstanding data</h4><p>Your admin has not uploaded outstanding for this date yet.</p></div>`;
    return;
  }
  const isSH = APP.role==='saleshead';
  const search = norm($('#empCollSearch') ? $('#empCollSearch').value : '');
  let entries = empCollEntries;
  if(search) entries = entries.filter(([id,o])=> norm(o.outletName).includes(search));
  if(isSH && empCollSalesmanFilter) entries = entries.filter(([id,o])=> o.salesmanName===empCollSalesmanFilter);
  if(entries.length===0){
    listEl.innerHTML = `<div class="empty-state"><div class="es-icon">🔍</div><h4>No matching outlets</h4></div>`;
    return;
  }
    listEl.innerHTML = entries.map(([id,o])=>`
      <div class="list-card">
        <div class="lc-top">
          <div>
            <div class="lc-title">${escapeHtml(o.outletName)}</div>
            <div class="lc-meta">${isSH?escapeHtml(o.salesmanName||'—')+' · ':''}Outstanding: ${fmtINR(o.os)}</div>
          </div>
        </div>
        <div class="input-row" style="margin-top:8px;">
          <div class="field" style="margin-bottom:0;">
            <label>Collection Plan (₹)</label>
            <input type="number" class="input emp-plan-input" data-id="${id}" value="${o.plan||0}">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>Received (₹)</label>
            <input type="number" class="input emp-received-input" data-id="${id}" value="${o.received||0}" ${isSH?'':'readonly'}>
          </div>
        </div>
      </div>
    `).join('');

    $all('.emp-plan-input').forEach(inp=>{
      inp.addEventListener('change', ()=>{
        const id = inp.dataset.id;
        const val = Number(inp.value)||0;
        DB.collection('companies').doc(APP.companyId).collection('outstanding').doc(empCollDate)
          .update({[`outlets.${id}.plan`]: val})
          .then(()=> showToast('Plan saved','success'));
      });
    });
    if(isSH){
      $all('.emp-received-input').forEach(inp=>{
        inp.addEventListener('change', ()=>{
          const id = inp.dataset.id;
          const val = Number(inp.value)||0;
          DB.collection('companies').doc(APP.companyId).collection('outstanding').doc(empCollDate)
            .update({[`outlets.${id}.received`]: val})
            .then(()=> showToast('Received saved','success'));
        });
      });
    }
}

/* ============================================================
   MY REPORTS TAB (Employee)
============================================================ */
let empRepRange = 'month';

let empRepSalesmanFilter = '';

function renderEmpReportsTab(){
  const bar = $('#empCartBar'); if(bar) bar.remove();
  const content = $('#empContent');
  const isSH = APP.role==='saleshead';
  content.innerHTML = `
    <div class="pill-tabs" id="empRepRangeTabs">
      <button class="pill-tab" data-r="today">Today</button>
      <button class="pill-tab" data-r="week">This Week</button>
      <button class="pill-tab" data-r="month">This Month</button>
    </div>
    ${isSH ? `<div class="field"><select class="input" id="empRepSalesmanFilter"><option value="">All Salesmen</option></select></div>` : ''}
    <div class="grid grid-2" id="empRepKpis"><div class="spinner"></div></div>
    <div class="card">
      <div class="card-title">Order Status Breakdown</div>
      <div id="empRepStatus"></div>
    </div>
  `;
  $all('#empRepRangeTabs .pill-tab').forEach(b=>{
    b.classList.toggle('active', b.dataset.r===empRepRange);
    b.addEventListener('click', ()=>{
      empRepRange=b.dataset.r;
      $all('#empRepRangeTabs .pill-tab').forEach(x=>x.classList.toggle('active', x===b));
      loadEmpReports();
    });
  });
  if(isSH){
    $('#empRepSalesmanFilter').addEventListener('change', e=>{ empRepSalesmanFilter=e.target.value; loadEmpReports(); });
  }
  loadEmpReports();
}

async function loadEmpReports(){
  $('#empRepKpis').innerHTML = '<div class="spinner"></div>';
  try{
  const {from,to} = getRangeDates(empRepRange);
  const isSH = APP.role==='saleshead';

  let oQuery = DB.collection('companies').doc(APP.companyId).collection('orders');
  if(!isSH) oQuery = oQuery.where('salesmanName','==',APP.salesman);
  const ordersSnap = await oQuery.where('date','>=',from).where('date','<=',to).get();
  let orders=[]; ordersSnap.forEach(d=>orders.push(d.data()));

  const outSnap = await DB.collection('companies').doc(APP.companyId).collection('outstanding')
    .where(firebase.firestore.FieldPath.documentId(),'>=',from)
    .where(firebase.firestore.FieldPath.documentId(),'<=',to).get();

  let plan=0, received=0;
  if(isSH){
    orders = orders.filter(o=> inSalesHeadScope(o.salesmanName));
    // populate salesman dropdown from scope (or all outlets' salesmen)
    const sel = $('#empRepSalesmanFilter');
    if(sel){
      const allSalesmen = [...new Set((APP.outlets||[]).map(o=>o.salesmanName).filter(Boolean))].filter(inSalesHeadScope).sort();
      const cur = empRepSalesmanFilter;
      sel.innerHTML = '<option value="">All Salesmen</option>' + allSalesmen.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
      sel.value = cur;
    }
    if(empRepSalesmanFilter) orders = orders.filter(o=>o.salesmanName===empRepSalesmanFilter);
    outSnap.forEach(d=> Object.values(d.data().outlets||{}).forEach(o=>{
      if(!inSalesHeadScope(o.salesmanName)) return;
      if(empRepSalesmanFilter && o.salesmanName!==empRepSalesmanFilter) return;
      plan+=Number(o.plan)||0; received+=Number(o.received)||0;
    }));
  } else {
    outSnap.forEach(d=> Object.values(d.data().outlets||{}).forEach(o=>{
      if(o.salesmanName===APP.salesman){ plan+=Number(o.plan)||0; received+=Number(o.received)||0; }
    }));
  }

  const totalValue = orders.reduce((s,o)=>s+(o.totalValue||0),0);
  const pending = orders.filter(o=>o.status==='pending').length;
  const partial = orders.filter(o=>o.status==='partial').length;
  const billed = orders.filter(o=>o.status==='billed').length;

  $('#empRepKpis').innerHTML = `
    <div class="kpi blue"><div class="label">Order Value</div><div class="value">${fmtINR(totalValue)}</div><div class="sub">${orders.length} order(s)</div></div>
    <div class="kpi green"><div class="label">Collection</div><div class="value">${fmtINR(received)}</div><div class="sub">Plan: ${fmtINR(plan)}</div></div>
  `;
  $('#empRepStatus').innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <span class="badge badge-amber">Pending: ${pending}</span>
      <span class="badge badge-blue">Partial: ${partial}</span>
      <span class="badge badge-green">Billed: ${billed}</span>
    </div>
  `;
  } catch(err){
    console.error('Employee reports load error:', err);
    $('#empRepKpis').innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="es-icon">⚠️</div><h4>Could not load reports</h4><p>${escapeHtml(err.message)}</p>
      </div>`;
    $('#empRepStatus').innerHTML = '';
  }
}
