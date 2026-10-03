const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

// State and default categories
const EXP_CATS = ["Food","Rent","Transport","Utilities","Health","Shopping","Entertainment","Other"];
const INC_CATS = ["Salary","Freelance","Gift","Interest","Other"];
let historyPage = 1;
let selectedMonth = localDateKey().slice(0,7);
let type = "expense";
let editType = "expense";
let data = [];
let activeUserId = null;
let authMode = "signin";
let currency = "USD";
let pendingDelete = null;
let customCats = { expense: [], income: [] };
let hiddenDefaults = { expense: [], income: [] };
let categoryOperation = null;
let catMgrType = "expense";

function localDateKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function fmt(n){
  try{ return new Intl.NumberFormat(undefined, { style:"currency", currency, minimumFractionDigits:2, maximumFractionDigits:2 }).format(n); }
  catch(e){ return (n<0?"-":"") + currency + " " + Math.abs(n).toFixed(2); }
}
function niceMax(v){
  if(v<=0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v/mag;
  const step = norm<=1?1:norm<=2?2:norm<=5?5:10;
  return step*mag;
}
function fmtShort(n){ return n>=1000 ? Math.round(n/1000)+"k" : Math.round(n).toString(); }

// Authentication
const cooldownTimers = new WeakMap();
function clearCooldown(btn, label){
  clearInterval(cooldownTimers.get(btn)); cooldownTimers.delete(btn);
  btn.disabled = false; if(label) btn.textContent = label;
}
function startCooldown(btn, label, seconds){
  clearCooldown(btn);
  let left = seconds; btn.disabled = true;
  const tick = ()=>{
    if(left <= 0){ clearCooldown(btn, label); return; }
    btn.textContent = `${label} (${left}s)`; left--;
  };
  cooldownTimers.set(btn, setInterval(tick, 1000)); tick();
}
function friendlyAuthError(error){
  const m = error.message || "";
  const secs = parseInt((m.match(/after (\d+) seconds?/i)||[])[1], 10);
  if(secs) return { text:`We just sent an email — please wait ${secs} seconds before trying again.`, cooldown:secs };
  if(error.status === 429 || /rate limit/i.test(m)) return { text:"Too many emails have been sent recently. Please wait a few minutes and try again.", cooldown:60 };
  return { text:m, cooldown:0 };
}

document.querySelectorAll(".auth-tabs button").forEach(b=>{
  b.addEventListener("click", ()=>{
    document.querySelectorAll(".auth-tabs button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); authMode = b.dataset.mode;
    clearCooldown($("authBtn"));
    $("authBtn").textContent = authMode === "signin" ? "Sign in" : "Sign up";
    $("authErr").textContent = ""; $("authMsg").textContent = "";
    $("authEmail").value = ""; $("authPassword").value = "";
    $("authPassword").setAttribute("autocomplete", authMode === "signup" ? "new-password" : "current-password");
  });
});
$("authForm").addEventListener("submit", async e=>{
  e.preventDefault();
  $("authErr").textContent = ""; $("authMsg").textContent = "";
  $("authBtn").disabled = true;
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  const { error } = authMode === "signin"
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
  const label = authMode === "signin" ? "Sign in" : "Sign up";
  if(error){
    const f = friendlyAuthError(error);
    $("authErr").textContent = f.text;
    if(f.cooldown && authMode === "signup") startCooldown($("authBtn"), label, f.cooldown);
    else clearCooldown($("authBtn"), label);
    return;
  }
  if(authMode === "signup"){
    $("authMsg").textContent = "Account created. Check your email (and spam folder) for the confirmation link.";
    startCooldown($("authBtn"), label, 60);
  } else clearCooldown($("authBtn"), label);
});
$("avatarBtn").addEventListener("click", ()=>{ $("acctMenu").classList.toggle("hidden"); syncAccountMenu(); });
document.addEventListener("click", e=>{
  if(!$("acctMenu").contains(e.target) && !$("avatarBtn").contains(e.target)){ $("acctMenu").classList.add("hidden"); syncAccountMenu(); }
});
$("signOutBtn").addEventListener("click", async ()=>{ await sb.auth.signOut(); });
$("forgotBtn").addEventListener("click", ()=>{
  $("authForm").classList.add("hidden"); $("forgotBtn").classList.add("hidden");
  $("resetForm").classList.remove("hidden"); $("resetErr").textContent=""; $("resetMsg").textContent="";
});
$("resetBack").addEventListener("click", ()=>{
  $("resetForm").classList.add("hidden"); $("authForm").classList.remove("hidden"); $("forgotBtn").classList.remove("hidden");
});
$("resetForm").addEventListener("submit", async e=>{
  e.preventDefault();
  $("resetErr").textContent = ""; $("resetMsg").textContent = "";
  $("resetBtn").disabled = true;
  const email = $("resetEmail").value.trim();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if(error){
    const f = friendlyAuthError(error);
    $("resetErr").textContent = f.text;
    if(f.cooldown) startCooldown($("resetBtn"), "Send reset link", f.cooldown);
    else clearCooldown($("resetBtn"), "Send reset link");
    return;
  }
  $("resetMsg").textContent = "If that email has an account, a reset link is on its way. Check your spam folder too.";
  startCooldown($("resetBtn"), "Send reset link", 60);
});
$("recoveryForm").addEventListener("submit", async e=>{
  e.preventDefault();
  $("recoveryErr").textContent = "";
  $("recoverySave").disabled = true;
  const { error } = await sb.auth.updateUser({ password: $("recoveryPassword").value });
  $("recoverySave").disabled = false;
  if(error){ $("recoveryErr").textContent = error.message; return; }
  $("recoveryOverlay").classList.add("hidden");
  $("recoveryPassword").value = "";
});
sb.auth.onAuthStateChange((event, session)=>{
  if(event === "PASSWORD_RECOVERY"){
    $("recoveryOverlay").classList.remove("hidden");
  }
  if(session){
    if(activeUserId !== session.user.id){
      activeUserId = session.user.id; data = []; customCats = { expense: [], income: [] }; render();
    }
    $("authScreen").style.display = "none"; $("appScreen").style.display = "block";
    updateAccountIdentity(session.user);
    currency = session.user.user_metadata?.currency || "USD";
    $("currencySelect").value = currency;
    if(window.location.hash.includes("access_token")){
      history.replaceState(null, "", window.location.pathname);
    }
    loadData();
  } else {
    activeUserId = null; data = []; customCats = { expense: [], income: [] }; hiddenDefaults={expense:[],income:[]}; render();
    $("appScreen").style.display = "none"; $("authScreen").style.display = "block";
  }
});

// Currency, export and profile
$("currencySelect").value = currency;
$("openSettings").addEventListener("click", ()=>{ $("acctMenu").classList.add("hidden"); syncAccountMenu(); $("settingsOverlay").classList.remove("hidden"); });
$("settingsClose").addEventListener("click", ()=> $("settingsOverlay").classList.add("hidden"));

async function fetchRate(from, to){
  const f = from.toLowerCase(), t = to.toLowerCase();
  const sources = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${f}.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/${f}.json`
  ];
  for(const url of sources){
    try{
      const res = await fetch(url);
      if(!res.ok) continue;
      const rate = (await res.json())[f]?.[t];
      if(typeof rate === "number" && isFinite(rate) && rate > 0) return rate;
    }catch(e){ /* try the next source */ }
  }
  return null;
}

let pendingCurrency = null;
$("currencySelect").addEventListener("change", e=>{
  const newCur = e.target.value;
  if(newCur === currency) return;
  pendingCurrency = newCur;
  $("currencyConfirmText").textContent = `You're switching from ${currency} to ${newCur}. Convert your existing amounts using today's exchange rate, or just relabel the display currency and keep the numbers as they are?`;
  $("convertErr").textContent = "";
  $("currencyConfirmOverlay").classList.remove("hidden");
});
function cancelCurrencyChange(){
  $("currencySelect").value = currency;
  pendingCurrency = null;
  $("currencyConfirmOverlay").classList.add("hidden");
}
$("convertCancelBtn").addEventListener("click", cancelCurrencyChange);
$("convertNoBtn").addEventListener("click", async ()=>{
  const newCurrency=pendingCurrency;
  if(!newCurrency) return;
  const { error } = await sb.auth.updateUser({ data: { currency:newCurrency } });
  if(error){ $("convertErr").textContent=error.message; return; }
  currency=newCurrency; pendingCurrency=null;
  $("currencyConfirmOverlay").classList.add("hidden");
  render();
});
$("convertYesBtn").addEventListener("click", async ()=>{
  const oldCur = currency, newCur = pendingCurrency;
  $("convertErr").textContent = "";
  $("convertYesBtn").disabled = true; $("convertYesBtn").textContent = "Converting…";
  try{
    const rate = await fetchRate(oldCur, newCur);
    if(!rate) throw new Error("rate");
    // One atomic database call: converts every amount and saves the new currency together.
    const { error } = await sb.rpc("convert_currency", { rate, new_currency: newCur });
    if(error) throw new Error("db");
    await sb.auth.refreshSession();
    currency = newCur; pendingCurrency = null;
    $("currencyConfirmOverlay").classList.add("hidden");
    await loadData();
  }catch(err){
    $("convertErr").textContent = err.message === "db"
      ? "The conversion couldn't be saved, so nothing was changed. Please try again."
      : "Couldn't fetch a live exchange rate right now — try again, or choose \"Just switch\" instead.";
  }
  $("convertYesBtn").disabled = false; $("convertYesBtn").textContent = "Convert my amounts";
});
$("exportBtn").addEventListener("click", ()=>{
  const columns = ["date","type","category","amount","note"];
  const csvCell = value => {
    let text = String(value ?? "");
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = columns.map(csvCell).join(",") + "\r\n";
  const rows = data.map(t=> [t.date, t.type, t.category, t.amount, t.note||""]
    .map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([header+rows], {type:"text/csv"});
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = "ledger-export.csv"; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});

$("openProfile").addEventListener("click", async ()=>{
  $("acctMenu").classList.add("hidden"); syncAccountMenu();
  $("profileErr").textContent = ""; $("profileMsg").textContent = ""; $("profilePassword").value = "";
  const { data:{ user } } = await sb.auth.getUser();
  if(!user){ notify("Please sign in again to open your profile.",true); return; }
  updateAccountIdentity(user);
  $("profileName").value = user.user_metadata?.full_name || user.user_metadata?.name || "";
  $("profileEmail").value = user.email;
  $("profileSince").textContent = new Date(user.created_at).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});
  $("profileOverlay").classList.remove("hidden");
});
$("profileClose").addEventListener("click", ()=> $("profileOverlay").classList.add("hidden"));
$("saveNameBtn").addEventListener("click", async ()=>{
  $("profileErr").textContent = ""; $("profileMsg").textContent = "";
  const name=$("profileName").value.trim();
  if(!name){ $("profileErr").textContent="Enter your name first."; return; }
  const { data: result, error } = await sb.auth.updateUser({ data: { full_name: name } });
  if(error){ $("profileErr").textContent = error.message; return; }
  if(result?.user) updateAccountIdentity(result.user);
  $("profileMsg").textContent = "Name saved.";
});
$("saveEmailBtn").addEventListener("click", async ()=>{
  $("profileErr").textContent = ""; $("profileMsg").textContent = "";
  const newEmail = $("profileEmail").value.trim();
  const { error } = await sb.auth.updateUser({ email: newEmail }, { emailRedirectTo: window.location.origin });
  if(error){ $("profileErr").textContent = error.message; return; }
  $("profileMsg").textContent = "Check your new email to confirm the change.";
});
$("savePasswordBtn").addEventListener("click", async ()=>{
  $("profileErr").textContent = ""; $("profileMsg").textContent = "";
  const pw = $("profilePassword").value;
  if(pw.length<6){ $("profileErr").textContent = "Use at least 6 characters for your new password."; return; }
  const { error } = await sb.auth.updateUser({ password: pw });
  if(error){ $("profileErr").textContent = error.message; return; }
  $("profilePassword").value = "";
  $("profileMsg").textContent = "Password updated.";
});

// Navigation and transaction forms
const wideMQ = window.matchMedia("(min-width:1000px)");
function showView(name){
  $("viewTitle").textContent = ({dash:"Overview",add:"New entry",history:"Transactions"})[name];
  document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("active", x.dataset.view===name));
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));
  $("view-"+name).classList.add("active");
  if(name==="add") setTimeout(()=>$("amount").focus(),0);
}
document.querySelectorAll(".tabs button").forEach(b=> b.addEventListener("click", ()=> showView(b.dataset.view)));
$("viewAllBtn").addEventListener("click", ()=> showView("history"));

$("date").value = localDateKey();
function fillCats(sel, t){
  const current = sel.value;
  sel.innerHTML="";
  const all = availableCategories(t);
  all.forEach(c=>{ const o=document.createElement("option"); o.value=c; o.textContent=c; sel.appendChild(o); });
  if(current && all.includes(current)) sel.value = current;
}
function refreshAllCategorySelects(){
  fillCats($("category"), type);
  fillCats($("editCategory"), editType);
}
fillCats($("category"), type);
document.querySelectorAll('#form .toggle button').forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll('#form .toggle button').forEach(b=>b.classList.remove("active"));
    btn.classList.add("active"); type = btn.dataset.t; fillCats($("category"), type);
  });
});
$("form").addEventListener("submit", async e=>{
  e.preventDefault();
  const amount = parseFloat($("amount").value);
  if(!Number.isFinite(amount) || amount<=0) return;
  const { data:{ user } } = await sb.auth.getUser();
  if(!user){notify("Please sign in again to save an entry.",true);return;}
  $("addBtn").disabled = true;
  const { error } = await sb.from("transactions").insert({
    user_id: user.id, type, amount, category: $("category").value, date: $("date").value, note: $("note").value.trim()
  });
  $("addBtn").disabled = false;
  if(error){ notify(error.message, true); return; }
  notify("Entry saved.");
  if(!error){ $("amount").value=""; $("note").value=""; await loadData(); showView("dash"); if(wideMQ.matches) $("amount").focus(); }
});

fillCats($("editCategory"), "expense");
document.querySelectorAll('#editForm .toggle button').forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll('#editForm .toggle button').forEach(b=>b.classList.remove("active"));
    btn.classList.add("active"); editType = btn.dataset.t; fillCats($("editCategory"), editType);
  });
});
let editingId = null;
function openEdit(t){
  editingId = t.id; editType = t.type;
  document.querySelectorAll('#editForm .toggle button').forEach(b=> b.classList.toggle("active", b.dataset.t===editType));
  fillCats($("editCategory"), editType);
  if(![...$("editCategory").options].some(o=>o.value===t.category)){
    const option=document.createElement("option"); option.value=t.category; option.textContent=t.category; $("editCategory").appendChild(option);
  }
  $("editAmount").value = t.amount; $("editCategory").value = t.category;
  $("editDate").value = t.date; $("editNote").value = t.note || "";
  $("editOverlay").classList.remove("hidden");
}
$("editCancel").addEventListener("click", ()=> $("editOverlay").classList.add("hidden"));
$("editForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const editedAmount=Number($("editAmount").value);
  if(!Number.isFinite(editedAmount) || editedAmount<=0){notify("Enter an amount greater than zero.",true);return;}
  $("editSave").disabled = true;
  const { error } = await sb.from("transactions").update({
    type: editType, amount: parseFloat($("editAmount").value), category: $("editCategory").value,
    date: $("editDate").value, note: $("editNote").value.trim()
  }).eq("id", editingId);
  $("editSave").disabled = false;
  if(error){ notify(error.message, true); return; }
  notify("Entry updated.");
  if(!error){ $("editOverlay").classList.add("hidden"); await loadData(); }
});

// Delete with undo
function showToast(msg, onUndo){
  const toast = $("toast");
  toast.innerHTML = `<span>${msg}</span>`;
  const btn = document.createElement("button"); btn.textContent = "Undo";
  btn.addEventListener("click", onUndo);
  toast.appendChild(btn);
  toast.classList.remove("hidden");
}
function hideToast(){ $("toast").classList.add("hidden"); }
function requestDelete(t){
  if(pendingDelete) finalizePendingDelete();
  data = data.filter(x=> x.id !== t.id);
  render();
  const timer = setTimeout(()=> finalizePendingDelete(), 6000);
  pendingDelete = { entry: t, timer };
  showToast("Entry deleted.", undoDelete);
}
function undoDelete(){
  if(!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  data.push(pendingDelete.entry);
  pendingDelete = null;
  hideToast(); render();
}
async function finalizePendingDelete(){
  if(!pendingDelete) return;
  const { entry } = pendingDelete; pendingDelete = null;
  hideToast();
  const { error } = await sb.from("transactions").delete().eq("id", entry.id);
  if(error && activeUserId===entry.user_id){ data.push(entry); render(); notify("Could not delete entry: "+error.message,true); }
}

// Database reads and categories
async function fetchAllTransactions(){
  const PAGE = 1000; let from = 0; let all = [];
  while(true){
    const { data: rows, error } = await sb.from("transactions").select("*")
      .order("date",{ascending:false}).order("created_at",{ascending:false}).order("id")
      .range(from, from+PAGE-1);
    if(error) return null;
    all = all.concat(rows || []);
    if(!rows || rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
async function loadData(){
  const expectedUserId = activeUserId;
  if(!expectedUserId) return;
  const rows = await fetchAllTransactions();
  if(expectedUserId !== activeUserId) return;
  if(!rows){ notify("Could not load entries. Please check your connection and reload.", true); return; }
  data = rows.filter(t=> t.id !== pendingDelete?.entry.id);
  const { data: catRows, error } = await sb.from("categories").select("*").order("name");
  if(expectedUserId !== activeUserId) return;
  if(error){ notify("Entries loaded, but categories could not be loaded.",true); populateCategoryFilter(); render(); return; }
  customCats = { expense: [], income: [] };
  (catRows||[]).forEach(c=>{ customCats[c.type] = customCats[c.type] || []; customCats[c.type].push(c.name); });
  refreshAllCategorySelects();
  renderCatChips();
  populateCategoryFilter();
  render();
}

function availableCategories(t){
  const defaults=t==="expense" ? EXP_CATS : INC_CATS;
  return [...new Set([...defaults.filter(name=>!hiddenDefaults[t].includes(name)),...customCats[t]])];
}
function renderCatChips(){
  const holder=$("catChips"); holder.innerHTML="";
  const names=[...new Set([...availableCategories(catMgrType),...data.filter(t=>t.type===catMgrType).map(t=>t.category)])];
  if(!names.length){holder.innerHTML='<div class="empty">Add your first category below.</div>';return;}
  names.forEach(name=>{
    const count=data.filter(t=>t.type===catMgrType && t.category===name).length;
    const row=document.createElement("div");row.className="category-row";
    row.innerHTML=`<div class="category-row-info"><strong>${escapeHtml(name)}</strong><small>${count} ${count===1?"entry":"entries"}</small></div><div class="category-row-actions"><button type="button" class="icon-btn category-edit" aria-label="Edit ${escapeHtml(name)}" title="Edit category"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3Z"/></svg></button><button type="button" class="icon-btn danger category-delete" aria-label="Delete ${escapeHtml(name)}" title="Delete category"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>`;
    row.querySelector(".category-edit").addEventListener("click",()=>openCategoryAction("rename",catMgrType,name));
    row.querySelector(".category-delete").addEventListener("click",()=>openCategoryAction("delete",catMgrType,name));
    holder.appendChild(row);
  });
}
document.querySelectorAll("#catTypeExpense, #catTypeIncome").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll("#catTypeExpense, #catTypeIncome").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active"); catMgrType = btn.dataset.t; renderCatChips();
  });
});
$("addCatBtn").addEventListener("click", async ()=>{
  const name = $("newCatName").value.trim();
  if(!name) return;
  if(availableCategories(catMgrType).some(c=>c.toLowerCase()===name.toLowerCase())){notify("That category already exists.",true);return;}
  const { data:{ user } } = await sb.auth.getUser();
  if(!user){notify("Please sign in again.",true);return;}
  const { error } = await sb.from("categories").insert({ user_id: user.id, type: catMgrType, name });
  if(error){ notify(error.message,true); return; }
  if(!error){
    $("newCatName").value = "";
    customCats[catMgrType] = customCats[catMgrType] || [];
    if(!customCats[catMgrType].includes(name)) customCats[catMgrType].push(name);
    renderCatChips(); refreshAllCategorySelects(); populateCategoryFilter();
  }
});
// History filters and rendering
function populateCategoryFilter(){
  const sel = $("fCategory"); const current = sel.value;
  const cats = [...new Set(data.map(t=>t.category))].sort();
  sel.innerHTML = '<option value="">All categories</option>' + cats.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  sel.value = cats.includes(current) ? current : "";
}
["fSearch","fCategory","fFrom","fTo","fType"].forEach(id=> $(id).addEventListener("input", ()=>{ historyPage=1; renderHistory(); }));
function filteredData(){
  const q = $("fSearch").value.trim().toLowerCase();
  const cat = $("fCategory").value;
  const from = $("fFrom").value; const to = $("fTo").value;
  return data.filter(t=>{
    if(q && !((t.note||"").toLowerCase().includes(q) || t.category.toLowerCase().includes(q))) return false;
    if($("fType").value && t.type !== $("fType").value) return false;
    if(cat && t.category !== cat) return false;
    if(from && t.date < from) return false;
    if(to && t.date > to) return false;
    return true;
  });
}
function escapeHtml(s){ return String(s ?? "").replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function txRow(t, showActions=true){
  const row = document.createElement("div"); row.className = "tx glass";
  row.innerHTML = `
    <div class="tx-left">
      <div class="tx-cat">${escapeHtml(t.category)}${t.note ? " · "+escapeHtml(t.note) : ""}</div>
      <div class="tx-meta">${t.date}</div>
    </div>
    <div class="tx-amt num" style="color:${t.type==='income'?'var(--income)':'var(--expense)'}; text-shadow:0 0 10px ${t.type==='income'?'var(--income-glow)':'var(--expense-glow)'}">
      ${t.type==='income'?'+':'−'}${fmt(Math.abs(Number(t.amount)))}
    </div>
    <div class="tx-actions">
      ${showActions ? `<button class="icon-btn edit-btn" data-id="${escapeHtml(t.id)}" title="Edit entry" aria-label="Edit entry"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3Z"/><path d="m14 5 5 5"/></svg></button>
      <button class="icon-btn danger del-btn" data-id="${escapeHtml(t.id)}" title="Delete entry" aria-label="Delete entry"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button>` : ""}
    </div>`;
  return row;
}
function wireRowActions(container){
  container.querySelectorAll(".edit-btn").forEach(b=> b.addEventListener("click", ()=>{
    const t = data.find(x=> String(x.id)===b.dataset.id); if(t) openEdit(t);
  }));
  container.querySelectorAll(".del-btn").forEach(b=> b.addEventListener("click", ()=>{
    const t = data.find(x=> String(x.id)===b.dataset.id); if(t) requestDelete(t);
  }));
}
function renderHistory(){
  const list = $("historyList"); list.innerHTML = "";
  const val=(t,k)=> k==="amount" ? Number(t.amount)*(t.type==="income"?1:-1) : String(t[k]||"").toLowerCase();
  const rows = filteredData().sort((a,b)=>{const x=val(a,sortKey),y=val(b,sortKey);return (x<y?-1:x>y?1:0)*sortDir;});
  const income = rows.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0);
  const expense = rows.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);
  $("historySummary").textContent = `${rows.length} entries · Income ${fmt(income)} · Expenses ${fmt(expense)} · Net ${fmt(income-expense)}`;
  const pageSize=Number($("pageSize").value)||20;
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  historyPage=Math.min(historyPage,pages);
  $("pageInfo").textContent=`Page ${historyPage} of ${pages}`;
  $("prevPage").disabled=historyPage<=1; $("nextPage").disabled=historyPage>=pages;
  const pageRows=rows.slice((historyPage-1)*pageSize,historyPage*pageSize);
  if(rows.length===0){ list.innerHTML = '<div class="empty">No entries match your filters.</div>'; return; }
  if(wideMQ.matches){ renderHistoryTable(list, pageRows); return; }
  pageRows.forEach(t=> list.appendChild(txRow(t)));
  wireRowActions(list);
}

// Dashboard calculations
function render(){
  let inTotal=0, outTotal=0;
  const periodData = data.filter(t=> !selectedMonth || t.date.slice(0,7)===selectedMonth);
  periodData.forEach(t=> t.type==="income" ? inTotal+=Number(t.amount) : outTotal+=Number(t.amount));
  $("periodCaption").textContent = selectedMonth ? new Date(selectedMonth+"-01T12:00:00").toLocaleDateString(undefined,{month:"long",year:"numeric"}) + " · " + periodData.length + " entries" : "All time · " + periodData.length + " entries";
  $("sumBalance").textContent = fmt(inTotal-outTotal);
  $("sumIncome").textContent = fmt(inTotal);
  $("sumExpense").textContent = fmt(outTotal);
  $("savingsRate").textContent = inTotal>0 ? ((inTotal-outTotal)/inTotal*100).toFixed(1)+"%" : "—";

  const now = new Date();
  const byCat = {};
  periodData.filter(t=>t.type==="expense")
      .forEach(t=>{ byCat[t.category] = (byCat[t.category]||0) + Number(t.amount); });
  const totalCat = Object.values(byCat).reduce((a,b)=>a+b,0) || 1;
  const maxCat = Math.max(1, ...Object.values(byCat));
  const barsEl = $("bars"); barsEl.innerHTML = "";
  const sortedCat = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  if(sortedCat.length===0){ barsEl.innerHTML = '<div class="empty">No expenses in this period.</div>'; }
  else sortedCat.forEach(([cat,amt])=>{
    const row = document.createElement("div"); row.className="bar-row";
    row.innerHTML = `<div class="name">${escapeHtml(cat)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(amt/maxCat*100).toFixed(0)}%"></div></div>
      <div class="bar-pct">${Math.round(amt/totalCat*100)}%</div>
      <div class="bar-amt num">${fmt(amt)}</div>`;
    barsEl.appendChild(row);
  });

  const months = [];
  for(let i=5;i>=0;i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    months.push({key:localDateKey(d).slice(0,7), label:d.toLocaleDateString(undefined,{month:'short'}), inc:0, exp:0});
  }
  data.forEach(t=>{
    const m = months.find(x=>x.key===t.date.slice(0,7));
    if(m){ if(t.type==="income") m.inc+=Number(t.amount); else m.exp+=Number(t.amount); }
  });
  const hasChartData = months.some(m=> m.inc>0 || m.exp>0);
  const holder = $("chartHolder"); holder.innerHTML = "";
  $("chartSection").classList.remove("hidden");
  if(!hasChartData) holder.innerHTML='<div class="chart-empty">Your cash flow will appear here.<br>Add an income or expense to get started.</div>';
  if(hasChartData){
    const scale = niceMax(Math.max(...months.map(m=>Math.max(m.inc,m.exp))));
    const chart = document.createElement("div"); chart.className = "chart";
    [0,0.5,1].forEach(f=>{
      const gl = document.createElement("div"); gl.className = "gridline"; gl.style.bottom = (f*100)+"%";
      gl.innerHTML = `<span class="gl-label">${fmtShort(scale*f)}</span>`;
      chart.appendChild(gl);
    });
    const barsRow = document.createElement("div"); barsRow.className = "bars-row";
    months.forEach(m=>{
      const col = document.createElement("div"); col.className = "bar-col";
      col.innerHTML = `<div class="bar-pair">
          <div class="b-in" style="height:${(m.inc/scale*100).toFixed(0)}%" title="Income ${fmt(m.inc)}"></div>
          <div class="b-out" style="height:${(m.exp/scale*100).toFixed(0)}%" title="Expense ${fmt(m.exp)}"></div>
        </div>
        <div class="bar-label">${m.label}</div>`;
      barsRow.appendChild(col);
    });
    chart.appendChild(barsRow);
    holder.appendChild(chart);
  }

  const recent = $("recentList"); recent.innerHTML = "";
  if(data.length===0){ recent.innerHTML = '<div class="empty">Nothing logged yet. Add your first entry.</div>'; }
  else { [...data].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).forEach(t=> recent.appendChild(txRow(t))); wireRowActions(recent); }

  renderHistory();
}

// Desktop table and keyboard navigation
/* ---- large-screen behaviour ---- */
let sortKey = "date", sortDir = -1;
function renderHistoryTable(list, rows){
  const cols = [["date","Date"],["type","Type"],["category","Category"],["note","Note"],["amount","Amount"]];
  const val = (t,k)=> k==="amount" ? Number(t.amount)*(t.type==="income"?1:-1) : String(t[k]||"").toLowerCase();
  rows = [...rows].sort((a,b)=>{ const x=val(a,sortKey), y=val(b,sortKey); return (x<y?-1:x>y?1:0)*sortDir; });
  const tbl = document.createElement("table"); tbl.className = "tx-table";
  tbl.innerHTML = "<thead><tr>" + cols.map(([k,l])=>`<th data-k="${k}" tabindex="0" aria-sort="${sortKey===k?(sortDir>0?'ascending':'descending'):'none'}" class="${k==="amount"?"r":""}">${l}${sortKey===k?(sortDir>0?" ↑":" ↓"):""}</th>`).join("") + "<th></th></tr></thead>";
  const tb = document.createElement("tbody");
  rows.forEach(t=>{
    const tr = document.createElement("tr"), inc = t.type==="income";
    tr.innerHTML = `<td class="num">${escapeHtml(t.date)}</td><td><span class="type-badge ${inc?'income':'expense'}">${inc?'Income':'Expense'}</span></td><td>${escapeHtml(t.category)}</td><td class="note">${escapeHtml(t.note||"")}</td>
      <td class="r num" style="color:${inc?'var(--income)':'var(--expense)'}">${inc?'+':'−'}${fmt(Math.abs(Number(t.amount)))}</td>
      <td class="acts"><button class="icon-btn edit-btn" data-id="${escapeHtml(t.id)}" title="Edit entry" aria-label="Edit entry"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3Z"/><path d="m14 5 5 5"/></svg></button><button class="icon-btn danger del-btn" data-id="${escapeHtml(t.id)}" title="Delete entry" aria-label="Delete entry"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></td>`;
    tb.appendChild(tr);
  });
  tbl.appendChild(tb); list.appendChild(tbl);
  tbl.querySelectorAll("th[data-k]").forEach(th=> th.addEventListener("click", ()=>{
    const k = th.dataset.k;
    if(sortKey===k) sortDir *= -1; else { sortKey = k; sortDir = (k==="date"||k==="amount") ? -1 : 1; }
    historyPage=1; renderHistory();
  }));
  tbl.querySelectorAll("th[data-k]").forEach(th=>th.addEventListener("keydown",e=>{if(e.key==="Enter" || e.key===" "){e.preventDefault();th.click();}}));
  wireRowActions(list);
}
wideMQ.addEventListener("change", renderHistory);

document.addEventListener("keydown", e=>{
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  if(e.key === "Escape"){
    if($("categoryActionSave").disabled) return;
    if(!$("currencyConfirmOverlay").classList.contains("hidden")) cancelCurrencyChange();
    document.querySelectorAll(".modal-overlay").forEach(o=>{ if(o.id!=="recoveryOverlay") o.classList.add("hidden"); });
    $("acctMenu").classList.add("hidden"); syncAccountMenu();
    return;
  }
  const tag = (e.target.tagName||"").toLowerCase();
  if(["input","textarea","select"].includes(tag) || $("appScreen").style.display==="none") return;
  if(document.querySelector(".modal-overlay:not(.hidden)")) return;
  if(e.key==="n" || e.key==="N"){ e.preventDefault(); showView("add"); setTimeout(()=>$("amount").focus(),0); }
  else if(e.key==="/"){ e.preventDefault(); showView("history"); setTimeout(()=>$("fSearch").focus(),0); }
});


// Period and history controls. All values are derived from existing transactions.
$("periodMonth").value = selectedMonth;
$("periodMonth").addEventListener("change", e=>{ selectedMonth=e.target.value; render(); });
$("allTimeBtn").addEventListener("click", ()=>{ selectedMonth=""; $("periodMonth").value=""; render(); });
$("clearFilters").addEventListener("click", ()=>{ ["fSearch","fType","fCategory","fFrom","fTo"].forEach(id=>$(id).value=""); historyPage=1; renderHistory(); });
let noticeTimer;
function notify(message, isError=false){
  const notice=$("appNotice"); notice.textContent=message;
  notice.classList.toggle("is-error",isError); notice.classList.remove("hidden");
  clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>notice.classList.add("hidden"),6500);
}


// Dedicated entry page and sidebar preferences.
$("topAdd").addEventListener("click", ()=>showView("add"));
$("cancelEntry").addEventListener("click", ()=>showView("dash"));
$("brandHome").addEventListener("click", e=>{e.preventDefault();showView("dash");});
$("sidebarSettings").addEventListener("click", ()=>$("openSettings").click());
$("prevPage").addEventListener("click", ()=>{historyPage=Math.max(1,historyPage-1);renderHistory();});
$("nextPage").addEventListener("click", ()=>{historyPage++;renderHistory();});
$("pageSize").addEventListener("change", ()=>{historyPage=1;renderHistory();});
$("exportFiltered").addEventListener("click", ()=>{
  const cell=value=>{let s=String(value??"");if(/^[\s\u0000-\u001f]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const rows=filteredData();
  const csv=[["date","type","category","amount","note"],...rows.map(t=>[t.date,t.type,t.category,t.amount,t.note])].map(row=>row.map(cell).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="ledger-filtered.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

// Account identity: full name in the menu, first name in the topbar.
function updateAccountIdentity(user){
  const savedHidden=user.user_metadata?.ledger_hidden_defaults || {};
  hiddenDefaults={expense:Array.isArray(savedHidden.expense)?savedHidden.expense:[],income:Array.isArray(savedHidden.income)?savedHidden.income:[]};
  const fullName=(user.user_metadata?.full_name || user.user_metadata?.name || "").trim();
  const fallback=user.email?.split("@")[0] || "Account";
  const name=fullName || fallback;
  const firstName=name.split(/\s+/)[0];
  const initials=fullName ? fullName.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase() : firstName[0].toUpperCase();
  $("accountFirstName").textContent=firstName;
  $("accountInitial").textContent=initials;
  $("menuInitial").textContent=initials;
  $("menuName").textContent=name;
  $("userEmail").textContent=user.email || "";
  $("profileInitial").textContent=initials;
  $("profileDisplayName").textContent=name;
  $("profileDisplayEmail").textContent=user.email || "";
}
function syncAccountMenu(){ $("avatarBtn").setAttribute("aria-expanded",String(!$("acctMenu").classList.contains("hidden"))); }
$("profileDismiss").addEventListener("click", ()=>$("profileOverlay").classList.add("hidden"));
$("profileOverlay").addEventListener("click", e=>{if(e.target===$("profileOverlay")) $("profileOverlay").classList.add("hidden");});

// Preferences dismiss controls and keyboard-friendly category input.
$("settingsDismiss").addEventListener("click", ()=>$("settingsOverlay").classList.add("hidden"));
$("settingsOverlay").addEventListener("click", e=>{if(e.target===$("settingsOverlay")) $("settingsOverlay").classList.add("hidden");});
$("newCatName").addEventListener("keydown", e=>{if(e.key==="Enter"){e.preventDefault();$("addCatBtn").click();}});

// Category changes are performed atomically by category-management.sql.
function openCategoryAction(action,t,name){
  categoryOperation={action,type:t,name};
  const count=data.filter(entry=>entry.type===t && entry.category===name).length;
  $("categoryActionTitle").textContent=action==="rename"?"Rename category":"Delete category";
  $("categoryActionDescription").textContent=action==="rename"
    ? `Rename “${name}”. Existing entries will use the new name.`
    : `Remove “${name}”. Transactions are kept; entries in this category must be moved to another category.`;
  $("categoryAffected").textContent=`${count} ${count===1?"entry uses":"entries use"} this category.`;
  $("categoryRenameField").classList.toggle("hidden",action!=="rename");
  $("categoryReplacementField").classList.toggle("hidden",action!=="delete");
  $("categoryNewName").value=name;
  const select=$("categoryReplacement");select.innerHTML='<option value="">Choose replacement category</option>';
  availableCategories(t).filter(c=>c!==name).forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;select.appendChild(o);});
  select.required=action==="delete" && count>0;
  $("categoryNewName").required=action==="rename";
  $("categoryActionSave").textContent=action==="rename"?"Save name":"Delete category";
  $("categoryActionErr").textContent="";
  $("categoryActionOverlay").classList.remove("hidden");
}
$("categoryActionCancel").addEventListener("click",()=>$("categoryActionOverlay").classList.add("hidden"));
$("categoryActionForm").addEventListener("submit",async e=>{
  e.preventDefault(); if(!categoryOperation) return;
  const operation={...categoryOperation};
  const target=operation.action==="rename" ? $("categoryNewName").value.trim() : $("categoryReplacement").value;
  if(operation.action==="rename" && (!target || target===operation.name)){$("categoryActionErr").textContent="Enter a different category name.";return;}
  if(operation.action==="rename" && availableCategories(operation.type).some(c=>c!==operation.name && c.toLowerCase()===target.toLowerCase())){$("categoryActionErr").textContent="That category name already exists.";return;}
  const save=$("categoryActionSave");save.disabled=true;$("categoryActionCancel").disabled=true;
  $("categoryActionErr").textContent="";
  try{
    if(pendingDelete) {clearTimeout(pendingDelete.timer);await finalizePendingDelete();}
    const { data:result,error }=await sb.rpc("manage_ledger_category",{p_action:operation.action,p_type:operation.type,p_name:operation.name,p_target:target||null});
    if(error){
      const missing=error.code==="PGRST202" || /could not find.*function/i.test(error.message||"");
      throw new Error(missing?"Category setup is needed: run category-management.sql in Supabase SQL Editor once.":error.message);
    }
    hiddenDefaults=result.hidden_defaults || {expense:[],income:[]};
    hiddenDefaults={expense:hiddenDefaults.expense||[],income:hiddenDefaults.income||[]};
    await sb.auth.refreshSession();
    await loadData();
    $("categoryActionOverlay").classList.add("hidden");
    notify(operation.action==="rename"?"Category and its entries updated.":"Category deleted. Transactions kept.");
  }catch(error){$("categoryActionErr").textContent=error.message || "Could not update category. Please try again.";}
  finally{save.disabled=false;$("categoryActionCancel").disabled=false;}
});
