(() => {
  'use strict';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const KEYS = {users:'ek20_users', apps:'ek20_apps', referrals:'ek20_referrals', session:'ek20_session'};
  const seedApps = [
    {id:'app_cashback',name:'Cashback Club',category:'Cashback',description:'Shopping offers aur cashback deals explore karne ke liye sample listing.',reward:'Offers vary',commission:35,url:'https://example.com',active:true,featured:true},
    {id:'app_survey',name:'Survey Rewards',category:'Surveys',description:'Online surveys ke sample offers. Join karne se pehle platform ki terms check karein.',reward:'Depends on offer',commission:20,url:'https://example.com',active:true,featured:true},
    {id:'app_learning',name:'Skill Tasks',category:'Tasks',description:'Learning aur small online tasks ki illustrative listing.',reward:'Task-based',commission:15,url:'https://example.com',active:true,featured:true},
    {id:'app_shopping',name:'Smart Shopping',category:'Shopping',description:'Shopping partner offers ki sample entry. Actual availability partner par depend karti hai.',reward:'Partner dependent',commission:40,url:'https://example.com',active:true,featured:false},
    {id:'app_wallet',name:'Wallet Offers',category:'Finance',description:'Financial offers ko list karne ke liye demo card. Fees aur conditions zaroor padhein.',reward:'Terms apply',commission:25,url:'https://example.com',active:true,featured:false}
  ];
  let authMode='login', currentUser=null, activePage='overview', toastTimer=null;

  function read(key, fallback){try{const v=localStorage.getItem(key);return v?JSON.parse(v):fallback}catch(e){return fallback}}
  function write(key, value){localStorage.setItem(key,JSON.stringify(value))}
  function id(prefix='id'){return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
  function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function safeUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}}
  function money(v){return '₹'+Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}
  function dateLabel(value){const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
  function getUsers(){return read(KEYS.users,[])}
  function getApps(){return read(KEYS.apps,seedApps)}
  function getReferrals(){return read(KEYS.referrals,[])}
  function isAdmin(){return currentUser?.role==='admin'}
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200)}
  function setMessage(el,message,error=false){el.textContent=message;el.classList.toggle('error',error)}
  function seed(){
    if(!localStorage.getItem(KEYS.apps))write(KEYS.apps,seedApps);
    if(!localStorage.getItem(KEYS.users)){
      write(KEYS.users,[
        {id:'admin_demo',name:'Demo Admin',email:'admin@earnkaro.demo',password:'admin123',role:'admin',joined:new Date().toISOString()},
        {id:'user_demo',name:'Demo User',email:'user@earnkaro.demo',password:'user123',role:'user',joined:new Date().toISOString()}
      ]);
    }
    if(!localStorage.getItem(KEYS.referrals))write(KEYS.referrals,[]);
  }
  function setAuthMode(mode){
    authMode=mode;
    $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.authTab===mode));
    $$('.register-only').forEach(el=>el.classList.toggle('hidden',mode!=='register'));
    $('#authName').required=mode==='register';
    $('#authTitle').textContent=mode==='login'?'Welcome back':'Create your account';
    $('#authSubtitle').textContent=mode==='login'?'Apne account me login karein.':'Dashboard access ke liye account banayein.';
    $('#authSubmit').innerHTML=mode==='login'?'Login to dashboard <span>→</span>':'Create account <span>→</span>';
    $('#authPassword').autocomplete=mode==='login'?'current-password':'new-password';
    setMessage($('#authMessage'),'');
  }
  function enter(user){
    currentUser=user;write(KEYS.session,{userId:user.id});
    $('#authView').classList.add('hidden');$('#appView').classList.remove('hidden');$('#logoutBtn').classList.remove('hidden');
    $('#topUser').classList.remove('hidden');$('#topUser').textContent=user.name;
    $('#sideName').textContent=user.name;$('#sideRole').textContent=user.role.toUpperCase()+' ACCOUNT';$('#avatar').textContent=(user.name||'U').trim().charAt(0).toUpperCase();
    $$('.admin-only').forEach(el=>el.classList.toggle('hidden',!isAdmin()));
    $('#notice').classList.toggle('hidden',!isAdmin());
    if(isAdmin())$('#notice').textContent='Admin mode: yahan add kiye gaye apps browser ke demo data me save honge. Real users aur commissions ko manage karne ke liye backend/database connect karein.';
    else $('#notice').textContent='Tip: “Open offer” se partner page new tab me khulta hai. Is demo me referral click record hota hai, lekin external sign-up ya commission verify nahi hota.';
    showPage('overview');renderAll();
  }
  function logout(){currentUser=null;localStorage.removeItem(KEYS.session);$('#appView').classList.add('hidden');$('#authView').classList.remove('hidden');$('#logoutBtn').classList.add('hidden');$('#topUser').classList.add('hidden');setAuthMode('login')}
  function showPage(page){
    if(['manage','users'].includes(page)&&!isAdmin()){toast('Yeh section sirf admin account ke liye hai.');page='overview'}
    activePage=page;
    $$('.page').forEach(p=>p.classList.toggle('hidden',p.id!=='page-'+page));
    $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    const titles={overview:['Your overview','OVERVIEW','Aapki earning activity ka quick snapshot.'],offers:['Earning apps','EARNING APPS','Listed opportunities explore karein.'],referrals:['My referrals','MY REFERRALS','Aapke demo referral click records.'],earnings:['Earnings & commission','EARNINGS','Sample commission status aur ledger.'],manage:['Manage apps','ADMIN / APPS','Apps ki listing create aur update karein.'],users:['User accounts','ADMIN / USERS','Browser me registered demo accounts.']};
    const t=titles[page]||titles.overview;$('#pageTitle').textContent=t[0];$('#pageCrumb').textContent=t[1];$('#pageDesc').textContent=t[2];
    if(page==='manage')renderAdminApps();if(page==='users')renderUsers();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function userReferrals(){return getReferrals().filter(r=>r.userId===currentUser.id)}
  function activeApps(){return getApps().filter(a=>a.active!==false)}
  function renderAll(){renderOverview();renderOffers();renderReferrals();renderEarnings();if(isAdmin()){renderAdminApps();renderUsers()}}
  function renderOverview(){
    const apps=activeApps(), refs=userReferrals(), earned=refs.filter(r=>r.status==='Approved').reduce((s,r)=>s+Number(r.amount||0),0),pending=refs.filter(r=>r.status==='Pending').reduce((s,r)=>s+Number(r.amount||0),0);
    $('#statApps').textContent=apps.length;$('#statReferrals').textContent=refs.length;$('#statEarned').textContent=money(earned);$('#statPending').textContent=money(pending);
    const featured=apps.filter(a=>a.featured).slice(0,3);$('#featuredApps').innerHTML=featured.length?featured.map(app=>`<div class="mini-app"><div class="app-logo">${escapeHtml(app.name.slice(0,2).toUpperCase())}</div><div class="mini-app-main"><h4>${escapeHtml(app.name)}</h4><p>${escapeHtml(app.category)} · ${escapeHtml(app.reward)}</p></div><button class="btn btn-ghost" data-open-app="${escapeHtml(app.id)}">Open ↗</button></div>`).join(''):'<p class="muted">Abhi featured apps nahi hain.</p>';
  }
  function appCard(a){
    const url=safeUrl(a.url);
    return `<article class="offer-card glass"><div class="offer-top"><div class="app-logo">${escapeHtml(a.name.slice(0,2).toUpperCase())}</div><span class="category-pill">${escapeHtml(a.category)}</span></div><h3>${escapeHtml(a.name)}</h3><p>${escapeHtml(a.description)}</p><div class="reward-box"><span>Reward / offer</span><b>${escapeHtml(a.reward)}</b></div><div class="offer-actions"><button class="btn btn-primary" data-open-app="${escapeHtml(a.id)}" ${url?'':'disabled'}>Open offer ↗</button><button class="btn btn-ghost" data-copy-app="${escapeHtml(a.id)}">Copy link</button></div></article>`;
  }
  function renderOffers(){
    const q=($('#appSearch')?.value||'').toLowerCase().trim(),cat=$('#categoryFilter')?.value||'all';
    const apps=activeApps();const cats=[...new Set(apps.map(a=>a.category))].sort();const filter=$('#categoryFilter');const old=filter.value;
    filter.innerHTML='<option value="all">All categories</option>'+cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    filter.value=cats.includes(old)?old:'all';
    const filtered=apps.filter(a=>(cat==='all'||a.category===cat)&&(`${a.name} ${a.category} ${a.description}`.toLowerCase().includes(q)));
    $('#allApps').innerHTML=filtered.map(appCard).join('');$('#emptyApps').classList.toggle('hidden',filtered.length>0);
  }
  function renderReferrals(){
    const rows=userReferrals().sort((a,b)=>new Date(b.created)-new Date(a.created));$('#referralRows').innerHTML=rows.map(r=>`<tr><td>${escapeHtml(r.appName)}</td><td>${dateLabel(r.created)}</td><td><span class="badge ${r.status.toLowerCase()}">${escapeHtml(r.status)}</span></td><td>${money(r.amount)}</td></tr>`).join('');$('#emptyReferrals').classList.toggle('hidden',rows.length>0);
  }
  function renderEarnings(){
    const refs=userReferrals(),approved=refs.filter(r=>r.status==='Approved').reduce((s,r)=>s+Number(r.amount||0),0),pending=refs.filter(r=>r.status==='Pending').reduce((s,r)=>s+Number(r.amount||0),0);
    $('#approvedTotal').textContent=money(approved);$('#pendingTotal').textContent=money(pending);
    $('#earningRows').innerHTML=refs.length?refs.sort((a,b)=>new Date(b.created)-new Date(a.created)).map(r=>`<tr><td>${escapeHtml(r.appName)}</td><td>${dateLabel(r.created)}</td><td><span class="badge ${r.status.toLowerCase()}">${escapeHtml(r.status)}</span></td><td>${money(r.amount)}</td></tr>`).join(''):'<tr><td colspan="4" class="muted">No commission records yet.</td></tr>';
  }
  function openApp(appId){
    const app=getApps().find(a=>a.id===appId&&a.active!==false);if(!app){toast('Yeh app ab available nahi hai.');renderAll();return}
    const url=safeUrl(app.url);if(!url){toast('Is app ka URL valid nahi hai.');return}
    const newTab=window.open(url,'_blank','noopener,noreferrer');
    if(!newTab){toast('Browser ne new tab block kiya. Pop-ups allow karke dobara try karein.');return}
    const refs=getReferrals();refs.push({id:id('ref'),userId:currentUser.id,appId:app.id,appName:app.name,created:new Date().toISOString(),status:'Pending',amount:Number(app.commission)||0});write(KEYS.referrals,refs);renderAll();toast('Offer new tab me khul gaya. Demo click record save hua; commission confirm nahi hua.');
  }
  async function copyApp(appId){
    const app=getApps().find(a=>a.id===appId);if(!app)return;const url=safeUrl(app.url);if(!url){toast('URL valid nahi hai.');return}
    try{await navigator.clipboard.writeText(url);toast('Link copied! Is demo me yeh wahi URL hai jo admin ne add kiya.')}
    catch{window.prompt('Link copy karein:',url)}
  }
  function renderAdminApps(){
    const apps=getApps();$('#adminAppList').innerHTML=apps.length?apps.map(a=>`<div class="admin-app"><div class="app-logo">${escapeHtml(a.name.slice(0,2).toUpperCase())}</div><div class="app-name"><b>${escapeHtml(a.name)} ${a.active===false?'<span class="badge">Hidden</span>':''}</b><small>${escapeHtml(a.category)} · ${money(a.commission)} demo commission</small></div><button class="btn btn-ghost" data-edit-app="${escapeHtml(a.id)}">Edit</button><button class="btn danger" data-delete-app="${escapeHtml(a.id)}">Delete</button></div>`).join(''):'<p class="muted">Koi app listed nahi hai.</p>';
  }
  function renderUsers(){
    const users=getUsers();$('#userRows').innerHTML=users.map(u=>`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td><span class="badge">${escapeHtml(u.role)}</span></td><td>${dateLabel(u.joined)}</td></tr>`).join('');
  }
  function resetAppForm(){ $('#appForm').reset();$('#editAppId').value='';$('#newAppCommission').value='25';$('#appFormTitle').textContent='Add an earning app';$('#saveAppBtn').textContent='Save app';$('#cancelEditBtn').classList.add('hidden');setMessage($('#appFormMessage'),'') }
  function editApp(appId){
    const a=getApps().find(x=>x.id===appId);if(!a)return;
    $('#editAppId').value=a.id;$('#newAppName').value=a.name;$('#newAppCategory').value=a.category;$('#newAppDescription').value=a.description;$('#newAppReward').value=a.reward;$('#newAppCommission').value=a.commission;$('#newAppUrl').value=a.url;
    $('#appFormTitle').textContent='Edit earning app';$('#saveAppBtn').textContent='Update app';$('#cancelEditBtn').classList.remove('hidden');$('#appForm').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function saveApp(e){
    e.preventDefault();if(!isAdmin())return;
    const name=$('#newAppName').value.trim(),category=$('#newAppCategory').value.trim(),description=$('#newAppDescription').value.trim(),reward=$('#newAppReward').value.trim(),commission=Number($('#newAppCommission').value),url=safeUrl($('#newAppUrl').value.trim()),editId=$('#editAppId').value;
    if(!name||!category||!description||!reward||!url||!Number.isFinite(commission)||commission<0){setMessage($('#appFormMessage'),'Please sab fields sahi tarah fill karein.',true);return}
    const apps=getApps(),existing=apps.find(a=>a.id===editId);
    const record={id:editId||id('app'),name,category,description,reward,commission,url,active:existing?existing.active!==false:true,featured:existing?!!existing.featured:false};
    if(existing)write(KEYS.apps,apps.map(a=>a.id===editId?record:a));else write(KEYS.apps,[record,...apps]);
    resetAppForm();renderAll();renderAdminApps();setMessage($('#appFormMessage'),existing?'App successfully updated.':'App successfully added.');toast(existing?'App updated.':'New app added.');
  }
  function deleteApp(appId){
    const app=getApps().find(a=>a.id===appId);if(!app)return;if(!confirm(`“${app.name}” ko listing se delete karein?`))return;
    write(KEYS.apps,getApps().filter(a=>a.id!==appId));renderAll();renderAdminApps();toast('App listing delete ho gayi.');
  }
  function authSubmit(e){
    e.preventDefault();const email=$('#authEmail').value.trim().toLowerCase(),password=$('#authPassword').value;const msg=$('#authMessage');
    if(authMode==='login'){
      const user=getUsers().find(u=>u.email.toLowerCase()===email&&u.password===password);
      if(!user){setMessage(msg,'Email ya password galat hai. Demo credentials check karein.',true);return}
      enter(user);
    }else{
      const name=$('#authName').value.trim(),role=$('#authRole').value;
      if(name.length<2){setMessage(msg,'Naam kam se kam 2 characters ka hona chahiye.',true);return}
      if(password.length<6){setMessage(msg,'Password kam se kam 6 characters ka rakhein.',true);return}
      if(getUsers().some(u=>u.email.toLowerCase()===email)){setMessage(msg,'Is email se account pehle se maujood hai.',true);return}
      const user={id:id('user'),name,email,password,role,joined:new Date().toISOString()};write(KEYS.users,[...getUsers(),user]);enter(user);
      toast('Demo account create ho gaya.');
    }
  }
  document.addEventListener('click',e=>{
    const tab=e.target.closest('[data-auth-tab]');if(tab){setAuthMode(tab.dataset.authTab);return}
    const nav=e.target.closest('[data-page]');if(nav){showPage(nav.dataset.page);return}
    const goto=e.target.closest('[data-goto]');if(goto){showPage(goto.dataset.goto);return}
    const open=e.target.closest('[data-open-app]');if(open){openApp(open.dataset.openApp);return}
    const copy=e.target.closest('[data-copy-app]');if(copy){copyApp(copy.dataset.copyApp);return}
    const edit=e.target.closest('[data-edit-app]');if(edit){editApp(edit.dataset.editApp);return}
    const del=e.target.closest('[data-delete-app]');if(del){deleteApp(del.dataset.deleteApp);return}
  });
  $('#authForm').addEventListener('submit',authSubmit);$('#logoutBtn').addEventListener('click',logout);
  $('#appSearch').addEventListener('input',renderOffers);$('#categoryFilter').addEventListener('change',renderOffers);
  $('#appForm').addEventListener('submit',saveApp);$('#cancelEditBtn').addEventListener('click',resetAppForm);
  seed();
  const session=read(KEYS.session,null),savedUser=session&&getUsers().find(u=>u.id===session.userId);
  if(savedUser)enter(savedUser);else setAuthMode('login');
})();
