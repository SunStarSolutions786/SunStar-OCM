/* ============================================================
   SunStar OCM — app-superadmin.js
   Super Admin: login, company creation, subscription control
============================================================ */

const SA_NAV = [
  {key:'companies', label:'Companies', icon:'🏢'},
  {key:'settings', label:'Settings', icon:'⚙️'}
];

function renderSuperAdminEntry(){
  if(sessionStorage.getItem('sa_auth')==='1'){
    renderSuperAdminApp('companies');
  } else {
    checkSuperAdminSetup();
  }
}

/* ---------- First-run setup / Login ---------- */
function checkSuperAdminSetup(){
  DB.collection('system').doc('superadmin').get().then(doc=>{
    if(doc.exists){
      renderSuperAdminLogin();
    } else {
      renderSuperAdminSetup();
    }
  }).catch(()=> renderSuperAdminLogin());
}

function renderSuperAdminSetup(){
  const root = el(`
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">S</div>
        <h2>Set Up Super Admin</h2>
        <div class="auth-sub">Create a password to control SunStar OCM</div>
        <div class="auth-error" id="saErr"></div>
        <div class="field">
          <label>New Password</label>
          <input type="password" class="input" id="saPass" placeholder="Enter a strong password">
        </div>
        <div class="field">
          <label>Confirm Password</label>
          <input type="password" class="input" id="saPass2" placeholder="Re-enter password">
        </div>
        <button class="btn btn-accent btn-block" id="saSetupBtn">Create Super Admin</button>
      </div>
    </div>
  `);
  $('#appRoot').innerHTML='';
  $('#appRoot').appendChild(root);

  $('#saSetupBtn').addEventListener('click', ()=>{
    const p1 = $('#saPass').value.trim();
    const p2 = $('#saPass2').value.trim();
    const err = $('#saErr');
    if(p1.length < 4){ err.textContent='Password must be at least 4 characters.'; err.classList.add('show'); return; }
    if(p1 !== p2){ err.textContent='Passwords do not match.'; err.classList.add('show'); return; }
    DB.collection('system').doc('superadmin').set({password:p1, createdAt:firebase.firestore.FieldValue.serverTimestamp()})
      .then(()=>{
        sessionStorage.setItem('sa_auth','1');
        renderSuperAdminApp('companies');
      })
      .catch(e=>{ err.textContent='Error: '+e.message; err.classList.add('show'); });
  });
}

function renderSuperAdminLogin(){
  const root = el(`
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">S</div>
        <h2>Super Admin</h2>
        <div class="auth-sub">SunStar OCM Control Panel</div>
        <div class="auth-error" id="saErr">Incorrect password. Please try again.</div>
        <div class="field">
          <label>Password</label>
          <input type="password" class="input" id="saPass" placeholder="Enter password">
        </div>
        <button class="btn btn-accent btn-block" id="saLoginBtn">Log In</button>
      </div>
    </div>
  `);
  $('#appRoot').innerHTML='';
  $('#appRoot').appendChild(root);

  const doLogin = ()=>{
    const p = $('#saPass').value.trim();
    DB.collection('system').doc('superadmin').get().then(doc=>{
      if(doc.exists && doc.data().password === p){
        sessionStorage.setItem('sa_auth','1');
        renderSuperAdminApp('companies');
      } else {
        $('#saErr').classList.add('show');
      }
    });
  };
  $('#saLoginBtn').addEventListener('click', doLogin);
  $('#saPass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
}

/* ---------- Main Super Admin App Shell ---------- */
function renderSuperAdminApp(activeKey){
  if(!$('#pageContent')){
    $('#appRoot').innerHTML='';
    const root = buildShellLayout({
      brandName:'SunStar OCM',
      brandSub:'Super Admin',
      navItems: SA_NAV,
      activeKey,
      roleClass:'role-superadmin',
      onNav:(key)=> renderSuperAdminApp(key),
      footerHtml:`<button class="btn btn-outline btn-block" id="saLogoutBtn">Log Out</button>`
    });
    $('#appRoot').appendChild(root);
    $('#saLogoutBtn').addEventListener('click', ()=>{
      sessionStorage.removeItem('sa_auth');
      location.reload();
    });
  }
  $all('.nav-item').forEach(b=> b.classList.toggle('active', b.dataset.key===activeKey));
  if(activeKey==='companies'){ setPageTitle('Companies'); swapContent(renderSACompanies); }
  else if(activeKey==='settings'){ setPageTitle('Settings'); swapContent(renderSASettings); }
}

/* ---------- Companies List ---------- */
function renderSACompanies(){
  const content = $('#pageContent');
  content.innerHTML = `
    <div class="section-header">
      <h2>All Companies</h2>
      <button class="btn btn-accent" id="addCompanyBtn">+ Add Company</button>
    </div>
    <div class="card" style="margin-bottom:14px;">
      <input class="input" id="companySearch" placeholder="Search by company name or ID...">
    </div>
    <div id="companiesGrid" class="grid grid-3"></div>
  `;
  $('#addCompanyBtn').addEventListener('click', ()=> openCompanyModal(null));
  $('#companySearch').addEventListener('input', ()=> renderCompaniesGrid());

  // detach previous listeners
  APP.unsub.forEach(u=>u());
  APP.unsub=[];

  const unsub = DB.collection('companies').orderBy('createdAt','desc').onSnapshot(snap=>{
    APP.allCompanies = [];
    snap.forEach(doc=>{
      const c = doc.data(); c.id = doc.id;
      APP.allCompanies.push(c);
    });
    renderCompaniesGrid();
  });
  APP.unsub.push(unsub);
}

function renderCompaniesGrid(){
  const grid = $('#companiesGrid');
  if(!grid) return;
  const search = norm($('#companySearch') ? $('#companySearch').value : '');
  let list = APP.allCompanies || [];
  if(search) list = list.filter(c=> norm(c.name).includes(search) || norm(c.id).includes(search));

  if((APP.allCompanies||[]).length===0){
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="es-icon">🏢</div>
        <h4>No companies yet</h4>
        <p>Click "Add Company" to onboard your first client.</p>
      </div>`;
    return;
  }
  if(list.length===0){
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="es-icon">🔍</div>
        <h4>No matching companies</h4>
        <p>Try a different search term.</p>
      </div>`;
    return;
  }
  grid.innerHTML='';
  list.forEach(c=>{
      const sub = getSubscriptionStatus(c);
      const card = el(`
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <div style="font-family:var(--font-display);font-weight:700;font-size:15px;">${escapeHtml(c.name)}</div>
              <div class="helper-text">ID: ${escapeHtml(c.id)}</div>
            </div>
            <span class="badge badge-${sub.color}">${sub.label}</span>
          </div>
          <div class="divider"></div>
          <div class="helper-text" style="margin-bottom:10px;">
            Expiry: <b>${c.expiryDate ? fmtDateDisplay(c.expiryDate) : 'Unlimited'}</b>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" data-edit="${c.id}">Manage</button>
            <button class="btn btn-outline btn-sm" data-links="${c.id}">Links</button>
          </div>
        </div>
      `);
      card.querySelector('[data-edit]').addEventListener('click', ()=> openCompanyModal(c));
      card.querySelector('[data-links]').addEventListener('click', ()=> openLinksModal(c));
      grid.appendChild(card);
    });
}

/* ---------- Add / Edit Company Modal ---------- */
function openCompanyModal(company){
  const isEdit = !!company;
  const html = `
    <h3>${isEdit ? 'Manage Company' : 'Add New Company'}</h3>
    <div class="field">
      <label>Company Name</label>
      <input class="input" id="cName" value="${isEdit?escapeHtml(company.name):''}" placeholder="e.g. Apollo Distributors">
    </div>
    <div class="field">
      <label>Admin Login Password</label>
      <input class="input" id="cPass" value="${isEdit?escapeHtml(company.adminPassword||''):''}" placeholder="Set a password for company admin">
    </div>
    <div class="field">
      <label>Subscription Expiry Date</label>
      <input type="date" class="input" id="cExpiry" value="${isEdit && company.expiryDate ? company.expiryDate : ''}">
      <div class="helper-text">Leave blank for unlimited access.</div>
    </div>
    ${isEdit ? `
    <div class="input-row" style="margin-bottom:12px;">
      <button class="btn btn-outline btn-sm" id="add30Btn" type="button">+30 Days</button>
      <button class="btn btn-outline btn-sm" id="clearExpiryBtn" type="button">Set Unlimited</button>
    </div>` : ''}
    <div class="divider"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-accent" id="saveCompanyBtn">${isEdit?'Save Changes':'Create Company'}</button>
      <button class="btn btn-outline" id="cancelBtn">Cancel</button>
      ${isEdit ? `<button class="btn btn-danger" id="deleteCompanyBtn" style="margin-left:auto;">Delete</button>` : ''}
    </div>
  `;
  openModal(html);
  $('#cancelBtn').addEventListener('click', closeModal);

  if(isEdit){
    $('#add30Btn').addEventListener('click', ()=>{
      const base = company.expiryDate ? new Date(company.expiryDate+'T00:00:00') : new Date();
      const ref = (base < new Date()) ? new Date() : base;
      ref.setDate(ref.getDate()+30);
      $('#cExpiry').value = ref.toISOString().slice(0,10);
    });
    $('#clearExpiryBtn').addEventListener('click', ()=>{ $('#cExpiry').value=''; });
    $('#deleteCompanyBtn').addEventListener('click', ()=>{
      if(confirm('Delete "'+company.name+'"? This cannot be undone.')){
        DB.collection('companies').doc(company.id).delete().then(()=>{
          showToast('Company deleted','success');
          closeModal();
        });
      }
    });
  }

  $('#saveCompanyBtn').addEventListener('click', ()=>{
    const name = $('#cName').value.trim();
    const pass = $('#cPass').value.trim();
    const expiry = $('#cExpiry').value || null;
    if(!name){ showToast('Company name is required','error'); return; }
    if(!pass){ showToast('Admin password is required','error'); return; }

    if(isEdit){
      DB.collection('companies').doc(company.id).update({
        name, adminPassword:pass, expiryDate:expiry
      }).then(()=>{ showToast('Company updated','success'); closeModal(); });
    } else {
      const companyId = (name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'company') + '-' + uid().slice(-4);
      const employeeToken = genToken(10);
      DB.collection('companies').doc(companyId).set({
        name, adminPassword:pass, expiryDate:expiry,
        employeeToken,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(()=>{
        showToast('Company created','success');
        closeModal();
        const newCompany = {id:companyId, name, adminPassword:pass, expiryDate:expiry, employeeToken};
        setTimeout(()=> openLinksModal(newCompany), 300);
      });
    }
  });
}

/* ---------- Links Modal (Admin + Employee links) ---------- */
function openLinksModal(company){
  const base = location.origin + location.pathname;
  const adminLink = `${base}?view=admin&company=${company.id}`;
  const employeeLink = `${base}?view=order&token=${company.employeeToken}`;
  const html = `
    <h3>Access Links — ${escapeHtml(company.name)}</h3>
    <div class="field">
      <label>Admin Login Link</label>
      <input class="input" id="adminLinkInput" value="${adminLink}" readonly>
      <div class="helper-text">Company ID: <b>${company.id}</b> &nbsp;|&nbsp; Password: <b>${escapeHtml(company.adminPassword||'')}</b></div>
      <button class="btn btn-outline btn-sm" style="margin-top:8px;" data-copy="${adminLink}">Copy Admin Link</button>
    </div>
    <div class="divider"></div>
    <div class="field">
      <label>Employee Order Link (Universal)</label>
      <input class="input" id="empLinkInput" value="${employeeLink}" readonly>
      <div class="helper-text">Share this link with all field staff. Each employee selects their own name after opening.</div>
      <button class="btn btn-outline btn-sm" style="margin-top:8px;" data-copy="${employeeLink}">Copy Employee Link</button>
    </div>
    <div class="divider"></div>
    <button class="btn btn-outline btn-block" id="closeLinksBtn">Close</button>
  `;
  openModal(html);
  $('#closeLinksBtn').addEventListener('click', closeModal);
  $all('[data-copy]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      navigator.clipboard.writeText(btn.dataset.copy).then(()=> showToast('Link copied','success'));
    });
  });
}

/* ---------- Settings (change super admin password) ---------- */
function renderSASettings(){
  const content = $('#pageContent');
  content.innerHTML = `
    <div class="card" style="max-width:420px;">
      <div class="card-title">Change Super Admin Password</div>
      <div class="field">
        <label>Current Password</label>
        <input type="password" class="input" id="oldPass">
      </div>
      <div class="field">
        <label>New Password</label>
        <input type="password" class="input" id="newPass">
      </div>
      <button class="btn btn-accent" id="changePassBtn">Update Password</button>
    </div>
  `;
  $('#changePassBtn').addEventListener('click', ()=>{
    const oldP = $('#oldPass').value.trim();
    const newP = $('#newPass').value.trim();
    if(newP.length<4){ showToast('New password too short','error'); return; }
    DB.collection('system').doc('superadmin').get().then(doc=>{
      if(doc.data().password !== oldP){ showToast('Current password is incorrect','error'); return; }
      DB.collection('system').doc('superadmin').update({password:newP}).then(()=>{
        showToast('Password updated','success');
        $('#oldPass').value=''; $('#newPass').value='';
      });
    });
  });
}
