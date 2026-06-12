/* ============================================================
   SunStar OCM — app-admin.js
   Admin: login, subscription gate, Master, Stock (brand-wise)
============================================================ */

const ADMIN_NAV = [
  {key:'dashboard', label:'Dashboard', icon:'📊'},
  {key:'orders', label:'Orders', icon:'📦'},
  {key:'stock', label:'Stock', icon:'🗃️'},
  {key:'collection', label:'Outstanding & Collection', icon:'💰'},
  {key:'master', label:'Master', icon:'🗂️'},
  {key:'reports', label:'Reports', icon:'📈'},
  {key:'subscription', label:'Subscription', icon:'⭐'}
];

/* ---------- Helpers ---------- */
function norm(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }

function parseSpreadsheetFile(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = e=>{
      try{
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, {type:'array'});
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:''});
        resolve(rows);
      }catch(err){ reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/* ---------- Entry / Auth ---------- */
function renderAdminEntry(){
  if(!APP.companyId){
    $('#appRoot').innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <div class="auth-logo">!</div><h2>Invalid Link</h2>
      <div class="auth-sub">No company specified. Please use the link provided by your Super Admin.</div>
    </div></div>`;
    return;
  }
  DB.collection('companies').doc(APP.companyId).get().then(doc=>{
    if(!doc.exists){
      $('#appRoot').innerHTML = `<div class="auth-wrap"><div class="auth-card">
        <div class="auth-logo">!</div><h2>Company Not Found</h2>
        <div class="auth-sub">This company account does not exist.</div>
      </div></div>`;
      return;
    }
    APP.companyData = Object.assign({id:doc.id}, doc.data());
    if(sessionStorage.getItem('admin_auth_'+APP.companyId)==='1'){
      checkSubscriptionAndEnter();
    } else {
      renderAdminLogin();
    }
  });
}

function renderAdminLogin(){
  const root = el(`
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">S</div>
        <h2>${escapeHtml(APP.companyData.name)}</h2>
        <div class="auth-sub">Admin Login — SunStar OCM</div>
        <div class="auth-error" id="adErr">Incorrect password. Please try again.</div>
        <div class="field">
          <label>Password</label>
          <input type="password" class="input" id="adPass" placeholder="Enter admin password">
        </div>
        <button class="btn btn-accent btn-block" id="adLoginBtn">Log In</button>
      </div>
    </div>
  `);
  $('#appRoot').innerHTML='';
  $('#appRoot').appendChild(root);

  const doLogin = ()=>{
    const p = $('#adPass').value.trim();
    if(p === APP.companyData.adminPassword){
      sessionStorage.setItem('admin_auth_'+APP.companyId,'1');
      checkSubscriptionAndEnter();
    } else {
      $('#adErr').classList.add('show');
    }
  };
  $('#adLoginBtn').addEventListener('click', doLogin);
  $('#adPass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
}

function checkSubscriptionAndEnter(){
  const sub = getSubscriptionStatus(APP.companyData);
  if(!sub.active){
    $('#appRoot').innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-logo" style="background:var(--red-600);">!</div>
          <h2>Subscription Expired</h2>
          <div class="auth-sub">
            Your SunStar OCM subscription expired on <b>${fmtDateDisplay(APP.companyData.expiryDate)}</b>.<br><br>
            Your data is safe and will be restored once your subscription is renewed. Please contact your service provider to continue.
          </div>
          <button class="btn btn-outline btn-block" id="logoutExpired">Log Out</button>
        </div>
      </div>`;
    $('#logoutExpired').addEventListener('click', ()=>{
      sessionStorage.removeItem('admin_auth_'+APP.companyId);
      location.reload();
    });
    return;
  }
  renderAdminApp('dashboard');
}

/* ---------- Main Admin Shell ---------- */
function renderAdminApp(activeKey){
  $('#appRoot').innerHTML='';
  const sub = getSubscriptionStatus(APP.companyData);
  const root = buildShellLayout({
    brandName: APP.companyData.name,
    brandSub: 'Admin Panel',
    navItems: ADMIN_NAV,
    activeKey,
    roleClass:'role-admin',
    onNav:(key)=> renderAdminApp(key),
    footerHtml:`
      <div class="sub-pill badge-${sub.color}" style="background:var(--${sub.color==='gray'?'gray':sub.color}-100);color:var(--${sub.color==='gray'?'gray':sub.color}-600);margin-bottom:8px;">
        <span class="dot" style="background:var(--${sub.color==='gray'?'gray':sub.color}-600);"></span>
        ${sub.label}
      </div>
      <button class="btn btn-outline btn-block" id="adLogoutBtn">Log Out</button>`
  });
  $('#appRoot').appendChild(root);
  $('#adLogoutBtn').addEventListener('click', ()=>{
    sessionStorage.removeItem('admin_auth_'+APP.companyId);
    location.reload();
  });

  APP.unsub.forEach(u=>u());
  APP.unsub=[];

  const titles = {
    dashboard:'Dashboard', orders:'Orders', stock:'Stock Management',
    collection:'Outstanding & Collection', master:'Master', reports:'Reports',
    subscription:'Subscription'
  };
  setPageTitle(titles[activeKey]||'');

  if(activeKey==='master') renderAdminMaster();
  else if(activeKey==='stock') renderAdminStock();
  else if(activeKey==='orders') renderAdminOrders();
  else if(activeKey==='collection') renderAdminCollection();
  else if(activeKey==='dashboard') renderAdminDashboard();
  else if(activeKey==='reports') renderAdminReports();
  else if(activeKey==='subscription') renderAdminSubscription();
  else renderComingSoon(activeKey);
}

function renderComingSoon(key){
  $('#pageContent').innerHTML = `
    <div class="empty-state">
      <div class="es-icon">🚧</div>
      <h4>Coming Soon</h4>
      <p>This module will be available in the next update.</p>
    </div>`;
}

/* ============================================================
   SUBSCRIPTION TAB
============================================================ */
function renderAdminSubscription(){
  const c = APP.companyData;
  const sub = getSubscriptionStatus(c);
  $('#pageContent').innerHTML = `
    <div class="card" style="max-width:420px;">
      <div class="card-title">Subscription Status</div>
      <div class="kpi ${sub.color}" style="border-left-width:4px;">
        <div class="label">Current Plan</div>
        <div class="value" style="font-size:18px;">${sub.label}</div>
        <div class="sub">Expiry Date: ${c.expiryDate ? fmtDateDisplay(c.expiryDate) : 'No expiry — Unlimited access'}</div>
      </div>
      <div class="divider"></div>
      <p class="helper-text">
        For renewal or plan changes, please contact your SunStar OCM service provider.
        Your data remains safe at all times, even if access is temporarily suspended due to expiry.
      </p>
    </div>
  `;
}

/* ============================================================
   MASTER TAB — Outlet & Salesman
============================================================ */
function renderAdminMaster(){
  const content = $('#pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>Outlet &amp; Salesman Master</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline" id="importMasterBtn">⬆ Import Excel/CSV</button>
        <button class="btn btn-accent" id="addOutletBtn">+ Add Outlet</button>
      </div>
    </div>
    <div class="card">
      <div class="input-row" style="margin-bottom:14px;">
        <input class="input" id="masterSearch" placeholder="Search outlet name...">
        <select class="input" id="masterSalesmanFilter"><option value="">All Salesmen</option></select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Outlet Name</th><th>Salesman</th><th></th></tr></thead>
          <tbody id="masterTbody"></tbody>
        </table>
      </div>
      <div id="masterEmpty" class="empty-state hidden">
        <div class="es-icon">🗂️</div><h4>No outlets yet</h4>
        <p>Add an outlet manually or import from Excel/CSV.</p>
      </div>
    </div>
  `;

  $('#addOutletBtn').addEventListener('click', ()=> openOutletModal(null));
  $('#importMasterBtn').addEventListener('click', ()=> openMasterImportModal());
  $('#masterSearch').addEventListener('input', renderMasterTable);
  $('#masterSalesmanFilter').addEventListener('change', renderMasterTable);

  const unsub = DB.collection('companies').doc(APP.companyId).collection('outlets')
    .orderBy('outletName').onSnapshot(snap=>{
      APP.outlets = [];
      snap.forEach(d=> APP.outlets.push(Object.assign({id:d.id}, d.data())));
      // populate salesman filter
      const salesmen = [...new Set(APP.outlets.map(o=>o.salesmanName).filter(Boolean))].sort();
      const filter = $('#masterSalesmanFilter');
      const cur = filter.value;
      filter.innerHTML = '<option value="">All Salesmen</option>' + salesmen.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
      filter.value = cur;
      renderMasterTable();
    });
  APP.unsub.push(unsub);
}

function renderMasterTable(){
  const search = norm($('#masterSearch').value);
  const smFilter = $('#masterSalesmanFilter').value;
  let list = APP.outlets || [];
  if(search) list = list.filter(o=> norm(o.outletName).includes(search));
  if(smFilter) list = list.filter(o=> o.salesmanName===smFilter);

  const tbody = $('#masterTbody');
  const emptyEl = $('#masterEmpty');
  if(list.length===0){
    tbody.innerHTML='';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  tbody.innerHTML = list.map(o=>`
    <tr>
      <td><b>${escapeHtml(o.outletName)}</b></td>
      <td>${escapeHtml(o.salesmanName||'—')}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-edit="${o.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-del="${o.id}">Delete</button>
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=>{
    const o = APP.outlets.find(x=>x.id===b.dataset.edit);
    openOutletModal(o);
  }));
  tbody.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=>{
    const o = APP.outlets.find(x=>x.id===b.dataset.del);
    if(confirm('Delete outlet "'+o.outletName+'"?')){
      DB.collection('companies').doc(APP.companyId).collection('outlets').doc(o.id).delete()
        .then(()=> showToast('Outlet deleted','success'));
    }
  }));
}

function openOutletModal(outlet){
  const isEdit = !!outlet;
  openModal(`
    <h3>${isEdit?'Edit Outlet':'Add Outlet'}</h3>
    <div class="field">
      <label>Outlet Name</label>
      <input class="input" id="mOutletName" value="${isEdit?escapeHtml(outlet.outletName):''}" placeholder="e.g. Sharma Mobile Store">
    </div>
    <div class="field">
      <label>Salesman Name</label>
      <input class="input" id="mSalesmanName" value="${isEdit?escapeHtml(outlet.salesmanName||''):''}" placeholder="e.g. Rahul Das" list="salesmanSuggestions">
      <datalist id="salesmanSuggestions">
        ${[...new Set((APP.outlets||[]).map(o=>o.salesmanName).filter(Boolean))].map(s=>`<option value="${escapeHtml(s)}">`).join('')}
      </datalist>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-accent" id="saveOutletBtn">${isEdit?'Save':'Add'}</button>
      <button class="btn btn-outline" id="cancelOutletBtn">Cancel</button>
    </div>
  `);
  $('#cancelOutletBtn').addEventListener('click', closeModal);
  $('#saveOutletBtn').addEventListener('click', ()=>{
    const outletName = $('#mOutletName').value.trim();
    const salesmanName = $('#mSalesmanName').value.trim();
    if(!outletName){ showToast('Outlet name is required','error'); return; }
    const ref = DB.collection('companies').doc(APP.companyId).collection('outlets');
    const data = {outletName, salesmanName};
    const promise = isEdit ? ref.doc(outlet.id).update(data) : ref.add(data);
    promise.then(()=>{ showToast(isEdit?'Outlet updated':'Outlet added','success'); closeModal(); });
  });
}

function openMasterImportModal(){
  openModal(`
    <h3>Import Outlet &amp; Salesman Master</h3>
    <p class="helper-text" style="margin-bottom:12px;">
      Excel/CSV columns: <b>Outlet Name</b>, <b>Salesman Name</b>.<br>
      Existing outlets (matched by name) will have their salesman updated. New outlet names will be added automatically.
    </p>
    <div class="field">
      <input type="file" class="input" id="masterImportFile" accept=".xlsx,.xls,.csv">
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-accent" id="masterImportGo">Import</button>
      <button class="btn btn-outline" id="masterImportCancel">Cancel</button>
    </div>
    <div id="masterImportResult" style="margin-top:12px;"></div>
  `);
  $('#masterImportCancel').addEventListener('click', closeModal);
  $('#masterImportGo').addEventListener('click', async ()=>{
    const file = $('#masterImportFile').files[0];
    if(!file){ showToast('Please choose a file','error'); return; }
    const rows = await parseSpreadsheetFile(file);
    if(rows.length<2){ showToast('No data found in file','error'); return; }
    const header = rows[0].map(h=>norm(h));
    const outletIdx = header.findIndex(h=>h.includes('outlet'));
    const salesmanIdx = header.findIndex(h=>h.includes('salesman') || h.includes('sales man'));
    if(outletIdx===-1){ showToast('Column "Outlet Name" not found','error'); return; }

    const ref = DB.collection('companies').doc(APP.companyId).collection('outlets');
    const existing = APP.outlets || [];
    let added=0, updated=0, batch = DB.batch();
    let opCount = 0;

    for(let i=1;i<rows.length;i++){
      const row = rows[i];
      const outletName = String(row[outletIdx]||'').trim();
      if(!outletName) continue;
      const salesmanName = salesmanIdx!==-1 ? String(row[salesmanIdx]||'').trim() : '';
      const match = existing.find(o=> norm(o.outletName)===norm(outletName));
      if(match){
        if(salesmanName && salesmanName!==match.salesmanName){
          batch.update(ref.doc(match.id), {salesmanName});
          updated++; opCount++;
        }
      } else {
        const newRef = ref.doc();
        batch.set(newRef, {outletName, salesmanName});
        existing.push({id:newRef.id, outletName, salesmanName});
        added++; opCount++;
      }
      if(opCount>=400){ await batch.commit(); batch = DB.batch(); opCount=0; }
    }
    if(opCount>0) await batch.commit();
    $('#masterImportResult').innerHTML = `<div class="badge badge-green">Added: ${added}</div> <div class="badge badge-blue" style="margin-left:6px;">Updated: ${updated}</div>`;
    showToast('Import complete','success');
  });
}

/* ============================================================
   STOCK TAB — Brand-wise Item Master
============================================================ */
let currentBrandFilter = 'all';

function renderAdminStock(){
  const content = $('#pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>Stock Management</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline" id="importStockBtn">⬆ Import Stock</button>
        <button class="btn btn-accent" id="addItemBtn">+ Add Item</button>
      </div>
    </div>
    <div class="pill-tabs" id="brandTabs"></div>
    <div class="card">
      <div class="field" style="margin-bottom:10px;">
        <input class="input" id="stockSearch" placeholder="Search item name...">
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Brand</th><th>Qty</th><th>Rate</th><th>Value</th><th></th></tr></thead>
          <tbody id="stockTbody"></tbody>
        </table>
      </div>
      <div id="stockEmpty" class="empty-state hidden">
        <div class="es-icon">🗃️</div><h4>No items yet</h4>
        <p>Add an item manually or import a stock sheet for a brand.</p>
      </div>
    </div>
  `;
  $('#addItemBtn').addEventListener('click', ()=> openItemModal(null));
  $('#importStockBtn').addEventListener('click', ()=> openStockImportModal());
  $('#stockSearch').addEventListener('input', renderStockTable);

  const unsub = DB.collection('companies').doc(APP.companyId).collection('items')
    .orderBy('brand').onSnapshot(snap=>{
      APP.items = [];
      snap.forEach(d=> APP.items.push(Object.assign({id:d.id}, d.data())));
      renderBrandTabs();
      renderStockTable();
    });
  APP.unsub.push(unsub);
}

function renderBrandTabs(){
  const brands = [...new Set((APP.items||[]).map(i=>i.brand).filter(Boolean))].sort();
  const tabsEl = $('#brandTabs');
  if(!tabsEl) return;
  tabsEl.innerHTML = `<button class="pill-tab ${currentBrandFilter==='all'?'active':''}" data-brand="all">All Brands</button>`
    + brands.map(b=>`<button class="pill-tab ${currentBrandFilter===b?'active':''}" data-brand="${escapeHtml(b)}">${escapeHtml(b)}</button>`).join('');
  tabsEl.querySelectorAll('[data-brand]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ currentBrandFilter = btn.dataset.brand; renderBrandTabs(); renderStockTable(); });
  });
}

function renderStockTable(){
  const search = norm($('#stockSearch').value);
  let list = APP.items || [];
  if(currentBrandFilter!=='all') list = list.filter(i=> i.brand===currentBrandFilter);
  if(search) list = list.filter(i=> norm(i.itemName).includes(search));

  const tbody = $('#stockTbody');
  const emptyEl = $('#stockEmpty');
  if(list.length===0){ tbody.innerHTML=''; emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');
  tbody.innerHTML = list.map(i=>`
    <tr>
      <td><b>${escapeHtml(i.itemName)}</b></td>
      <td><span class="badge badge-blue">${escapeHtml(i.brand||'—')}</span></td>
      <td>${fmtNum(i.qty)}</td>
      <td>${fmtINR(i.rate)}</td>
      <td>${fmtINR((i.qty||0)*(i.rate||0))}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-edit="${i.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-del="${i.id}">Delete</button>
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=>{
    openItemModal(APP.items.find(x=>x.id===b.dataset.edit));
  }));
  tbody.querySelectorAll('[data-del]').forEach(b=> b.addEventListener('click', ()=>{
    const it = APP.items.find(x=>x.id===b.dataset.del);
    if(confirm('Delete item "'+it.itemName+'"?')){
      DB.collection('companies').doc(APP.companyId).collection('items').doc(it.id).delete()
        .then(()=> showToast('Item deleted','success'));
    }
  }));
}

function openItemModal(item){
  const isEdit = !!item;
  const brands = [...new Set((APP.items||[]).map(i=>i.brand).filter(Boolean))].sort();
  openModal(`
    <h3>${isEdit?'Edit Item':'Add Item'}</h3>
    <div class="field">
      <label>Brand</label>
      <input class="input" id="iBrand" value="${isEdit?escapeHtml(item.brand||''):''}" placeholder="e.g. Nokia" list="brandSuggestions">
      <datalist id="brandSuggestions">${brands.map(b=>`<option value="${escapeHtml(b)}">`).join('')}</datalist>
    </div>
    <div class="field">
      <label>Item Name</label>
      <input class="input" id="iName" value="${isEdit?escapeHtml(item.itemName):''}" placeholder="e.g. Nokia 105 Classic">
    </div>
    <div class="input-row">
      <div class="field"><label>Quantity</label><input type="number" class="input" id="iQty" value="${isEdit?item.qty:''}" placeholder="0"></div>
      <div class="field"><label>Rate (₹)</label><input type="number" class="input" id="iRate" value="${isEdit?item.rate:''}" placeholder="0"></div>
    </div>
    <div id="dupWarning" class="auth-error" style="margin-bottom:10px;"></div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-accent" id="saveItemBtn">${isEdit?'Save':'Add'}</button>
      <button class="btn btn-outline" id="cancelItemBtn">Cancel</button>
    </div>
  `);
  $('#cancelItemBtn').addEventListener('click', closeModal);
  $('#saveItemBtn').addEventListener('click', ()=>{
    const brand = $('#iBrand').value.trim();
    const itemName = $('#iName').value.trim();
    const qty = Number($('#iQty').value)||0;
    const rate = Number($('#iRate').value)||0;
    if(!brand || !itemName){ showToast('Brand and Item Name are required','error'); return; }

    const ref = DB.collection('companies').doc(APP.companyId).collection('items');

    if(!isEdit){
      // Duplicate-name check within same brand
      const match = (APP.items||[]).find(i=> i.brand===brand && norm(i.itemName)===norm(itemName));
      if(match){
        const warn = $('#dupWarning');
        if(!warn.classList.contains('show')){
          warn.textContent = `An item named "${match.itemName}" already exists under ${brand} (Qty: ${match.qty}). Click Add again to confirm adding a separate entry.`;
          warn.classList.add('show');
          return; // require second click to confirm
        }
      }
    }

    const data = {brand, itemName, qty, rate, updatedAt: firebase.firestore.FieldValue.serverTimestamp()};
    const promise = isEdit ? ref.doc(item.id).update(data) : ref.add(data);
    promise.then(()=>{ showToast(isEdit?'Item updated':'Item added','success'); closeModal(); });
  });
}

function openStockImportModal(){
  const brands = [...new Set((APP.items||[]).map(i=>i.brand).filter(Boolean))].sort();
  openModal(`
    <h3>Import Stock</h3>
    <div class="field">
      <label>Brand</label>
      <input class="input" id="siBrand" placeholder="e.g. Nokia, Infinix, Oppo" list="brandSuggestions2">
      <datalist id="brandSuggestions2">${brands.map(b=>`<option value="${escapeHtml(b)}">`).join('')}</datalist>
      <div class="helper-text">All items in this file belong to this brand.</div>
    </div>
    <div class="field">
      <label>Mode</label>
      <div class="input-row">
        <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px;"><input type="radio" name="siMode" value="add" checked> Add to existing</label>
        <label style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px;"><input type="radio" name="siMode" value="replace"> Replace all</label>
      </div>
      <div class="helper-text">"Replace" deletes all current items under this brand and uploads fresh stock from the file.</div>
    </div>
    <p class="helper-text" style="margin-bottom:12px;">Excel/CSV columns: <b>Item</b>, <b>Qty</b>, <b>Rate</b></p>
    <div class="field">
      <input type="file" class="input" id="stockImportFile" accept=".xlsx,.xls,.csv">
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-accent" id="stockImportGo">Import</button>
      <button class="btn btn-outline" id="stockImportCancel">Cancel</button>
    </div>
    <div id="stockImportResult" style="margin-top:12px;"></div>
  `);
  $('#stockImportCancel').addEventListener('click', closeModal);
  $('#stockImportGo').addEventListener('click', async ()=>{
    const brand = $('#siBrand').value.trim();
    const mode = document.querySelector('input[name="siMode"]:checked').value;
    const file = $('#stockImportFile').files[0];
    if(!brand){ showToast('Please enter a brand name','error'); return; }
    if(!file){ showToast('Please choose a file','error'); return; }

    const rows = await parseSpreadsheetFile(file);
    if(rows.length<2){ showToast('No data found in file','error'); return; }
    const header = rows[0].map(h=>norm(h));
    const itemIdx = header.findIndex(h=>h.includes('item'));
    const qtyIdx = header.findIndex(h=>h.includes('qty')||h.includes('quantity'));
    const rateIdx = header.findIndex(h=>h.includes('rate')||h.includes('price'));
    if(itemIdx===-1 || qtyIdx===-1 || rateIdx===-1){
      showToast('Columns "Item", "Qty", "Rate" are required','error'); return;
    }

    const ref = DB.collection('companies').doc(APP.companyId).collection('items');

    if(mode==='replace'){
      if(!confirm(`This will DELETE all existing "${brand}" items and replace with the file's data. Continue?`)) return;
      const existing = (APP.items||[]).filter(i=>i.brand===brand);
      let batch = DB.batch(); let opCount=0;
      for(const it of existing){ batch.delete(ref.doc(it.id)); opCount++; if(opCount>=400){ await batch.commit(); batch=DB.batch(); opCount=0; } }
      let added=0;
      for(let i=1;i<rows.length;i++){
        const row=rows[i];
        const itemName = String(row[itemIdx]||'').trim();
        if(!itemName) continue;
        const qty = Number(row[qtyIdx])||0;
        const rate = Number(row[rateIdx])||0;
        batch.set(ref.doc(), {brand, itemName, qty, rate, updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        added++; opCount++;
        if(opCount>=400){ await batch.commit(); batch=DB.batch(); opCount=0; }
      }
      if(opCount>0) await batch.commit();
      $('#stockImportResult').innerHTML = `<div class="badge badge-green">Replaced. New items added: ${added}</div>`;
      showToast('Stock replaced','success');
    } else {
      // Add mode — show summary of new vs matched item names before commit
      const existing = (APP.items||[]).filter(i=>i.brand===brand);
      const toAdd = []; const matched = [];
      for(let i=1;i<rows.length;i++){
        const row=rows[i];
        const itemName = String(row[itemIdx]||'').trim();
        if(!itemName) continue;
        const qty = Number(row[qtyIdx])||0;
        const rate = Number(row[rateIdx])||0;
        const isMatch = existing.some(e=> norm(e.itemName)===norm(itemName));
        if(isMatch) matched.push(itemName); else toAdd.push(itemName);
        existing.push({itemName}); // avoid double-counting within file itself
        toAdd.__rows = toAdd.__rows || [];
      }
      // re-collect actual row data for committing
      const items = [];
      for(let i=1;i<rows.length;i++){
        const row=rows[i];
        const itemName = String(row[itemIdx]||'').trim();
        if(!itemName) continue;
        items.push({itemName, qty:Number(row[qtyIdx])||0, rate:Number(row[rateIdx])||0});
      }
      $('#stockImportResult').innerHTML = `
        <div class="auth-error show" style="margin-bottom:10px;">
          <b>${matched.length}</b> item(s) already exist with the same name under "${escapeHtml(brand)}" and will be added as <b>separate entries</b> (duplicates allowed).<br>
          <b>${toAdd.length}</b> new item(s) will be created.
        </div>
        <button class="btn btn-accent" id="confirmAddImport">Confirm — Add ${items.length} item(s)</button>
      `;
      $('#confirmAddImport').addEventListener('click', async ()=>{
        let batch = DB.batch(); let opCount=0;
        for(const it of items){
          batch.set(ref.doc(), {brand, itemName:it.itemName, qty:it.qty, rate:it.rate, updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
          opCount++;
          if(opCount>=400){ await batch.commit(); batch=DB.batch(); opCount=0; }
        }
        if(opCount>0) await batch.commit();
        showToast('Stock imported','success');
        closeModal();
      });
    }
  });
}

/* ============================================================
   ORDERS TAB — Admin view + Billing
============================================================ */
let adminOrderBrand = 'all';
let adminOrderStatus = 'all';
let adminOrderSalesman = '';

function renderAdminOrders(){
  const content = $('#pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>Orders</h2>
    </div>
    <div class="pill-tabs" id="orderBrandTabs"></div>
    <div class="card">
      <div class="input-row" style="margin-bottom:12px;">
        <select class="input" id="orderStatusFilter">
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="billed">Billed</option>
        </select>
        <select class="input" id="orderSalesmanFilter"><option value="">All Salesmen</option></select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Outlet</th><th>Salesman</th><th>Brand</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody id="ordersTbody"></tbody>
        </table>
      </div>
      <div id="ordersEmpty" class="empty-state hidden">
        <div class="es-icon">📦</div><h4>No orders found</h4>
      </div>
    </div>
  `;

  $('#orderStatusFilter').value = adminOrderStatus;
  $('#orderStatusFilter').addEventListener('change', e=>{ adminOrderStatus=e.target.value; renderOrdersTable(); });
  $('#orderSalesmanFilter').addEventListener('change', e=>{ adminOrderSalesman=e.target.value; renderOrdersTable(); });

  const unsub = DB.collection('companies').doc(APP.companyId).collection('orders')
    .orderBy('createdAt','desc').limit(300).onSnapshot(snap=>{
      APP.orders=[];
      snap.forEach(d=> APP.orders.push(Object.assign({id:d.id}, d.data())));
      renderOrderBrandTabs();
      renderSalesmanFilterOptions();
      renderOrdersTable();
    });
  APP.unsub.push(unsub);
}

function renderOrderBrandTabs(){
  const brands = [...new Set((APP.orders||[]).map(o=>o.brand).filter(Boolean))].sort();
  const tabsEl = $('#orderBrandTabs');
  if(!tabsEl) return;
  tabsEl.innerHTML = `<button class="pill-tab ${adminOrderBrand==='all'?'active':''}" data-b="all">All Brands</button>`
    + brands.map(b=>`<button class="pill-tab ${adminOrderBrand===b?'active':''}" data-b="${escapeHtml(b)}">${escapeHtml(b)}</button>`).join('');
  tabsEl.querySelectorAll('[data-b]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ adminOrderBrand=btn.dataset.b; renderOrderBrandTabs(); renderOrdersTable(); });
  });
}

function renderSalesmanFilterOptions(){
  const salesmen = [...new Set((APP.orders||[]).map(o=>o.salesmanName).filter(Boolean))].sort();
  const sel = $('#orderSalesmanFilter');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Salesmen</option>' + salesmen.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  sel.value = cur;
}

function renderOrdersTable(){
  let list = APP.orders || [];
  if(adminOrderBrand!=='all') list = list.filter(o=>o.brand===adminOrderBrand);
  if(adminOrderStatus!=='all') list = list.filter(o=>o.status===adminOrderStatus);
  if(adminOrderSalesman) list = list.filter(o=>o.salesmanName===adminOrderSalesman);

  const tbody = $('#ordersTbody');
  const emptyEl = $('#ordersEmpty');
  if(list.length===0){ tbody.innerHTML=''; emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');

  tbody.innerHTML = list.map(o=>`
    <tr class="status-${o.status}">
      <td>${fmtDateDisplay(o.date)}</td>
      <td><b>${escapeHtml(o.outletName)}</b></td>
      <td>${escapeHtml(o.salesmanName)}</td>
      <td><span class="badge badge-blue">${escapeHtml(o.brand)}</span></td>
      <td>${o.items.length}</td>
      <td>${fmtINR(o.totalValue)}</td>
      <td><span class="badge badge-${o.status==='billed'?'green':o.status==='partial'?'blue':'amber'}">${o.status}</span></td>
      <td><button class="btn btn-outline btn-sm" data-bill="${o.id}">${o.status==='billed'?'View':'Bill'}</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-bill]').forEach(b=>{
    b.addEventListener('click', ()=> openBillingModal(APP.orders.find(o=>o.id===b.dataset.bill)));
  });
}

/* ---------- Billing Modal ---------- */
function openBillingModal(order){
  const readonly = order.status==='billed';
  const rowsHtml = order.items.map((it,idx)=>`
    <tr>
      <td>${escapeHtml(it.itemName)}</td>
      <td>${it.orderedQty}</td>
      <td>${it.billedQty}</td>
      <td>${it.remainingQty}</td>
      <td>
        ${readonly ? '—' : `<input type="number" class="input bill-now-input" style="max-width:80px;" min="0" value="0" data-idx="${idx}">`}
      </td>
    </tr>
  `).join('');

  openModal(`
    <h3>${readonly?'Order Details':'Bill Order'} — ${escapeHtml(order.outletName)}</h3>
    <div class="helper-text" style="margin-bottom:10px;">
      ${fmtDateDisplay(order.date)} · ${escapeHtml(order.salesmanName)} · ${escapeHtml(order.brand)} · Total: ${fmtINR(order.totalValue)}
    </div>
    ${!readonly ? `
    <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;margin-bottom:10px;">
      <input type="checkbox" id="billAllChk"> Bill all remaining quantities (full billing)
    </label>` : ''}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Item</th><th>Ordered</th><th>Billed</th><th>Remaining</th><th>${readonly?'':'Bill Now'}</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;">
      ${!readonly ? `<button class="btn btn-accent" id="submitBillingBtn">Save Billing</button>` : ''}
      <button class="btn btn-outline" id="closeBillingBtn">Close</button>
    </div>
  `);
  $('#closeBillingBtn').addEventListener('click', closeModal);

  if(!readonly){
    $('#billAllChk').addEventListener('change', e=>{
      $all('.bill-now-input').forEach(inp=>{
        const idx = Number(inp.dataset.idx);
        inp.value = e.target.checked ? order.items[idx].remainingQty : 0;
      });
    });

    $('#submitBillingBtn').addEventListener('click', ()=> submitBilling(order));
  }
}

function submitBilling(order){
  const billNowValues = $all('.bill-now-input').map(inp=> Number(inp.value)||0);
  if(billNowValues.every(v=>v===0)){ showToast('Enter at least one quantity to bill','error'); return; }

  const itemsRef = DB.collection('companies').doc(APP.companyId).collection('items');
  const orderRef = DB.collection('companies').doc(APP.companyId).collection('orders').doc(order.id);

  DB.runTransaction(async tx=>{
    const refs = order.items.map(i=> itemsRef.doc(i.itemId));
    const docs = await Promise.all(refs.map(r=>tx.get(r)));

    const newItems = order.items.map((it, idx)=>{
      const billNow = billNowValues[idx]||0;
      const stockDiff = it.remainingQty - billNow; // returns to stock if positive, extra deduction if negative
      const curQty = (docs[idx].data() && docs[idx].data().qty) || 0;
      if(stockDiff!==0) tx.update(refs[idx], {qty: curQty + stockDiff});
      return Object.assign({}, it, {
        billedQty: it.billedQty + billNow,
        remainingQty: it.remainingQty - billNow
      });
    });

    const allDone = newItems.every(i=>i.remainingQty<=0);
    const anyBilled = newItems.some(i=>i.billedQty>0);
    const status = allDone ? 'billed' : (anyBilled ? 'partial' : 'pending');

    tx.update(orderRef, {items:newItems, status});
  }).then(()=>{
    showToast('Billing saved','success');
    closeModal();
  }).catch(err=> showToast('Error: '+err.message,'error'));
}

/* ============================================================
   OUTSTANDING & COLLECTION TAB
============================================================ */
let adminCollDate = todayStr();
let adminCollSalesman = '';
let adminCollDoc = null; // current date doc data {status, outlets:{}}
let adminCollDates = []; // recent date docs {id, status}

function renderAdminCollection(){
  const content = $('#pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>Outstanding &amp; Collection Plan</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline" id="uploadOSBtn">⬆ Upload Outstanding</button>
        <button class="btn btn-outline" id="addOutletDateBtn">+ Add Outlet</button>
        <button class="btn btn-outline" id="shareSnapBtn">📤 Share Snapshot</button>
        <button class="btn btn-danger" id="finalizeBtn">Finalize Date</button>
      </div>
    </div>
    <div class="card">
      <div class="input-row" style="margin-bottom:12px;">
        <input type="date" class="input" id="collDateInput" value="${adminCollDate}">
        <select class="input" id="collSalesmanFilter"><option value="">All Salesmen</option></select>
      </div>
      <div id="recentDatePills" class="pill-tabs"></div>
    </div>
    <div class="grid grid-4" id="collKpis"></div>
    <div class="card">
      <div id="collStatusBadge" style="margin-bottom:10px;"></div>
      <div class="table-wrap">
        <table id="collTable"><thead></thead><tbody id="collTbody"></tbody></table>
      </div>
      <div id="collEmpty" class="empty-state hidden">
        <div class="es-icon">💰</div><h4>No data for this date</h4>
        <p>Upload an Outstanding sheet or add an outlet to begin.</p>
      </div>
    </div>
    <div id="snapshotArea" style="position:fixed;left:-9999px;top:0;"></div>
  `;

  $('#collDateInput').addEventListener('change', e=>{ adminCollDate = e.target.value; loadCollectionDate(); });
  $('#collSalesmanFilter').addEventListener('change', e=>{ adminCollSalesman = e.target.value; renderCollectionTable(); });
  $('#uploadOSBtn').addEventListener('click', ()=> openOSUploadModal());
  $('#addOutletDateBtn').addEventListener('click', ()=> openAddOutletToDateModal());
  $('#finalizeBtn').addEventListener('click', ()=> finalizeDate());
  $('#shareSnapBtn').addEventListener('click', ()=> shareSnapshot());

  loadRecentDates();
  loadCollectionDate();
}

function loadRecentDates(){
  DB.collection('companies').doc(APP.companyId).collection('outstanding')
    .orderBy('__name__','desc').limit(14).get().then(snap=>{
      adminCollDates=[];
      snap.forEach(d=> adminCollDates.push({id:d.id, status:d.data().status}));
      const pillsEl = $('#recentDatePills');
      if(!pillsEl) return;
      pillsEl.innerHTML = adminCollDates.map(d=>`
        <button class="pill-tab ${d.id===adminCollDate?'active':''}" data-date="${d.id}">
          ${fmtDateDisplay(d.id)} ${d.status==='finalized'?'🔒':''}
        </button>`).join('');
      pillsEl.querySelectorAll('[data-date]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          adminCollDate = btn.dataset.date;
          $('#collDateInput').value = adminCollDate;
          loadRecentDates();
          loadCollectionDate();
        });
      });
    });
}

function loadCollectionDate(){
  const ref = DB.collection('companies').doc(APP.companyId).collection('outstanding').doc(adminCollDate);
  ref.get().then(doc=>{
    adminCollDoc = doc.exists ? doc.data() : {status:'open', outlets:{}};
    renderCollectionTable();
  });
}

function renderCollectionTable(){
  const doc = adminCollDoc || {status:'open', outlets:{}};
  const isFinalized = doc.status==='finalized';
  const outlets = doc.outlets || {};
  let entries = Object.entries(outlets); // [outletId, data]

  if(adminCollSalesman) entries = entries.filter(([id,o])=> o.salesmanName===adminCollSalesman);

  // KPIs
  let totalOS=0, totalPlan=0, totalReceived=0, totalPending=0;
  entries.forEach(([id,o])=>{
    totalOS += Number(o.os)||0;
    totalPlan += Number(o.plan)||0;
    totalReceived += Number(o.received)||0;
    if(!isFinalized) totalPending += (Number(o.os)||0) - (Number(o.received)||0);
  });
  $('#collKpis').innerHTML = `
    <div class="kpi blue"><div class="label">Outstanding</div><div class="value">${isFinalized?'—':fmtINR(totalOS)}</div></div>
    <div class="kpi amber"><div class="label">Plan</div><div class="value">${fmtINR(totalPlan)}</div></div>
    <div class="kpi green"><div class="label">Received</div><div class="value">${fmtINR(totalReceived)}</div></div>
    <div class="kpi red"><div class="label">Pending</div><div class="value">${isFinalized?'—':fmtINR(totalPending)}</div></div>
  `;

  $('#collStatusBadge').innerHTML = isFinalized
    ? `<span class="badge badge-gray">🔒 Finalized — Outstanding data cleared, Plan &amp; Received retained as history</span>`
    : `<span class="badge badge-green">● Open — editable</span>`;

  // populate salesman filter
  const salesmen = [...new Set(Object.values(outlets).map(o=>o.salesmanName).filter(Boolean))].sort();
  const filterEl = $('#collSalesmanFilter');
  const curSel = filterEl.value;
  filterEl.innerHTML = '<option value="">All Salesmen</option>' + salesmen.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  filterEl.value = curSel;

  $('#finalizeBtn').disabled = isFinalized;
  $('#uploadOSBtn').disabled = isFinalized;
  $('#addOutletDateBtn').disabled = isFinalized;

  const thead = $('#collTable thead');
  const tbody = $('#collTbody');
  const emptyEl = $('#collEmpty');

  if(entries.length===0){
    thead.innerHTML=''; tbody.innerHTML='';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  entries.sort((a,b)=> (a[1].outletName||'').localeCompare(b[1].outletName||''));

  if(isFinalized){
    thead.innerHTML = `<tr><th>Outlet</th><th>Salesman</th><th>Plan</th><th>Received</th></tr>`;
    tbody.innerHTML = entries.map(([id,o])=>`
      <tr>
        <td><b>${escapeHtml(o.outletName)}</b></td>
        <td>${escapeHtml(o.salesmanName||'—')}</td>
        <td>${fmtINR(o.plan)}</td>
        <td>${fmtINR(o.received)}</td>
      </tr>`).join('');
  } else {
    thead.innerHTML = `<tr><th>Outlet</th><th>Salesman</th><th>Outstanding</th><th>Plan</th><th>Received</th><th>Pending</th></tr>`;
    tbody.innerHTML = entries.map(([id,o])=>{
      const pending = (Number(o.os)||0) - (Number(o.received)||0);
      return `
      <tr>
        <td><b>${escapeHtml(o.outletName)}</b></td>
        <td>${escapeHtml(o.salesmanName||'—')}</td>
        <td>${fmtINR(o.os)}</td>
        <td><input type="number" class="input coll-input" style="max-width:100px;" data-id="${id}" data-field="plan" value="${o.plan||0}"></td>
        <td><input type="number" class="input coll-input" style="max-width:100px;" data-id="${id}" data-field="received" value="${o.received||0}"></td>
        <td><b>${fmtINR(pending)}</b></td>
      </tr>`;
    }).join('');

    $all('.coll-input').forEach(inp=>{
      inp.addEventListener('change', ()=>{
        const id = inp.dataset.id, field = inp.dataset.field;
        const val = Number(inp.value)||0;
        DB.collection('companies').doc(APP.companyId).collection('outstanding').doc(adminCollDate)
          .update({[`outlets.${id}.${field}`]: val})
          .then(()=>{
            adminCollDoc.outlets[id][field] = val;
            renderCollectionTable();
            showToast('Saved','success');
          });
      });
    });
  }
}

/* ---------- Upload Outstanding (template/import) ---------- */
function openOSUploadModal(){
  openModal(`
    <h3>Upload Outstanding — ${fmtDateDisplay(adminCollDate)}</h3>
    <p class="helper-text" style="margin-bottom:12px;">
      Excel/CSV columns: <b>Outlet Name</b>, <b>Outstanding</b> (optional: <b>Salesman Name</b>).<br>
      Outlets are matched against the Master. Unmatched outlet names will be added to the Master automatically.
    </p>
    <div class="field"><input type="file" class="input" id="osImportFile" accept=".xlsx,.xls,.csv"></div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-accent" id="osImportGo">Upload</button>
      <button class="btn btn-outline" id="osImportCancel">Cancel</button>
    </div>
    <div id="osImportResult" style="margin-top:12px;"></div>
  `);
  $('#osImportCancel').addEventListener('click', closeModal);
  $('#osImportGo').addEventListener('click', async ()=>{
    const file = $('#osImportFile').files[0];
    if(!file){ showToast('Please choose a file','error'); return; }
    const rows = await parseSpreadsheetFile(file);
    if(rows.length<2){ showToast('No data found in file','error'); return; }
    const header = rows[0].map(h=>norm(h));
    const outletIdx = header.findIndex(h=>h.includes('outlet'));
    const osIdx = header.findIndex(h=>h.includes('outstanding')||h.includes('os'));
    const salesmanIdx = header.findIndex(h=>h.includes('salesman'));
    if(outletIdx===-1 || osIdx===-1){ showToast('Columns "Outlet Name" and "Outstanding" are required','error'); return; }

    const outletsRef = DB.collection('companies').doc(APP.companyId).collection('outlets');
    const existing = APP.outlets || [];
    const docRef = DB.collection('companies').doc(APP.companyId).collection('outstanding').doc(adminCollDate);
    const existingDoc = await docRef.get();
    const currentOutlets = (existingDoc.exists ? existingDoc.data().outlets : {}) || {};

    let added=0, matched=0;
    let masterBatch = DB.batch(); let opCount=0;

    for(let i=1;i<rows.length;i++){
      const row = rows[i];
      const outletName = String(row[outletIdx]||'').trim();
      if(!outletName) continue;
      const os = Number(row[osIdx])||0;
      const salesmanName = salesmanIdx!==-1 ? String(row[salesmanIdx]||'').trim() : '';

      let match = existing.find(o=> norm(o.outletName)===norm(outletName));
      if(!match){
        const newRef = outletsRef.doc();
        masterBatch.set(newRef, {outletName, salesmanName});
        match = {id:newRef.id, outletName, salesmanName};
        existing.push(match);
        added++; opCount++;
        if(opCount>=400){ await masterBatch.commit(); masterBatch=DB.batch(); opCount=0; }
      } else {
        matched++;
      }

      const prior = currentOutlets[match.id] || {};
      currentOutlets[match.id] = {
        outletName: match.outletName,
        salesmanName: match.salesmanName || '',
        os,
        plan: prior.plan || 0,
        received: prior.received || 0
      };
    }
    if(opCount>0) await masterBatch.commit();

    await docRef.set({status:'open', outlets:currentOutlets}, {merge:true});

    $('#osImportResult').innerHTML = `<div class="badge badge-green">Matched: ${matched}</div> <div class="badge badge-blue" style="margin-left:6px;">New outlets added to Master: ${added}</div>`;
    showToast('Outstanding uploaded','success');
    loadCollectionDate();
    loadRecentDates();
  });
}

/* ---------- Add single outlet to a date (ad-hoc) ---------- */
function openAddOutletToDateModal(){
  const doc = adminCollDoc || {outlets:{}};
  const existingIds = Object.keys(doc.outlets||{});
  const available = (APP.outlets||[]).filter(o=> !existingIds.includes(o.id));
  if(available.length===0){ showToast('All outlets already added for this date','error'); return; }

  openModal(`
    <h3>Add Outlet — ${fmtDateDisplay(adminCollDate)}</h3>
    <div class="field">
      <label>Outlet</label>
      <select class="input" id="addOutletSelect">
        ${available.map(o=>`<option value="${o.id}">${escapeHtml(o.outletName)} (${escapeHtml(o.salesmanName||'—')})</option>`).join('')}
      </select>
    </div>
    <div class="input-row">
      <div class="field"><label>Outstanding</label><input type="number" class="input" id="addOutletOS" value="0"></div>
      <div class="field"><label>Received</label><input type="number" class="input" id="addOutletReceived" value="0"></div>
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-accent" id="confirmAddOutletDate">Add</button>
      <button class="btn btn-outline" id="cancelAddOutletDate">Cancel</button>
    </div>
  `);
  $('#cancelAddOutletDate').addEventListener('click', closeModal);
  $('#confirmAddOutletDate').addEventListener('click', ()=>{
    const outletId = $('#addOutletSelect').value;
    const outlet = available.find(o=>o.id===outletId);
    const os = Number($('#addOutletOS').value)||0;
    const received = Number($('#addOutletReceived').value)||0;
    DB.collection('companies').doc(APP.companyId).collection('outstanding').doc(adminCollDate)
      .set({status:'open', outlets:{[outletId]:{outletName:outlet.outletName, salesmanName:outlet.salesmanName||'', os, plan:0, received}}}, {merge:true})
      .then(()=>{ showToast('Outlet added','success'); closeModal(); loadCollectionDate(); });
  });
}

/* ---------- Finalize ---------- */
function finalizeDate(){
  if(!confirm(`Finalize ${fmtDateDisplay(adminCollDate)}? Outstanding values will be removed; Plan & Received history will be kept for outlets that have activity. This cannot be undone.`)) return;
  const doc = adminCollDoc || {outlets:{}};
  const outlets = doc.outlets || {};
  const newOutlets = {};
  Object.entries(outlets).forEach(([id,o])=>{
    const plan = Number(o.plan)||0, received = Number(o.received)||0;
    if(plan>0 || received>0){
      newOutlets[id] = {outletName:o.outletName, salesmanName:o.salesmanName||'', plan, received};
    }
  });
  DB.collection('companies').doc(APP.companyId).collection('outstanding').doc(adminCollDate)
    .set({status:'finalized', outlets:newOutlets})
    .then(()=>{
      showToast('Date finalized','success');
      loadCollectionDate();
      loadRecentDates();
    });
}

/* ---------- Snapshot / WhatsApp Share ---------- */
function shareSnapshot(){
  const doc = adminCollDoc || {outlets:{}};
  const isFinalized = doc.status==='finalized';
  let entries = Object.entries(doc.outlets||{});
  if(adminCollSalesman) entries = entries.filter(([id,o])=> o.salesmanName===adminCollSalesman);
  entries.sort((a,b)=> (a[1].outletName||'').localeCompare(b[1].outletName||''));

  let totalOS=0,totalPlan=0,totalReceived=0,totalPending=0;
  entries.forEach(([id,o])=>{
    totalOS+=Number(o.os)||0; totalPlan+=Number(o.plan)||0; totalReceived+=Number(o.received)||0;
    totalPending += (Number(o.os)||0)-(Number(o.received)||0);
  });

  const rows = entries.map(([id,o])=>`
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e3e6ee;">${escapeHtml(o.outletName)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e3e6ee;text-align:right;">${isFinalized?'—':fmtINR(o.os)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e3e6ee;text-align:right;">${fmtINR(o.plan)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e3e6ee;text-align:right;">${fmtINR(o.received)}</td>
    </tr>`).join('');

  const area = $('#snapshotArea');
  area.innerHTML = `
    <div style="width:480px;background:#fff;padding:20px;font-family:Inter,sans-serif;">
      <div style="font-family:Sora,sans-serif;font-weight:800;font-size:18px;color:#1e2a4a;">${escapeHtml(APP.companyData.name)}</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">Collection Summary — ${fmtDateDisplay(adminCollDate)}${adminCollSalesman?' — '+escapeHtml(adminCollSalesman):''}</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#e8ecf6;">
          <th style="padding:6px 10px;text-align:left;">Outlet</th>
          <th style="padding:6px 10px;text-align:right;">OS</th>
          <th style="padding:6px 10px;text-align:right;">Plan</th>
          <th style="padding:6px 10px;text-align:right;">Received</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="font-weight:700;background:#f6f7fb;">
            <td style="padding:6px 10px;">Total</td>
            <td style="padding:6px 10px;text-align:right;">${isFinalized?'—':fmtINR(totalOS)}</td>
            <td style="padding:6px 10px;text-align:right;">${fmtINR(totalPlan)}</td>
            <td style="padding:6px 10px;text-align:right;">${fmtINR(totalReceived)}</td>
          </tr>
          ${!isFinalized?`<tr><td style="padding:6px 10px;font-weight:700;color:#e5484d;">Pending</td><td colspan="3" style="padding:6px 10px;text-align:right;font-weight:700;color:#e5484d;">${fmtINR(totalPending)}</td></tr>`:''}
        </tfoot>
      </table>
      <div style="font-size:10.5px;color:#9aa1ad;margin-top:10px;">Generated by SunStar OCM</div>
    </div>
  `;
  area.style.left='0'; area.style.top='-10000px';

  html2canvas(area.firstElementChild, {scale:2}).then(canvas=>{
    canvas.toBlob(blob=>{
      area.innerHTML=''; area.style.left='-9999px';
      const file = new File([blob], `collection-${adminCollDate}.png`, {type:'image/png'});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        navigator.share({files:[file], title:'Collection Summary', text:`Collection Summary — ${fmtDateDisplay(adminCollDate)}`})
          .catch(()=>{ downloadBlob(blob, `collection-${adminCollDate}.png`); });
      } else {
        downloadBlob(blob, `collection-${adminCollDate}.png`);
        showToast('Image downloaded — attach it in WhatsApp','success');
      }
    });
  });
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

/* ============================================================
   DASHBOARD TAB
============================================================ */
let dashRange = 'today';
let dashFrom = todayStr();
let dashTo = todayStr();
let dashCharts = {};

function getRangeDates(range){
  const today = new Date(todayStr()+'T00:00:00');
  if(range==='today') return {from:todayStr(), to:todayStr()};
  if(range==='week'){
    const day = today.getDay(); // 0=Sun
    const diffToMon = (day===0?6:day-1);
    const monday = new Date(today); monday.setDate(today.getDate()-diffToMon);
    return {from: monday.toISOString().slice(0,10), to: todayStr()};
  }
  if(range==='month'){
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return {from: first.toISOString().slice(0,10), to: todayStr()};
  }
  return {from: dashFrom, to: dashTo};
}

function renderAdminDashboard(){
  const content = $('#pageContent');
  content.innerHTML = `
    <div class="pill-tabs" id="dashRangeTabs">
      <button class="pill-tab" data-r="today">Today</button>
      <button class="pill-tab" data-r="week">This Week</button>
      <button class="pill-tab" data-r="month">This Month</button>
      <button class="pill-tab" data-r="custom">Custom</button>
    </div>
    <div class="card hidden" id="customRangeCard">
      <div class="input-row">
        <div class="field"><label>From</label><input type="date" class="input" id="dashFromInput" value="${dashFrom}"></div>
        <div class="field"><label>To</label><input type="date" class="input" id="dashToInput" value="${dashTo}"></div>
        <div class="field" style="display:flex;align-items:flex-end;"><button class="btn btn-accent btn-block" id="dashCustomGo">Apply</button></div>
      </div>
    </div>
    <div class="grid grid-4" id="dashKpis"><div class="spinner"></div></div>
    <div class="grid grid-2">
      <div class="card"><div class="card-title">Order Value Trend</div><canvas id="chartOrderTrend" height="220"></canvas></div>
      <div class="card"><div class="card-title">Collection: Plan vs Received (by Salesman)</div><canvas id="chartCollection" height="220"></canvas></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><div class="card-title">Salesman-wise Order Value</div><canvas id="chartSalesman" height="220"></canvas></div>
      <div class="card"><div class="card-title">Brand-wise Sales</div><canvas id="chartBrand" height="220"></canvas></div>
    </div>
  `;

  $all('#dashRangeTabs .pill-tab').forEach(b=>{
    b.classList.toggle('active', b.dataset.r===dashRange);
    b.addEventListener('click', ()=>{
      dashRange = b.dataset.r;
      $all('#dashRangeTabs .pill-tab').forEach(x=>x.classList.toggle('active', x===b));
      $('#customRangeCard').classList.toggle('hidden', dashRange!=='custom');
      if(dashRange!=='custom') loadDashboardData();
    });
  });
  $('#customRangeCard').classList.toggle('hidden', dashRange!=='custom');
  $('#dashCustomGo').addEventListener('click', ()=>{
    dashFrom = $('#dashFromInput').value; dashTo = $('#dashToInput').value;
    loadDashboardData();
  });

  loadDashboardData();
}

async function loadDashboardData(){
  const {from, to} = getRangeDates(dashRange);

  // Orders in range
  const ordersSnap = await DB.collection('companies').doc(APP.companyId).collection('orders')
    .where('date','>=',from).where('date','<=',to).get();
  const orders=[];
  ordersSnap.forEach(d=> orders.push(d.data()));

  // Outstanding docs in range
  const outSnap = await DB.collection('companies').doc(APP.companyId).collection('outstanding')
    .where(firebase.firestore.FieldPath.documentId(),'>=',from)
    .where(firebase.firestore.FieldPath.documentId(),'<=',to).get();
  const outDocs=[];
  outSnap.forEach(d=> outDocs.push(d.data()));

  // ---- KPIs ----
  const totalOrderValue = orders.reduce((s,o)=>s+(o.totalValue||0),0);
  const pendingCount = orders.filter(o=>o.status==='pending').length;
  const partialCount = orders.filter(o=>o.status==='partial').length;
  const billedCount = orders.filter(o=>o.status==='billed').length;

  let totalPlan=0, totalReceived=0, latestOS=0, latestOSDate=null;
  outDocs.forEach(d=> Object.values(d.outlets||{}).forEach(o=>{
    totalPlan += Number(o.plan)||0; totalReceived += Number(o.received)||0;
  }));
  // latest open date's outstanding total (overall, not just range)
  const latestOpenSnap = await DB.collection('companies').doc(APP.companyId).collection('outstanding')
    .orderBy('__name__','desc').limit(1).get();
  if(!latestOpenSnap.empty){
    const dd = latestOpenSnap.docs[0];
    if(dd.data().status==='open'){
      latestOSDate = dd.id;
      latestOS = Object.values(dd.data().outlets||{}).reduce((s,o)=>s+(Number(o.os)||0),0);
    }
  }

  $('#dashKpis').innerHTML = `
    <div class="kpi blue"><div class="label">Order Value</div><div class="value">${fmtINR(totalOrderValue)}</div><div class="sub">${orders.length} order(s)</div></div>
    <div class="kpi amber"><div class="label">Pending / Partial</div><div class="value">${pendingCount} / ${partialCount}</div><div class="sub">${billedCount} billed</div></div>
    <div class="kpi green"><div class="label">Collection Received</div><div class="value">${fmtINR(totalReceived)}</div><div class="sub">Plan: ${fmtINR(totalPlan)}</div></div>
    <div class="kpi red"><div class="label">Current Outstanding</div><div class="value">${latestOSDate?fmtINR(latestOS):'—'}</div><div class="sub">${latestOSDate?fmtDateDisplay(latestOSDate):'No open date'}</div></div>
  `;

  // ---- Order Value Trend (by date) ----
  const trendMap = {};
  orders.forEach(o=>{ trendMap[o.date] = (trendMap[o.date]||0) + (o.totalValue||0); });
  const trendDates = Object.keys(trendMap).sort();
  renderChart('chartOrderTrend','line', trendDates.map(fmtDateDisplay), [{label:'Order Value', data:trendDates.map(d=>trendMap[d]), color:'#1e2a4a'}]);

  // ---- Salesman-wise Order Value ----
  const smMap={};
  orders.forEach(o=>{ smMap[o.salesmanName]=(smMap[o.salesmanName]||0)+(o.totalValue||0); });
  const smNames = Object.keys(smMap);
  renderChart('chartSalesman','bar', smNames, [{label:'Order Value', data:smNames.map(s=>smMap[s]), color:'#f4a623'}]);

  // ---- Brand-wise Sales ----
  const brandMap={};
  orders.forEach(o=>{ brandMap[o.brand]=(brandMap[o.brand]||0)+(o.totalValue||0); });
  const brandNames = Object.keys(brandMap);
  renderChart('chartBrand','bar', brandNames, [{label:'Sales Value', data:brandNames.map(b=>brandMap[b]), color:'#3b82c4'}]);

  // ---- Collection Plan vs Received by Salesman ----
  const collMap={};
  outDocs.forEach(d=> Object.values(d.outlets||{}).forEach(o=>{
    const sm = o.salesmanName || 'Unassigned';
    if(!collMap[sm]) collMap[sm]={plan:0,received:0};
    collMap[sm].plan += Number(o.plan)||0;
    collMap[sm].received += Number(o.received)||0;
  }));
  const collNames = Object.keys(collMap);
  renderChart('chartCollection','bar', collNames, [
    {label:'Plan', data:collNames.map(s=>collMap[s].plan), color:'#e3a008'},
    {label:'Received', data:collNames.map(s=>collMap[s].received), color:'#2e9e5b'}
  ]);
}

function renderChart(canvasId, type, labels, datasets){
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  if(dashCharts[canvasId]) dashCharts[canvasId].destroy();
  if(labels.length===0){
    const c = ctx.getContext('2d');
    c.clearRect(0,0,ctx.width,ctx.height);
    return;
  }
  dashCharts[canvasId] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: datasets.map(ds=>({
        label: ds.label, data: ds.data,
        backgroundColor: type==='line' ? 'rgba(30,42,74,0.08)' : ds.color,
        borderColor: ds.color, borderWidth: type==='line'?2:0,
        tension:0.3, fill: type==='line'
      }))
    },
    options: {
      responsive:true,
      plugins:{ legend:{ display: datasets.length>1 } },
      scales:{ y:{ beginAtZero:true } }
    }
  });
}

/* ============================================================
   REPORTS TAB — Salesman & Brand-wise detail tables
============================================================ */
let repRange = 'month';
let repFrom = todayStr();
let repTo = todayStr();

function renderAdminReports(){
  const content = $('#pageContent');
  content.innerHTML = `
    <div class="pill-tabs" id="repRangeTabs">
      <button class="pill-tab" data-r="today">Today</button>
      <button class="pill-tab" data-r="week">This Week</button>
      <button class="pill-tab" data-r="month">This Month</button>
      <button class="pill-tab" data-r="custom">Custom</button>
    </div>
    <div class="card hidden" id="repCustomCard">
      <div class="input-row">
        <div class="field"><label>From</label><input type="date" class="input" id="repFromInput" value="${repFrom}"></div>
        <div class="field"><label>To</label><input type="date" class="input" id="repToInput" value="${repTo}"></div>
        <div class="field" style="display:flex;align-items:flex-end;"><button class="btn btn-accent btn-block" id="repCustomGo">Apply</button></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Salesman-wise Performance</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Salesman</th><th>Orders</th><th>Order Value</th><th>Pending</th><th>Partial</th><th>Billed</th><th>Plan</th><th>Received</th></tr></thead>
          <tbody id="repSalesmanTbody"></tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Item-wise Sales</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Brand</th><th>Qty Ordered</th><th>Value</th></tr></thead>
          <tbody id="repItemTbody"></tbody>
        </table>
      </div>
    </div>
  `;
  $all('#repRangeTabs .pill-tab').forEach(b=>{
    b.classList.toggle('active', b.dataset.r===repRange);
    b.addEventListener('click', ()=>{
      repRange=b.dataset.r;
      $all('#repRangeTabs .pill-tab').forEach(x=>x.classList.toggle('active', x===b));
      $('#repCustomCard').classList.toggle('hidden', repRange!=='custom');
      if(repRange!=='custom') loadReportsData();
    });
  });
  $('#repCustomCard').classList.toggle('hidden', repRange!=='custom');
  $('#repCustomGo').addEventListener('click', ()=>{
    repFrom=$('#repFromInput').value; repTo=$('#repToInput').value; loadReportsData();
  });
  loadReportsData();
}

async function loadReportsData(){
  const {from,to} = getRangeDates(repRange==='custom' ? 'custom' : repRange) ;
  const f = repRange==='custom' ? repFrom : from;
  const t = repRange==='custom' ? repTo : to;

  const ordersSnap = await DB.collection('companies').doc(APP.companyId).collection('orders')
    .where('date','>=',f).where('date','<=',t).get();
  const orders=[]; ordersSnap.forEach(d=>orders.push(d.data()));

  const outSnap = await DB.collection('companies').doc(APP.companyId).collection('outstanding')
    .where(firebase.firestore.FieldPath.documentId(),'>=',f)
    .where(firebase.firestore.FieldPath.documentId(),'<=',t).get();
  const outDocs=[]; outSnap.forEach(d=>outDocs.push(d.data()));

  // Salesman aggregation
  const smMap={};
  orders.forEach(o=>{
    const sm=o.salesmanName;
    if(!smMap[sm]) smMap[sm]={orders:0,value:0,pending:0,partial:0,billed:0};
    smMap[sm].orders++; smMap[sm].value+=o.totalValue||0;
    smMap[sm][o.status]++;
  });
  outDocs.forEach(d=> Object.values(d.outlets||{}).forEach(o=>{
    const sm=o.salesmanName||'Unassigned';
    if(!smMap[sm]) smMap[sm]={orders:0,value:0,pending:0,partial:0,billed:0,plan:0,received:0};
    smMap[sm].plan=(smMap[sm].plan||0)+(Number(o.plan)||0);
    smMap[sm].received=(smMap[sm].received||0)+(Number(o.received)||0);
  }));
  const smRows = Object.entries(smMap).map(([sm,d])=>`
    <tr>
      <td><b>${escapeHtml(sm)}</b></td>
      <td>${d.orders||0}</td><td>${fmtINR(d.value||0)}</td>
      <td>${d.pending||0}</td><td>${d.partial||0}</td><td>${d.billed||0}</td>
      <td>${fmtINR(d.plan||0)}</td><td>${fmtINR(d.received||0)}</td>
    </tr>`).join('');
  $('#repSalesmanTbody').innerHTML = smRows || `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">No data</td></tr>`;

  // Item-wise aggregation
  const itemMap={};
  orders.forEach(o=> o.items.forEach(it=>{
    const key = it.itemName+'|'+o.brand;
    if(!itemMap[key]) itemMap[key]={itemName:it.itemName, brand:o.brand, qty:0, value:0};
    itemMap[key].qty += it.orderedQty;
    itemMap[key].value += it.value;
  }));
  const itemRows = Object.values(itemMap).sort((a,b)=>b.value-a.value).map(it=>`
    <tr>
      <td><b>${escapeHtml(it.itemName)}</b></td>
      <td><span class="badge badge-blue">${escapeHtml(it.brand)}</span></td>
      <td>${fmtNum(it.qty)}</td>
      <td>${fmtINR(it.value)}</td>
    </tr>`).join('');
  $('#repItemTbody').innerHTML = itemRows || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No data</td></tr>`;
}
