const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const D = () => Store.data;

const TIERS = ["A", "B", "C", "D"];
const ALL_CATS = "_all";
const PAGE_SIZE = 60;
const CONTACT_STATUS = { unverified: "غير مؤكد", official: "مؤكد من مصدر رسمي", called: "تم الاتصال به", invalid: "إيميل غير صالح" };
const SITE_CHECK = { read: "تم فحص الموقع الرسمي", blocked: "الموقع يمنع الفحص الآلي", dead: "الموقع لا يعمل", none: "لا يوجد موقع للفحص" };
const STATUS_CLASS = { official: "ok", called: "ok", unverified: "warn", invalid: "bad" };
const hasOfficial = (e) => e.contacts.some((c) => c.status === "official" || c.status === "called");
const tierBadge = (e) => (TIERS.includes(e.tier) ? `<span class="tier tier-${e.tier.toLowerCase()}">${e.tier}</span>` : "");
const tierRank = (e) => (TIERS.includes(e.tier) ? TIERS.indexOf(e.tier) : TIERS.length);
const RENTAL_STATUS = ["عرض السعر : قيد التنفيذ", "عرض السعر : تم الارسال", "موعد اجتماع", "متابعة", "تواصل مكرر : لم يتم الرد", "سعر المتر : غير مناسب", "النشاط : غير مناسب", "البراند : غير مطابق للشروط"];
const RENTAL_LISTS = { active: "الطلبات الحالية", rejected: "المرفوض", done: "مكتمل" };
const rentalList = (x) => (x.decision === "rejected" ? "rejected" : x.done ? "done" : "active");
const state = {
  view: "directory",
  catId: null,
  search: "",
  tier: "", // فلتر قوة البراند
  verified: "", // فلتر التأكيد: yes | no
  limit: PAGE_SIZE, // عدد البطاقات المعروضة
  rentalList: "active",
  rentalStatus: "",
  rentalSearch: "",
  taskStatus: "open", // all | open | done
  taskEmp: "",
  taskType: "",
  users: null, // قائمة المستخدمين (للمدير)
  showHidden: false,
  showHiddenTasks: false,
  selected: new Set() // المهام المحددة في قائمة المهام
};

// ---------- helpers ----------
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

const syncLabel = () => (Store.mode === "supabase" ? t("☁️ متصل بقاعدة البيانات") : t("💾 محفوظ محلياً"));

async function commit(msg) {
  // المشاهد لا يحفظ: نعيد البيانات من السيرفر بدل إبقاء تعديل لن يُحفظ
  if (isViewer()) {
    toast(t("ليس لديك صلاحية التعديل"));
    try { await Store.reload(); } catch {}
    render();
    return;
  }
  render();
  // نافذة التفاصيل المفتوحة تُحدَّث بعد أي تغيير (إخفاء، إكمال مهمة…)
  const openEnt = detailsId && $("#modal").open && entById(detailsId);
  if (openEnt) entityDetails(openEnt);
  setSync(t("جاري الحفظ…"));
  try {
    await Store.save();
    setSync(syncLabel());
    if (msg) toast(msg);
  } catch (err) {
    console.error(err);
    if (sessionExpired(err)) return;
    setSync(t("⚠️ فشل الحفظ"));
    toast(t("فشل الحفظ: {err}", { err: authError(err) }));
  }
}

// ---------- الدخول والصلاحيات ----------
const VIEWS = { directory: "البراندات", tasks: "المهام", rentals: "طلبات التأجير", employees: "الموظفين", sources: "مصادر البيانات", settings: "البيانات" };
const ROLES = { admin: "مدير", employee: "موظف", viewer: "مشاهد فقط" };
const isAdmin = () => Store.mode !== "supabase" || Store.user?.role === "admin";
const isViewer = () => Store.mode === "supabase" && Store.user?.role === "viewer";
const canAccess = (view) => Store.mode !== "supabase" || !!Store.user?.access?.includes(view);

const AUTH_ERRORS = {
  invalid_login: "اسم المستخدم أو كلمة السر غير صحيحة",
  locked: "تم قفل الحساب مؤقتاً بسبب محاولات خاطئة. حاول بعد 15 دقيقة",
  forbidden: "ليس لديك صلاحية لهذا الإجراء",
  last_admin: "يجب أن يبقى مدير نشط واحد على الأقل",
  name_taken: "هذا الاسم مستخدم بالفعل",
  name_required: "أدخل الاسم",
  weak_password: "كلمة السر يجب أن تكون 4 أحرف على الأقل",
  cannot_delete_self: "لا يمكنك حذف حسابك أثناء استخدامه"
};
const authError = (err) => {
  const m = err.message || String(err);
  const code = Object.keys(AUTH_ERRORS).find((k) => m.includes(k));
  return code ? t(AUTH_ERRORS[code]) : m;
};

// انتهت الجلسة أو أُوقف الحساب: نعود لشاشة الدخول
function sessionExpired(err) {
  if (!String(err.message || err).includes("not_authenticated")) return false;
  Store.logout().then(() => { render(); toast(t("انتهت الجلسة، سجّل الدخول مرة أخرى")); });
  return true;
}

function renderLogin() {
  return `
    <form id="loginForm" class="card login-card">
      <h2>${t("تسجيل الدخول")}</h2>
      <div class="field"><label for="loginName">${t("اسم المستخدم")}</label>
        <input class="input" id="loginName" name="username" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" required>
      </div>
      <div class="field"><label for="loginPass">${t("كلمة السر")}</label>
        <input class="input" id="loginPass" name="password" type="password" autocomplete="current-password" required dir="ltr">
      </div>
      <label class="check"><input type="checkbox" name="remember"> ${t("حفظ تسجيل الدخول لمدة 30 يوماً")}</label>
      <button class="btn primary">${t("دخول")}</button>
    </form>`;
}

function setSync(text) { $("#syncStatus").textContent = text; }

const empName = (id) => tv(D().employees.find((e) => e.id === id)?.name) || t("غير مسند");
const entById = (id) => D().entities.find((e) => e.id === id);
const catById = (id) => D().categories.find((c) => c.id === id);
const taskById = (id) => D().tasks.find((x) => x.id === id);
const rentalById = (id) => D().rentals.find((x) => x.id === id);
const openTasksFor = (pred) => D().tasks.filter((x) => !x.done && !x.hidden && pred(x)).length;

// صور Wix الأصلية كبيرة؛ نطلب نسخة صغيرة لتسريع التحميل على الجوال
const logoSrc = (u) =>
  /^https:\/\/static\.wixstatic\.com\/media\/[^/]+$/.test(u) ? `${u}/v1/fit/w_160,h_160,q_90/logo.png` : u;

function logoHtml(ent, cls = "logo") {
  const initial = esc((ent.name || "?").trim().charAt(0));
  return ent.logo
    ? `<img class="${cls}" src="${esc(logoSrc(ent.logo))}" alt="" loading="lazy" decoding="async" data-initial="${initial}">`
    : `<div class="${cls}">${initial}</div>`;
}

const safeUrl = (u) => (/^(https?:|mailto:|tel:)/i.test(u) ? u : "https://" + u);
const isImage = (f) => /^image\//.test(f.type || "");

function fileChip(f, attrs) {
  return isImage(f)
    ? `<button type="button" class="thumb" ${attrs} title="${esc(f.name)}"><img src="${esc(f.url)}" alt="" loading="lazy"></button>`
    : `<button type="button" class="file-chip" ${attrs}>📎 ${esc(f.name)}</button>`;
}

function openFile(f) {
  if (!f.url.startsWith("data:")) return window.open(f.url, "_blank", "noopener");
  // data URL لا يفتح مباشرة في تبويب جديد، لذلك نحوّله إلى Blob
  fetch(f.url).then((r) => r.blob()).then((b) => {
    const u = URL.createObjectURL(b);
    if (isImage(f) || b.type === "application/pdf") window.open(u, "_blank");
    else { const a = document.createElement("a"); a.href = u; a.download = f.name; a.click(); }
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  });
}

function empOptions(selected, withEmpty = true) {
  return (withEmpty ? `<option value="">${t("— غير مسند —")}</option>` : "") +
    D().employees.map((e) => `<option value="${e.id}" ${e.id === selected ? "selected" : ""}>${esc(tv(e.name))}</option>`).join("");
}

// ---------- render ----------
function render() {
  const loggedOut = Store.needsLogin();
  document.body.classList.toggle("logged-out", loggedOut);
  document.body.classList.toggle("read-only", isViewer());
  $("#userBox").hidden = $("#logoutBtn").hidden = loggedOut || Store.mode !== "supabase";
  if (loggedOut) { setSync(""); $("#app").innerHTML = renderLogin(); return; }
  if (Store.user) $("#userBox").textContent = `${tv(Store.user.name)} · ${t(ROLES[Store.user.role])}`;
  // إذا كان التبويب الحالي غير مسموح ننتقل لأول تبويب مسموح
  if (!canAccess(state.view)) state.view = Object.keys(VIEWS).find(canAccess) || "";
  $$(".tabs button").forEach((b) => { b.hidden = !canAccess(b.dataset.view); });
  if (!state.view) { $("#app").innerHTML = `<p class="empty">${t("لا يوجد قسم مسموح لك. تواصل مع المدير")}</p>`; return; }
  $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  const views = { directory: renderDirectory, tasks: renderTasks, rentals: renderRentals, employees: renderEmployees, sources: renderSources, settings: renderSettings };
  $("#app").innerHTML = views[state.view]();
  const selAll = $("#selAll");
  if (selAll) selAll.indeterminate = selAll.dataset.partial === "1";
}

// البنود المخفية (تصنيف أو شركة/براند) لا تظهر إلا عند تفعيل "إظهار المخفي"
const isVisible = (x) => state.showHidden || !x.hidden;
const entVisible = (e) => isVisible(e) && isVisible(catById(e.categoryId) || {});

function renderDirectory() {
  const hiddenCount = D().categories.filter((c) => c.hidden).length + D().entities.filter((e) => e.hidden).length;
  if (!hiddenCount) state.showHidden = false;
  const allCats = D().categories;
  const cats = allCats.filter(isVisible);
  if (!cats.find((c) => c.id === state.catId)) state.catId = ALL_CATS;
  const q = state.search.trim().toLowerCase();
  const verOk = (e) => !state.verified || hasOfficial(e) === (state.verified === "yes");
  const tierOk = (e) => verOk(e) && (!state.tier || (state.tier === "none" ? !TIERS.includes(e.tier) : e.tier === state.tier));

  const ents = (q
    ? D().entities.filter((e) =>
        [e.name, e.notes, ...e.contacts.flatMap((c) => [c.name, c.phone, c.email])].some((v) => String(v || "").toLowerCase().includes(q)))
    : D().entities.filter((e) => (state.catId === ALL_CATS || e.categoryId === state.catId))
  ).filter(entVisible).filter(tierOk);
  ents.sort((a, b) => tierRank(a) - tierRank(b) || (b.branches || 0) - (a.branches || 0));
  const shown = ents.slice(0, state.limit);

  const allItem = `
        <div class="cat-item ${state.catId === ALL_CATS && !q ? "active" : ""}" data-action="pick-cat" data-id="${ALL_CATS}">
          <span class="name">${t("كل البراندات")}</span>
          <span class="count">${D().entities.filter((e) => entVisible(e) && tierOk(e)).length}</span>
        </div>`;
  const sidebar = cats.length
    ? allItem + cats.map((c) => `
        <div class="cat-item ${c.id === state.catId && !q ? "active" : ""} ${c.hidden ? "is-hidden" : ""}" data-action="pick-cat" data-id="${c.id}">
          <span class="name">${esc(tv(c.name))}${c.hidden ? ` <small class="hidden-tag">(${t("مخفي")})</small>` : ""}</span>
          <span class="count">${D().entities.filter((e) => e.categoryId === c.id && isVisible(e) && tierOk(e)).length}</span>
          <button class="text-btn" data-action="toggle-hide-cat" data-id="${c.id}">${c.hidden ? t("إظهار") : t("إخفاء")}</button>
          <button class="icon-btn" data-action="edit-cat" data-id="${c.id}" title="${t("تعديل")}">✎</button>
          <button class="icon-btn danger" data-action="del-cat" data-id="${c.id}" title="${t("حذف")}">🗑</button>
        </div>`).join("")
    : `<p class="empty">${allCats.length ? t("كل التصنيفات مخفية") : t("لا توجد تصنيفات")}</p>`;

  const more = ents.length - shown.length;
  const cards = ents.length
    ? shown.map(entityCard).join("") + (more ? `<button class="btn more-btn" data-action="show-more">${t("عرض المزيد ({n})", { n: more })}</button>` : "")
    : `<p class="empty">${q ? t("لا توجد نتائج") : state.catId ? t("لا توجد شركات في هذا التصنيف") : t("أضف تصنيفاً أولاً")}</p>`;
  const hiddenBtn = hiddenCount
    ? `<button class="btn ${state.showHidden ? "active-toggle" : ""}" data-action="toggle-show-hidden">${state.showHidden ? t("إخفاء المخفي") : t("إظهار المخفي ({n})", { n: hiddenCount })}</button>`
    : "";

  return `
    <div class="toolbar">
      <input class="input" id="search" type="search" enterkeyhint="search" autocomplete="off" placeholder="${t("🔍 بحث بالاسم أو الرقم أو الإيميل…")}" value="${esc(state.search)}" style="flex:1;min-width:200px">
      ${hiddenBtn}
      <button class="btn" data-action="new-cat">${t("+ تصنيف")}</button>
      <button class="btn primary" data-action="new-ent">${t("+ براند")}</button>
    </div>
    <div class="tier-filter" role="group" aria-label="${t("قوة البراند")}">
      <span class="task-meta">${t("قوة البراند")}</span>
      <button class="${state.tier ? "" : "active"}" data-action="filter-tier" data-v="">${t("الكل")}</button>
      ${TIERS.map((x) => `<button class="tier-chip tier-${x.toLowerCase()} ${state.tier === x ? "active" : ""}" data-action="filter-tier" data-v="${x}">${x} <small>${D().entities.filter((e) => e.tier === x && entVisible(e)).length}</small></button>`).join("")}
      <button class="${state.tier === "none" ? "active" : ""}" data-action="filter-tier" data-v="none">${t("بدون تصنيف")} <small>${D().entities.filter((e) => !TIERS.includes(e.tier) && entVisible(e)).length}</small></button>
    </div>
    <div class="tier-filter" role="group" aria-label="${t("التأكيد")}">
      <span class="task-meta">${t("التأكيد")}</span>
      ${[["", "الكل"], ["yes", "فيه تواصل مؤكد"], ["no", "غير مؤكد"]].map(([k, v]) => `<button class="${state.verified === k ? "active" : ""}" data-action="filter-verified" data-v="${k}">${t(v)}</button>`).join("")}
    </div>
    <div class="layout">
      <aside class="sidebar">${sidebar}</aside>
      <section class="grid">${cards}</section>
    </div>`;
}

function entityCard(e) {
  const cat = catById(e.categoryId);
  const open = openTasksFor((x) => x.entityId === e.id);
  const extra = e.contacts.length - 3;
  const contacts = e.contacts.length
    ? `<ul class="contacts">${e.contacts.slice(0, 3).map((c) => `
        <li>
          <b>${esc(tv(c.name) || "—")}</b>
          ${c.phone ? `<span>📞 <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></span>` : ""}
          ${c.email ? `<span>✉️ <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></span>` : ""}
        </li>`).join("")}${extra > 0 ? `<li class="task-meta">${t("+{n} أخرى", { n: extra })}</li>` : ""}</ul>`
    : `<p class="task-meta" style="margin:0 0 10px">${t("لا توجد بيانات تواصل")}</p>`;
  return `
    <article class="card clickable ${e.hidden ? "is-hidden" : ""}" data-action="open-ent" data-id="${e.id}" tabindex="0" role="button" aria-label="${esc(e.name)}">
      ${e.hidden ? `<div class="hidden-tag">${t("مخفي")}</div>` : ""}
      <div class="ent-head">
        ${logoHtml(e)}
        <div class="ent-title">
          <strong>${tierBadge(e)} ${esc(e.name)}</strong>
          ${hasOfficial(e) ? `<span class="badge ok">${t("فيه تواصل مؤكد")}</span>` : ""}
          <small>${esc(tv(cat?.name || ""))}</small>
        </div>
        ${open ? `<span class="badge warn">${t("{n} مهام", { n: open })}</span>` : ""}
      </div>
      ${contacts}
      ${e.notes ? `<p class="notes">📝 ${esc(tv(e.notes))}</p>` : ""}
      ${(e.links || []).length ? `<div class="links">${e.links.slice(0, 3).map((l) =>
        `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">🔗 ${esc(tv(l.title) || l.url)}</a>`).join("")}</div>` : ""}
      ${(e.files || []).length ? `<div class="files">${e.files.map((f, i) => fileChip(f, `data-action="open-file" data-ent="${e.id}" data-i="${i}"`)).join("")}</div>` : ""}
      <div class="card-actions">
        <button class="btn sm primary" data-action="new-task" data-ent="${e.id}">${t("+ مهمة")}</button>
        <button class="btn sm" data-action="edit-ent" data-id="${e.id}">${t("تعديل")}</button>
        <button class="btn sm" data-action="toggle-hide-ent" data-id="${e.id}">${e.hidden ? t("إظهار") : t("إخفاء")}</button>
        <button class="btn sm danger" data-action="del-ent" data-id="${e.id}">${t("حذف")}</button>
      </div>
    </article>`;
}

// نافذة تفاصيل الشركة / البراند عند الضغط على البطاقة
function entityDetails(e) {
  const cat = catById(e.categoryId);
  const tasks = D().tasks.filter((x) => x.entityId === e.id && !x.hidden).sort((a, b) => a.done - b.done || b.createdAt - a.createdAt);
  const waNumber = (p) => p.replace(/\D/g, "").replace(/^0(?=5)/, "966");
  const section = (title, body) => `<section class="detail-section"><h4>${title}</h4>${body}</section>`;

  const contacts = e.contacts.length
    ? `<div class="detail-contacts">${e.contacts.map((c) => `
        <div class="detail-contact">
          <b>${esc(tv(c.name) || "—")}</b>
          ${CONTACT_STATUS[c.status] ? `<span class="badge ${STATUS_CLASS[c.status]}">${t(CONTACT_STATUS[c.status])}</span>` : ""}
          ${c.evidence ? `<a class="task-meta" href="${esc(safeUrl(c.evidence))}" target="_blank" rel="noopener">${t("الدليل")}</a>` : ""}
          ${c.phone ? `<div class="detail-line"><span dir="ltr">${esc(c.phone)}</span>
            <span class="detail-actions">
              <a class="btn sm" href="tel:${esc(c.phone)}">${t("اتصال")}</a>
              ${/^(\+?966|05)/.test(c.phone.replace(/\s/g, "")) ? `<a class="btn sm" href="https://wa.me/${waNumber(c.phone)}" target="_blank" rel="noopener">${t("واتساب")}</a>` : ""}
              <button type="button" class="btn sm" data-action="copy" data-v="${esc(c.phone)}">${t("نسخ")}</button>
            </span></div>` : ""}
          ${c.email ? `<div class="detail-line"><span dir="ltr">${esc(c.email)}</span>
            <span class="detail-actions">
              <a class="btn sm" href="mailto:${esc(c.email)}">${t("إيميل")}</a>
              <button type="button" class="btn sm" data-action="copy" data-v="${esc(c.email)}">${t("نسخ")}</button>
            </span></div>` : ""}
        </div>`).join("")}</div>`
    : `<p class="task-meta">${t("لا توجد بيانات تواصل")}</p>`;

  const links = (e.links || []).length
    ? `<div class="links">${e.links.map((l) => `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">🔗 ${esc(tv(l.title) || l.url)}${l.status === "dead" ? ` (${t("الموقع لا يعمل")})` : ""}</a>`).join("")}</div>`
    : `<p class="task-meta">${t("لا توجد روابط")}</p>`;

  const files = (e.files || []).length
    ? `<div class="files">${e.files.map((f, i) => fileChip(f, `data-action="open-file" data-ent="${e.id}" data-i="${i}"`)).join("")}</div>`
    : `<p class="task-meta">${t("لا توجد ملفات")}</p>`;

  const taskList = tasks.length
    ? `<div class="detail-tasks">${tasks.map((x) => `
        <div class="detail-task ${x.done ? "done" : ""}">
          <input type="checkbox" data-action="toggle-task" data-id="${x.id}" ${x.done ? "checked" : ""} title="${t("مكتمل / غير مكتمل")}">
          <span class="task-title">${esc(tv(x.title || x.type))}</span>
          <span class="badge">${esc(empName(x.employeeId))}</span>
        </div>`).join("")}</div>`
    : `<p class="task-meta">${t("لا توجد مهام")}</p>`;

  openModal(`
    <div class="detail-head">
      ${logoHtml(e, "logo detail-logo")}
      <div class="ent-title">
        <h3>${tierBadge(e)} ${esc(e.name)}</h3>
        <small>${esc(tv(cat?.name || ""))}${e.branches ? " · " + t("فروع تقريبية: {n}", { n: e.branches }) : ""}${e.hidden ? " · " + t("مخفي") : ""}</small>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" title="${t("إغلاق")}" aria-label="${t("إغلاق")}">✕</button>
    </div>
    ${section(t("بيانات التواصل"), (e.check ? `<p class="task-meta">${t(SITE_CHECK[e.check.site])} · ${esc(e.check.at)}</p>` : "") + contacts)}
    ${e.notes ? section(t("ملاحظات"), `<p class="notes">${esc(tv(e.notes))}</p>`) : ""}
    ${section(t("روابط مرجعية"), links)}
    ${section(t("ملفات وصور"), files)}
    ${section(t("المهام ({n} غير مكتملة)", { n: tasks.filter((x) => !x.done).length }), taskList)}
    <div class="modal-actions">
      <button type="button" class="btn" data-action="edit-ent" data-id="${e.id}">${t("تعديل")}</button>
      <button type="button" class="btn" data-action="toggle-hide-ent" data-id="${e.id}">${e.hidden ? t("إظهار") : t("إخفاء")}</button>
      <button type="button" class="btn primary" data-action="new-task" data-ent="${e.id}">${t("+ مهمة")}</button>
    </div>`, () => {});
  detailsId = e.id;
  $("#modalForm [data-action=close-modal]").focus({ preventScroll: true });
}
let detailsId = null;

// المهام الظاهرة حالياً حسب الفلاتر (وهي التي يطبق عليها "تحديد الكل")
function filteredTasks() {
  return D().tasks
    .filter((x) => state.showHiddenTasks || !x.hidden)
    .filter((x) => state.taskStatus === "all" || (state.taskStatus === "done" ? x.done : !x.done))
    .filter((x) => !state.taskEmp || (state.taskEmp === "_none" ? !x.employeeId : x.employeeId === state.taskEmp))
    .filter((x) => !state.taskType || x.type === state.taskType)
    .sort((a, b) => a.done - b.done || b.createdAt - a.createdAt);
}

function renderTasks() {
  const all = D().tasks.filter((x) => !x.hidden);
  const hiddenCount = D().tasks.length - all.length;
  if (!hiddenCount) state.showHiddenTasks = false;
  const list = filteredTasks();
  // نحتفظ فقط بالتحديد للمهام الظاهرة
  const ids = new Set(list.map((x) => x.id));
  state.selected.forEach((id) => { if (!ids.has(id)) state.selected.delete(id); });
  const nSel = state.selected.size;

  const stats = [
    ["", t("الكل"), all.filter((x) => !x.done).length],
    ...D().employees.map((e) => [e.id, tv(e.name), openTasksFor((x) => x.employeeId === e.id)])
  ];
  const types = [...new Set([...D().taskTypes, ...D().tasks.map((x) => x.type).filter(Boolean)])];

  const rows = list.length
    ? list.map((x) => {
        const ent = entById(x.entityId);
        const sel = state.selected.has(x.id);
        return `
        <div class="task ${x.done ? "done" : ""} ${sel ? "selected" : ""} ${x.hidden ? "is-hidden" : ""}">
          <input type="checkbox" class="sel" data-action="select-task" data-id="${x.id}" ${sel ? "checked" : ""} aria-label="${t("تحديد")}">
          <div>
            <div class="task-title">${esc(tv(x.title || x.type))}</div>
            <div class="task-meta">
              <button type="button" class="badge status-btn ${x.done ? "ok" : "warn"}" data-action="toggle-done" data-id="${x.id}" title="${t("اضغط للتغيير")}">${x.done ? t("مكتمل") : t("غير مكتمل")}</button>
              ${x.type ? `<span class="badge">${esc(tv(x.type))}</span>` : ""}
              ${x.hidden ? `<span class="badge">${t("مخفي")}</span>` : ""}
              ${ent ? `<button type="button" class="link-btn" data-action="open-ent" data-id="${ent.id}">🏢 ${esc(ent.name)}</button>` : ""}
              ${x.notes ? `<span>📝 ${esc(x.notes)}</span>` : ""}
            </div>
          </div>
          <select class="input" data-action="assign-task" data-id="${x.id}" title="${t("إسناد إلى")}">${empOptions(x.employeeId)}</select>
          <div class="row" style="flex:0">
            <button class="icon-btn" data-action="edit-task" data-id="${x.id}" title="${t("تعديل")}">✎</button>
            <button class="icon-btn danger" data-action="del-task" data-id="${x.id}" title="${t("حذف")}">🗑</button>
          </div>
        </div>`;
      }).join("")
    : `<p class="empty">${t("لا توجد مهام")}</p>`;

  const anyHiddenSel = [...state.selected].some((id) => taskById(id)?.hidden);
  const bulkBar = nSel ? `
    <div class="bulk-bar">
      <b>${t("تم تحديد {n}", { n: nSel })}</b>
      <button class="btn sm" data-action="bulk" data-op="done">${t("مكتمل")}</button>
      <button class="btn sm" data-action="bulk" data-op="open">${t("غير مكتمل")}</button>
      <select class="input sm" id="bulkAssign" aria-label="${t("إسناد إلى")}">
        <option value="">${t("إسناد إلى…")}</option>
        <option value="_none">${t("— غير مسند —")}</option>
        ${D().employees.map((e) => `<option value="${e.id}">${esc(tv(e.name))}</option>`).join("")}
      </select>
      <button class="btn sm" data-action="bulk" data-op="${anyHiddenSel ? "show" : "hide"}">${anyHiddenSel ? t("إظهار") : t("إخفاء")}</button>
      <button class="btn sm danger" data-action="bulk" data-op="delete">${t("حذف")}</button>
      <button class="btn sm" data-action="bulk" data-op="clear">${t("إلغاء التحديد")}</button>
    </div>` : "";

  return `
    <div class="toolbar">
      <h2>${t("قائمة المهام")}</h2>
      <span class="spacer"></span>
      ${hiddenCount ? `<button class="btn ${state.showHiddenTasks ? "active-toggle" : ""}" data-action="toggle-show-hidden-tasks">${state.showHiddenTasks ? t("إخفاء المخفي") : t("إظهار المخفي ({n})", { n: hiddenCount })}</button>` : ""}
      <button class="btn primary" data-action="new-task">${t("+ مهمة جديدة")}</button>
    </div>
    <div class="stats">
      ${stats.map(([id, name, n]) => `<div class="stat ${state.taskEmp === id ? "active" : ""}" data-action="filter-emp" data-id="${id}">${esc(name)}<b>${n}</b></div>`).join("")}
    </div>
    <div class="toolbar">
      <div class="seg">
        ${[["open", "غير مكتمل"], ["done", "مكتمل"], ["all", "الكل"]].map(([k, v]) => `<button data-action="filter-status" data-v="${k}" class="${state.taskStatus === k ? "active" : ""}">${t(v)}</button>`).join("")}
      </div>
      <select class="input" id="fEmp">
        <option value="">${t("كل الموظفين")}</option>
        <option value="_none" ${state.taskEmp === "_none" ? "selected" : ""}>${t("غير مسند")}</option>
        ${D().employees.map((e) => `<option value="${e.id}" ${state.taskEmp === e.id ? "selected" : ""}>${esc(tv(e.name))}</option>`).join("")}
      </select>
      <select class="input" id="fType">
        <option value="">${t("كل الأنواع")}</option>
        ${types.map((x) => `<option value="${esc(x)}" ${state.taskType === x ? "selected" : ""}>${esc(tv(x))}</option>`).join("")}
      </select>
    </div>
    ${list.length ? `
    <div class="select-row">
      <label class="select-all">
        <input type="checkbox" id="selAll" data-action="select-all" ${nSel && nSel === list.length ? "checked" : ""} data-partial="${nSel && nSel < list.length ? 1 : 0}">
        ${t("تحديد الكل ({n})", { n: list.length })}
      </label>
    </div>` : ""}
    ${bulkBar}
    <div class="task-list">${rows}</div>`;
}

function statusOptions(selected) {
  // حالة قديمة غير موجودة في القائمة تبقى ظاهرة حتى لا تضيع
  const list = selected && !RENTAL_STATUS.includes(selected) ? [selected, ...RENTAL_STATUS] : RENTAL_STATUS;
  return `<option value="">${t("— بدون حالة —")}</option>` +
    list.map((x) => `<option value="${esc(x)}" ${x === selected ? "selected" : ""}>${esc(tv(x))}</option>`).join("");
}

function rentalRows() {
  const q = state.rentalSearch.trim().toLowerCase();
  const list = (D().rentals || [])
    .filter((x) => rentalList(x) === state.rentalList)
    .filter((x) => !state.rentalStatus || x.status === state.rentalStatus)
    .filter((x) => !q || [x.brandName, x.area, x.reviews].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!list.length) return `<p class="empty">${t("لا توجد طلبات")}</p>`;
  return list.map((x) => {
    const ent = entById(x.entityId);
    const where = rentalList(x);
    return `
      <article class="card rental">
        <div class="ent-head">
          ${logoHtml(ent || { name: x.brandName })}
          <div class="ent-title">
            ${ent ? `<strong>${tierBadge(ent)} <button type="button" class="link-btn" data-action="open-ent" data-id="${ent.id}">${esc(x.brandName)}</button></strong>` : `<strong>${esc(x.brandName)}</strong>`}
            ${x.area ? `<small>${t("المساحة")}: <span dir="ltr">${esc(x.area)}</span></small>` : ""}
          </div>
          ${x.decision === "accepted" ? `<span class="badge ok">${t("مقبول")}</span>` : x.decision === "rejected" ? `<span class="badge bad">${t("مرفوض")}</span>` : ""}
        </div>
        ${(x.links || []).length ? `<div class="links">${x.links.map((l) => `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">🔗 ${esc(tv(l.title) || l.url)}</a>`).join("")}</div>` : ""}
        ${x.reviews ? `<div class="rental-reviews"><b>${t("التقييمات")}</b><p>${esc(x.reviews)}</p></div>` : ""}
        <div class="field"><label>${t("الحالة")}</label>
          <select class="input" data-action="rental-status" data-id="${x.id}">${statusOptions(x.status)}</select>
        </div>
        <div class="card-actions">
          ${where === "active" ? `
            <button class="btn sm primary" data-action="rental-accept" data-id="${x.id}" ${x.decision === "accepted" ? "disabled" : ""}>${t("قبول")}</button>
            <button class="btn sm danger" data-action="rental-reject" data-id="${x.id}">${t("رفض")}</button>
            <button class="btn sm" data-action="rental-done" data-id="${x.id}">${t("مكتمل")}</button>` : `
            <button class="btn sm" data-action="rental-restore" data-id="${x.id}">${t("إرجاع إلى الطلبات الحالية")}</button>`}
          <button class="btn sm" data-action="edit-rental" data-id="${x.id}">${t("تعديل")}</button>
          <button class="btn sm danger" data-action="del-rental" data-id="${x.id}">${t("حذف")}</button>
        </div>
      </article>`;
  }).join("");
}

function renderRentals() {
  const all = D().rentals || [];
  const count = (k) => all.filter((x) => rentalList(x) === k).length;
  return `
    <div class="toolbar">
      <h2>${t("طلبات التأجير")}</h2>
      <span class="spacer"></span>
      <button class="btn primary" data-action="new-rental">${t("+ طلب تأجير")}</button>
    </div>
    <div class="stats">
      ${Object.entries(RENTAL_LISTS).map(([k, v]) => `<div class="stat ${state.rentalList === k ? "active" : ""}" data-action="rental-list" data-v="${k}" role="button" tabindex="0">${t(v)}<b>${count(k)}</b></div>`).join("")}
    </div>
    <div class="toolbar">
      <input class="input" id="rentalSearch" type="search" autocomplete="off" placeholder="${t("🔍 بحث في طلبات التأجير…")}" value="${esc(state.rentalSearch)}" style="flex:1;min-width:200px">
      <select class="input" id="fRentalStatus" aria-label="${t("الحالة")}">
        <option value="">${t("كل الحالات")}</option>
        ${RENTAL_STATUS.map((x) => `<option value="${esc(x)}" ${state.rentalStatus === x ? "selected" : ""}>${esc(tv(x))}</option>`).join("")}
      </select>
    </div>
    <div class="rental-list">${rentalRows()}</div>`;
}

function rentalModal(item) {
  const x = item || { brandName: "", area: "", links: [], reviews: "", status: "" };
  openModal(`
    <h3>${item ? t("تعديل طلب تأجير") : t("طلب تأجير جديد")}</h3>
    <div class="field"><label>${t("اسم البراند")}</label>
      <input class="input" name="brandName" list="brandNames" value="${esc(x.brandName)}" autocomplete="off" required>
      <datalist id="brandNames">${D().entities.map((e) => `<option value="${esc(e.name)}"></option>`).join("")}</datalist>
    </div>
    <div class="field"><label>${t("المساحة")}</label><input class="input" name="area" value="${esc(x.area)}" placeholder="${t("مثال: 250 م²")}"></div>
    <div class="field"><label>${t("الحالة")}</label><select class="input" name="status">${statusOptions(x.status)}</select></div>
    <div class="field">
      <label>${t("روابط")}</label>
      <div id="links" style="display:grid;gap:6px">${(x.links || []).map(linkRow).join("")}</div>
      <div><button type="button" class="btn sm" data-action="add-link">${t("+ رابط")}</button></div>
    </div>
    <div class="field"><label>${t("التقييمات")}</label><textarea class="input" name="reviews" rows="5">${esc(x.reviews)}</textarea></div>
    ${modalActions()}`, (f) => {
    const brandName = f.brandName.value.trim();
    const data = {
      brandName,
      // ربط الطلب بالبراند إذا طابق الاسم سجلاً في القائمة
      entityId: D().entities.find((e) => e.name === brandName)?.id || "",
      area: f.area.value.trim(),
      status: f.status.value,
      reviews: f.reviews.value.trim(),
      links: $$(".link-row", f)
        .map((r) => ({ title: r.querySelector("[data-k=title]").value.trim(), url: r.querySelector("[data-k=url]").value.trim() }))
        .filter((l) => l.url)
    };
    if (item) Object.assign(item, data);
    else D().rentals.push({ id: uid(), decision: "", done: false, createdAt: Date.now(), ...data });
    commit(t("تم الحفظ"));
  });
}

function renderEmployees() {
  if (Store.mode === "supabase") return isAdmin() ? renderUsers() : renderEmployeesReadOnly();
  const emps = D().employees;
  return `
    <div class="toolbar">
      <h2>${t("الموظفين")}</h2>
      <span class="spacer"></span>
    </div>
    <form class="toolbar" id="addEmpForm" style="max-width:640px">
      <input class="input" name="name" placeholder="${t("اسم الموظف الجديد")}" style="flex:1" required>
      <button class="btn primary">${t("+ إضافة")}</button>
    </form>
    <div class="emp-list">
      ${emps.length ? emps.map((e, i) => `
        <div class="emp">
          <span class="order">${i + 1}</span>
          <input class="input" value="${esc(e.name)}" data-action="rename-emp" data-id="${e.id}">
          <span class="badge warn" title="${t("مهام غير مكتملة")}">${openTasksFor((x) => x.employeeId === e.id)}</span>
          <button class="icon-btn" data-action="move-emp" data-id="${e.id}" data-dir="-1" ${i === 0 ? "disabled" : ""} title="${t("أعلى")}">▲</button>
          <button class="icon-btn" data-action="move-emp" data-id="${e.id}" data-dir="1" ${i === emps.length - 1 ? "disabled" : ""} title="${t("أسفل")}">▼</button>
          <button class="icon-btn danger" data-action="del-emp" data-id="${e.id}" title="${t("حذف")}">🗑</button>
        </div>`).join("") : `<p class="empty">${t("لا يوجد موظفين")}</p>`}
    </div>`;
}

function renderEmployeesReadOnly() {
  return `
    <div class="toolbar"><h2>${t("الموظفين")}</h2></div>
    <div class="emp-list">
      ${D().employees.map((e) => `
        <div class="emp">
          <span style="flex:1">${esc(tv(e.name))}</span>
          <span class="badge warn" title="${t("مهام غير مكتملة")}">${openTasksFor((x) => x.employeeId === e.id)}</span>
        </div>`).join("")}
    </div>`;
}

const roleOptions = (sel) => Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${t(v)}</option>`).join("");
const accessBoxes = (list) => Object.entries(VIEWS).map(([k, v]) => `
  <label class="check"><input type="checkbox" data-access="${k}" ${list.includes(k) ? "checked" : ""}> ${t(v)}</label>`).join("");

// إدارة المستخدمين (للمدير): الاسم وكلمة السر والصلاحية والوصول
function renderUsers() {
  if (!state.users) {
    Store.listUsers().then((u) => { state.users = u; render(); }).catch((err) => { if (!sessionExpired(err)) toast(authError(err)); });
    return `<div class="toolbar"><h2>${t("الموظفين")}</h2></div><p class="empty">${t("جاري التحميل…")}</p>`;
  }
  const order = D().employees.map((e) => e.id);
  const users = [...state.users].sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
  return `
    <div class="toolbar"><h2>${t("الموظفين")}</h2></div>
    <form class="card user-add" id="addUserForm">
      <input class="input" name="name" placeholder="${t("اسم الموظف الجديد")}" required>
      <input class="input" name="password" type="password" placeholder="${t("كلمة السر")}" autocomplete="new-password" required dir="ltr">
      <select class="input" name="role">${roleOptions("employee")}</select>
      <button class="btn primary">${t("+ إضافة")}</button>
    </form>
    <div class="user-list">
      ${users.map((u, i) => `
        <div class="card user-row ${u.active ? "" : "is-hidden"}" data-id="${esc(u.id)}">
          <div class="user-fields">
            <div class="field"><label>${t("الاسم")}</label><input class="input" data-k="name" value="${esc(u.name)}"></div>
            <div class="field"><label>${t("كلمة سر جديدة (اتركها فارغة بدون تغيير)")}</label>
              <input class="input" data-k="password" type="password" autocomplete="new-password" dir="ltr"></div>
            <div class="field"><label>${t("الصلاحية")}</label><select class="input" data-k="role">${roleOptions(u.role)}</select></div>
          </div>
          <div class="field"><label>${t("الوصول إلى الأقسام")}</label><div class="access-list">${accessBoxes(u.access)}</div></div>
          <label class="check"><input type="checkbox" data-k="active" ${u.active ? "checked" : ""}> ${t("الحساب نشط")}</label>
          <div class="card-actions">
            <button type="button" class="btn sm primary" data-action="save-user">${t("حفظ")}</button>
            <button type="button" class="icon-btn" data-action="move-emp" data-id="${esc(u.id)}" data-dir="-1" ${i === 0 ? "disabled" : ""} title="${t("أعلى")}">▲</button>
            <button type="button" class="icon-btn" data-action="move-emp" data-id="${esc(u.id)}" data-dir="1" ${i === users.length - 1 ? "disabled" : ""} title="${t("أسفل")}">▼</button>
            <button type="button" class="btn sm danger" data-action="del-user" ${u.id === Store.user.id ? "disabled" : ""}>${t("حذف")}</button>
          </div>
        </div>`).join("")}
    </div>`;
}

const SOURCE_KIND = { free: "مصادر مجانية ومفتوحة", paid: "مصادر مدفوعة" };

function renderSources() {
  const card = (s) => `
    <article class="card source">
      <div class="ent-head">
        <div class="ent-title">
          <strong>${s.url ? `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(tv(s.name))} ↗</a>` : esc(tv(s.name))}</strong>
          ${s.role ? `<span class="badge">${esc(tv(s.role))}</span>` : ""}
        </div>
        <span class="badge ${s.kind === "free" ? "ok" : "warn"}">${esc(tv(s.price) || (s.kind === "free" ? t("مجاني") : t("مدفوع")))}</span>
      </div>
      <dl class="src-info">
        ${s.strength ? `<dt>${t("نقطة القوة")}</dt><dd>${esc(tv(s.strength))}</dd>` : ""}
        ${s.gulf ? `<dt>${t("تغطية الخليج")}</dt><dd>${esc(tv(s.gulf))}</dd>` : ""}
        ${s.notes ? `<dt>${t("ملاحظات")}</dt><dd>${esc(s.notes)}</dd>` : ""}
      </dl>
      <div class="card-actions">
        <button class="btn sm" data-action="edit-src" data-id="${s.id}">${t("تعديل")}</button>
        <button class="btn sm danger" data-action="del-src" data-id="${s.id}">${t("حذف")}</button>
      </div>
    </article>`;

  const sections = Object.entries(SOURCE_KIND).map(([k, label]) => {
    const list = D().sources.filter((s) => (s.kind || "paid") === k);
    return `
      <h3 class="section-title">${t(label)} <span class="count">(${list.length})</span></h3>
      <section class="grid">${list.length ? list.map(card).join("") : `<p class="empty">${t("لا توجد مصادر")}</p>`}</section>`;
  }).join("");

  return `
    <div class="toolbar">
      <h2>${t("مصادر بيانات التواصل")}</h2>
      <span class="spacer"></span>
      <button class="btn primary" data-action="new-src">${t("+ مصدر")}</button>
    </div>
    <div class="card tip">
      <b>${t("طريقة العمل المقترحة:")}</b>
      ${t("ابدأ بالمصادر المجانية (موقع البراند، حسابات التواصل، LinkedIn). إذا لم تجد الشخص المناسب، ابحث في Sales Navigator ثم اجلب الرقم والإيميل بإضافة Apollo أو Lusha، وأدخل البيانات في الشركة، ثم أسند مهمة التواصل للموظف.")}
      <div class="task-meta" style="margin-top:6px">${t("⚠️ الأسعار تقريبية، والتزم بنظام حماية البيانات الشخصية (PDPL) عند استخدام البيانات.")}</div>
    </div>
    ${sections}`;
}

function sourceModal(src) {
  const s = src || { kind: "free", name: "", url: "", role: "", strength: "", gulf: "", price: "", notes: "" };
  const fld = (name, label, extra = "") =>
    `<div class="field"><label>${label}</label><input class="input" name="${name}" value="${esc(s[name])}" ${extra}></div>`;
  openModal(`
    <h3>${src ? t("تعديل مصدر") : t("مصدر جديد")}</h3>
    ${fld("name", t("الاسم"), "required")}
    <div class="row">
      <div class="field"><label>${t("النوع")}</label>
        <select class="input" name="kind">
          <option value="free" ${s.kind === "free" ? "selected" : ""}>${t("مجاني / مفتوح")}</option>
          <option value="paid" ${s.kind !== "free" ? "selected" : ""}>${t("مدفوع")}</option>
        </select>
      </div>
      ${fld("price", t("السعر"))}
    </div>
    ${fld("url", t("الرابط"), 'dir="ltr" placeholder="https://…"')}
    ${fld("role", t("الاستخدام"), `placeholder="${t("مثال: جلب الرقم والإيميل")}"`)}
    ${fld("strength", t("نقطة القوة"))}
    ${fld("gulf", t("تغطية الخليج"))}
    <div class="field"><label>${t("ملاحظات")}</label><textarea class="input" name="notes" rows="2">${esc(s.notes)}</textarea></div>
    ${modalActions()}`, (f) => {
    const data = Object.fromEntries(["kind", "name", "price", "url", "role", "strength", "gulf", "notes"].map((k) => [k, f[k].value.trim()]));
    if (src) Object.assign(src, data);
    else D().sources.push({ id: uid(), ...data });
    commit(t("تم حفظ المصدر"));
  });
}

function renderSettings() {
  return `
    <div class="toolbar"><h2>${t("البيانات والنسخ الاحتياطي")}</h2></div>
    <div class="card" style="max-width:640px;display:grid;gap:12px">
      <div>${t("نوع قاعدة البيانات:")} <b>${Store.mode === "supabase" ? t("Supabase (مشتركة بين الجميع)") : t("محلية في هذا المتصفح")}</b></div>
      <div class="task-meta">
        ${t("{c} تصنيف · {e} شركة/براند · {m} موظف · {t} مهمة", { c: D().categories.length, e: D().entities.length, m: D().employees.length, t: D().tasks.length })}
      </div>
      <div class="field">
        <label>${t("أنواع المهام (سطر لكل نوع)")}</label>
        <textarea class="input" id="taskTypes" rows="4">${esc(D().taskTypes.join("\n"))}</textarea>
        <div><button class="btn sm" data-action="save-types">${t("حفظ الأنواع")}</button></div>
      </div>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn" data-action="export">${t("⬇️ تصدير JSON")}</button>
        <label class="btn" style="text-align:center">${t("⬆️ استيراد JSON")}<input type="file" id="importFile" accept=".json,application/json" hidden></label>
        ${Store.mode === "supabase" ? `<button class="btn" data-action="reload">${t("🔄 تحديث من السيرفر")}</button>` : ""}
      </div>
    </div>`;
}

// ---------- modals ----------
// المتصفحات القديمة (iOS أقل من 15.4 مثلاً) لا تدعم <dialog>، فنعرضه يدوياً
const nativeDialog = typeof HTMLDialogElement === "function" && "showModal" in HTMLDialogElement.prototype;

function closeModal() {
  const dlg = $("#modal");
  if (nativeDialog) dlg.close();
  else { dlg.removeAttribute("open"); $(".dialog-backdrop")?.remove(); }
  document.body.style.overflow = "";
  detailsId = null;
}

function openModal(html, onSubmit) {
  const dlg = $("#modal");
  const form = $("#modalForm");
  const wasOpen = dlg.open;
  detailsId = null;
  form.innerHTML = html;
  form.scrollTop = 0;
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const ok = await onSubmit(form);
    if (ok !== false) closeModal();
  };
  // إذا كانت النافذة مفتوحة (مثل فتح التعديل من نافذة التفاصيل) نستبدل محتواها فقط
  if (!wasOpen && nativeDialog) dlg.showModal();
  else if (!wasOpen) {
    dlg.classList.add("fallback");
    dlg.setAttribute("open", "");
    const bd = document.createElement("div");
    bd.className = "dialog-backdrop";
    bd.onclick = closeModal;
    document.body.appendChild(bd);
  }
  document.body.style.overflow = "hidden";
  // على أجهزة اللمس لا نفتح لوحة المفاتيح تلقائياً
  if (!matchMedia("(pointer: coarse)").matches) form.querySelector("input:not([type=hidden]), select, textarea")?.focus();
}

const modalActions = (label) => `
  <div class="modal-actions">
    <button type="button" class="btn" data-action="close-modal">${t("إلغاء")}</button>
    <button class="btn primary" value="ok">${label || t("حفظ")}</button>
  </div>`;

function categoryModal(cat) {
  const c = cat || { name: "" };
  openModal(`
    <h3>${cat ? t("تعديل تصنيف") : t("تصنيف جديد")}</h3>
    <div class="field"><label>${t("اسم التصنيف")}</label><input class="input" name="name" value="${esc(c.name)}" required></div>
    ${modalActions()}`, (f) => {
    const data = { name: f.name.value.trim(), type: "brand" };
    if (cat) Object.assign(cat, data);
    else { const n = { id: uid(), ...data }; D().categories.push(n); state.catId = n.id; }
    commit(t("تم حفظ التصنيف"));
  });
}

function contactRow(c = {}) {
  return `
    <div class="contact-row">
      <input class="input" data-k="name" placeholder="${t("الاسم")}" value="${esc(c.name)}">
      <input class="input" data-k="phone" placeholder="${t("الرقم")}" value="${esc(c.phone)}" type="tel" inputmode="tel" autocomplete="off" dir="ltr">
      <input class="input" data-k="email" placeholder="${t("الإيميل")}" value="${esc(c.email)}" type="email" inputmode="email" autocomplete="off" autocapitalize="off" dir="ltr">
      <select class="input" data-k="status" aria-label="${t("حالة التحقق")}">
        <option value="">${t("حالة التحقق")}</option>
        ${Object.entries(CONTACT_STATUS).map(([k, v]) => `<option value="${k}" ${c.status === k ? "selected" : ""}>${t(v)}</option>`).join("")}
      </select>
      <input type="hidden" data-k="source" value="${esc(c.source)}">
      <input type="hidden" data-k="evidence" value="${esc(c.evidence)}">
      <button type="button" class="icon-btn danger" data-action="rm-contact" title="${t("حذف")}">✕</button>
    </div>`;
}

function entityModal(ent) {
  if (!D().categories.length) return toast(t("أضف تصنيفاً أولاً"));
  const e = ent || { name: "", logo: "", notes: "", contacts: [{}], categoryId: catById(state.catId) ? state.catId : D().categories[0].id };
  const catOpts = D().categories.map((c) => `<option value="${c.id}" ${c.id === e.categoryId ? "selected" : ""}>${esc(tv(c.name))}</option>`).join("");

  openModal(`
    <h3>${ent ? t("تعديل شركة / براند") : t("إضافة شركة / براند")}</h3>
    <div class="field"><label>${t("الاسم")}</label><input class="input" name="name" value="${esc(e.name)}" required></div>
    <div class="field"><label>${t("التصنيف")}</label><select class="input" name="categoryId">${catOpts}</select></div>
    <div class="field"><label>${t("قوة البراند")}</label>
      <select class="input" name="tier">
        <option value="">${t("بدون تصنيف")}</option>
        ${TIERS.map((x) => `<option value="${x}" ${e.tier === x ? "selected" : ""}>${x}</option>`).join("")}
      </select>
    </div>
    <div class="field">
      <label>${t("الشعار (رابط صورة أو رفع ملف)")}</label>
      <div class="row">
        <div id="logoPrev" style="flex:0">${logoHtml(e, "logo logo-preview")}</div>
        <div style="display:grid;gap:6px">
          <input class="input" name="logo" placeholder="https://…" value="${esc(e.logo.startsWith("data:") ? "" : e.logo)}" dir="ltr">
          <input type="file" name="logoFile" accept="image/*">
        </div>
      </div>
      <input type="hidden" name="logoData" value="${esc(e.logo.startsWith("data:") ? e.logo : "")}">
    </div>
    <div class="field">
      <label>${t("بيانات التواصل")}</label>
      <div id="contacts" style="display:grid;gap:6px">${(e.contacts.length ? e.contacts : [{}]).map(contactRow).join("")}</div>
      <div><button type="button" class="btn sm" data-action="add-contact">${t("+ جهة تواصل")}</button></div>
    </div>
    <div class="field">
      <label>${t("روابط مرجعية")}</label>
      <div id="links" style="display:grid;gap:6px">${(e.links || []).map(linkRow).join("")}</div>
      <div><button type="button" class="btn sm" data-action="add-link">${t("+ رابط")}</button></div>
    </div>
    <div class="field">
      <label>${t("ملفات وصور")}</label>
      <div id="modalFiles" class="files"></div>
      <input type="file" name="attach" multiple>
    </div>
    <div class="field"><label>${t("ملاحظات")}</label><textarea class="input" name="notes" rows="3">${esc(e.notes)}</textarea></div>
    ${modalActions()}`, (f) => {
    if (uploading) { toast(t("انتظر حتى يكتمل رفع الملفات")); return false; }
    const links = $$(".link-row", f)
      .map((r) => ({ title: r.querySelector("[data-k=title]").value.trim(), url: r.querySelector("[data-k=url]").value.trim() }))
      .filter((l) => l.url);
    const contacts = $$(".contact-row", f)
      .map((r) => Object.fromEntries($$("[data-k]", r).map((i) => [i.dataset.k, i.value.trim()])))
      .filter((c) => c.name || c.phone || c.email);
    const data = {
      name: f.name.value.trim(),
      categoryId: f.categoryId.value,
      tier: f.tier.value,
      logo: f.logoData.value || f.logo.value.trim(),
      notes: f.notes.value.trim(),
      contacts,
      links,
      files: modalFiles
    };
    if (ent) Object.assign(ent, data);
    else D().entities.push({ id: uid(), ...data });
    const cat = catById(data.categoryId);
    state.catId = cat.id;
    commit(t("تم الحفظ"));
  });

  const f = $("#modalForm");
  modalFiles = [...(e.files || [])];
  renderModalFiles();
  f.attach.onchange = async () => {
    const list = [...f.attach.files];
    f.attach.value = "";
    uploading = true;
    for (const file of list) {
      try {
        // الصور تُصغّر قبل الحفظ لتقليل الحجم
        const src = isImage({ type: file.type }) && file.type !== "image/gif" && file.type !== "image/svg+xml"
          ? await imageToFile(file, 1400) : file;
        toast(t("جاري رفع {name}…", { name: file.name }));
        const url = await Store.uploadFile(src);
        modalFiles.push({ name: file.name, type: src.type, url });
        renderModalFiles();
      } catch (err) {
        toast(file.name + ": " + (err.message || err));
      }
    }
    uploading = false;
  };
  f.logoFile.onchange = async () => {
    const file = f.logoFile.files[0];
    if (!file) return;
    f.logoData.value = await resizeImage(file, 160);
    f.logo.value = "";
    $("#logoPrev").innerHTML = `<img class="logo logo-preview" src="${f.logoData.value}">`;
  };
  f.logo.oninput = () => {
    f.logoData.value = "";
    $("#logoPrev").innerHTML = f.logo.value ? `<img class="logo logo-preview" src="${esc(f.logo.value)}">` : logoHtml({ name: f.name.value }, "logo logo-preview");
  };
}

let modalFiles = [];
let uploading = false;

function renderModalFiles() {
  $("#modalFiles").innerHTML = modalFiles.map((file, i) => `
    <span class="file-item">
      ${fileChip(file, `data-action="open-modal-file" data-i="${i}"`)}
      <button type="button" class="icon-btn danger" data-action="rm-file" data-i="${i}" title="${t("إزالة")}">✕</button>
    </span>`).join("") || `<span class="task-meta">${t("لا توجد مرفقات")}</span>`;
}

function linkRow(l = {}) {
  return `
    <div class="link-row">
      <input class="input" data-k="title" placeholder="${t("العنوان (اختياري)")}" value="${esc(l.title)}">
      <input class="input" data-k="url" placeholder="https://…" value="${esc(l.url)}" inputmode="url" autocapitalize="off" autocorrect="off" dir="ltr">
      <button type="button" class="icon-btn danger" data-action="rm-link" title="${t("حذف")}">✕</button>
    </div>`;
}

async function imageToFile(file, max) {
  const dataUrl = await resizeImage(file, max, "image/jpeg");
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

function resizeImage(file, max, type = "image/png") {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      resolve(cv.toDataURL(type, 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function taskModal(task, presetEnt) {
  const x = task || { title: "", type: D().taskTypes[0] || "", entityId: presetEnt || "", employeeId: "", done: false, notes: "" };
  const entOpts = `<option value="">${t("— بدون —")}</option>` +
    D().entities.map((e) => `<option value="${e.id}" ${e.id === x.entityId ? "selected" : ""}>${esc(e.name)}</option>`).join("");
  openModal(`
    <h3>${task ? t("تعديل مهمة") : t("مهمة جديدة")}</h3>
    <div class="field"><label>${t("نوع المهمة")}</label>
      <input class="input" name="type" list="typesList" value="${esc(x.type)}" placeholder="${t("مثال: تواصل مباشر")}">
      <datalist id="typesList">${D().taskTypes.map((v) => `<option value="${esc(v)}">${esc(tv(v))}</option>`).join("")}</datalist>
    </div>
    <div class="field"><label>${t("الوصف")}</label><input class="input" name="title" value="${esc(x.title)}" placeholder="${t("مثال: تواصل مع أحمد وسارة")}"></div>
    <div class="row">
      <div class="field"><label>${t("الشركة / البراند")}</label><select class="input" name="entityId">${entOpts}</select></div>
      <div class="field"><label>${t("إسناد إلى")}</label><select class="input" name="employeeId">${empOptions(x.employeeId)}</select></div>
    </div>
    <div class="field"><label>${t("ملاحظات")}</label><textarea class="input" name="notes" rows="2">${esc(x.notes)}</textarea></div>
    <label class="row" style="justify-content:flex-start;gap:8px"><input type="checkbox" name="done" ${x.done ? "checked" : ""} style="flex:0"> ${t("مكتمل")}</label>
    ${modalActions()}`, (f) => {
    const data = {
      type: f.type.value.trim(),
      title: f.title.value.trim(),
      entityId: f.entityId.value,
      employeeId: f.employeeId.value,
      notes: f.notes.value.trim(),
      done: f.done.checked
    };
    if (!data.type && !data.title) { toast(t("أدخل نوع أو وصف المهمة")); return false; }
    if (task) Object.assign(task, data);
    else D().tasks.push({ id: uid(), createdAt: Date.now(), ...data });
    commit(t("تم حفظ المهمة"));
  });
}

// إجراءات جماعية على المهام المحددة
function bulkTasks(op, value) {
  const ids = new Set(state.selected);
  const sel = D().tasks.filter((x) => ids.has(x.id));
  if (!sel.length) return;
  const n = sel.length;
  if (op === "clear") { state.selected.clear(); return render(); }
  if (op === "delete") {
    if (!confirm(t("حذف {n} مهمة؟", { n }))) return;
    D().tasks = D().tasks.filter((x) => !ids.has(x.id));
    state.selected.clear();
    return commit(t("تم حذف {n} مهمة", { n }));
  }
  if (op === "done" || op === "open") sel.forEach((x) => { x.done = op === "done"; });
  if (op === "hide" || op === "show") sel.forEach((x) => { x.hidden = op === "hide"; });
  if (op === "assign") sel.forEach((x) => { x.employeeId = value; });
  state.selected.clear();
  const msg = {
    done: t("تم تعليم {n} مهمة كمكتملة", { n }),
    open: t("تم تعليم {n} مهمة كغير مكتملة", { n }),
    hide: t("تم إخفاء {n} مهمة", { n }),
    show: t("تم إظهار {n} مهمة", { n }),
    assign: t("تم إسناد {n} مهمة إلى {name}", { n, name: empName(value) })
  }[op];
  commit(msg);
}

// ---------- actions ----------
const actions = {
  "pick-cat": (el) => { state.catId = el.dataset.id; state.search = ""; state.limit = PAGE_SIZE; render(); },
  "filter-tier": (el) => { state.tier = el.dataset.v; state.limit = PAGE_SIZE; render(); },
  "filter-verified": (el) => { state.verified = el.dataset.v; state.limit = PAGE_SIZE; render(); },
  "show-more": () => { state.limit += PAGE_SIZE; render(); },
  "close-modal": () => closeModal(),
  "open-ent": (el) => entityDetails(entById(el.dataset.id)),
  copy: async (el) => {
    try { await navigator.clipboard.writeText(el.dataset.v); toast(t("تم النسخ")); }
    catch { prompt(t("انسخ:"), el.dataset.v); }
  },
  "toggle-lang": () => setLang(LANG === "ar" ? "en" : "ar"),
  "new-cat": () => categoryModal(),
  "edit-cat": (el) => categoryModal(catById(el.dataset.id)),
  "del-cat": (el) => {
    const c = catById(el.dataset.id);
    const n = D().entities.filter((e) => e.categoryId === c.id).length;
    const msg = n ? t("حذف التصنيف \"{name}\" مع {n} شركة/براند بداخله؟", { name: tv(c.name), n }) : t("حذف التصنيف \"{name}\"؟", { name: tv(c.name) });
    if (!confirm(msg)) return;
    const ids = new Set(D().entities.filter((e) => e.categoryId === c.id).map((e) => e.id));
    D().entities = D().entities.filter((e) => !ids.has(e.id));
    D().tasks.forEach((x) => { if (ids.has(x.entityId)) x.entityId = ""; });
    D().categories = D().categories.filter((x) => x.id !== c.id);
    commit(t("تم حذف التصنيف"));
  },
  "new-ent": () => entityModal(),
  "edit-ent": (el) => entityModal(entById(el.dataset.id)),
  "toggle-hide-ent": (el) => {
    const e = entById(el.dataset.id);
    e.hidden = !e.hidden;
    commit(e.hidden ? t("تم إخفاء \"{name}\"", { name: e.name }) : t("تم إظهار \"{name}\"", { name: e.name }));
  },
  "toggle-hide-cat": (el) => {
    const c = catById(el.dataset.id);
    c.hidden = !c.hidden;
    commit(c.hidden ? t("تم إخفاء تصنيف \"{name}\"", { name: tv(c.name) }) : t("تم إظهار تصنيف \"{name}\"", { name: tv(c.name) }));
  },
  "toggle-show-hidden": () => { state.showHidden = !state.showHidden; render(); },
  "del-ent": (el) => {
    const e = entById(el.dataset.id);
    if (!confirm(t("حذف \"{name}\"؟", { name: e.name }))) return;
    D().entities = D().entities.filter((x) => x.id !== e.id);
    D().tasks.forEach((x) => { if (x.entityId === e.id) x.entityId = ""; });
    commit(t("تم الحذف"));
  },
  "add-contact": () => $("#contacts").insertAdjacentHTML("beforeend", contactRow()),
  "rm-contact": (el) => el.closest(".contact-row").remove(),
  "new-rental": () => rentalModal(),
  "edit-rental": (el) => rentalModal(rentalById(el.dataset.id)),
  "rental-list": (el) => { state.rentalList = el.dataset.v; render(); },
  "rental-accept": (el) => { rentalById(el.dataset.id).decision = "accepted"; commit(t("تم قبول الطلب")); },
  "rental-reject": (el) => { rentalById(el.dataset.id).decision = "rejected"; commit(t("تم نقل الطلب إلى المرفوض")); },
  "rental-done": (el) => { rentalById(el.dataset.id).done = true; commit(t("تم نقل الطلب إلى مكتمل")); },
  "rental-restore": (el) => {
    const x = rentalById(el.dataset.id);
    x.done = false;
    if (x.decision === "rejected") x.decision = "";
    commit(t("تمت إعادة الطلب"));
  },
  "del-rental": (el) => {
    if (!confirm(t("حذف هذا الطلب؟"))) return;
    D().rentals = D().rentals.filter((x) => x.id !== el.dataset.id);
    commit(t("تم الحذف"));
  },
  "add-link": () => $("#links").insertAdjacentHTML("beforeend", linkRow()),
  "rm-link": (el) => el.closest(".link-row").remove(),
  "rm-file": (el) => { modalFiles.splice(Number(el.dataset.i), 1); renderModalFiles(); },
  "open-modal-file": (el) => openFile(modalFiles[Number(el.dataset.i)]),
  "open-file": (el) => openFile(entById(el.dataset.ent).files[Number(el.dataset.i)]),

  "new-task": (el) => taskModal(null, el.dataset.ent),
  "edit-task": (el) => taskModal(taskById(el.dataset.id)),
  "del-task": (el) => {
    if (!confirm(t("حذف هذه المهمة؟"))) return;
    D().tasks = D().tasks.filter((x) => x.id !== el.dataset.id);
    state.selected.delete(el.dataset.id);
    commit(t("تم حذف المهمة"));
  },
  "toggle-task": (el) => {
    const x = taskById(el.dataset.id);
    x.done = el.checked;
    commit(x.done ? t("✓ مكتمل") : t("غير مكتمل"));
  },
  "toggle-done": (el) => {
    const x = taskById(el.dataset.id);
    x.done = !x.done;
    commit(x.done ? t("✓ مكتمل") : t("غير مكتمل"));
  },
  "select-task": (el) => {
    if (el.checked) state.selected.add(el.dataset.id);
    else state.selected.delete(el.dataset.id);
    render();
  },
  "select-all": (el) => {
    if (el.checked) filteredTasks().forEach((x) => state.selected.add(x.id));
    else state.selected.clear();
    render();
  },
  bulk: (el) => bulkTasks(el.dataset.op),
  "toggle-show-hidden-tasks": () => { state.showHiddenTasks = !state.showHiddenTasks; render(); },
  "filter-status": (el) => { state.taskStatus = el.dataset.v; state.selected.clear(); render(); },
  "filter-emp": (el) => { state.taskEmp = el.dataset.id; state.selected.clear(); render(); },

  "move-emp": (el) => {
    const arr = D().employees;
    const i = arr.findIndex((e) => e.id === el.dataset.id);
    const j = i + Number(el.dataset.dir);
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    commit();
  },
  logout: async () => {
    await Store.logout();
    state.users = null;
    state.selected.clear();
    render();
  },
  "save-user": async (el) => {
    const row = el.closest(".user-row");
    const val = (k) => row.querySelector(`[data-k=${k}]`);
    const id = row.dataset.id;
    el.disabled = true;
    try {
      const u = await Store.saveUser({
        id, name: val("name").value.trim(), password: val("password").value,
        role: val("role").value, active: val("active").checked,
        access: $$("[data-access]", row).filter((c) => c.checked).map((c) => c.dataset.access)
      });
      state.users = state.users.map((x) => (x.id === id ? u : x));
      const emp = D().employees.find((e) => e.id === id);
      if (emp) emp.name = u.name; else D().employees.push({ id: u.id, name: u.name });
      if (id === Store.user.id) Store.user = u;
      commit(t("تم حفظ بيانات {name}", { name: tv(u.name) }));
    } catch (err) {
      el.disabled = false;
      if (!sessionExpired(err)) toast(authError(err));
    }
  },
  "del-user": async (el) => {
    const id = el.closest(".user-row").dataset.id;
    const u = state.users.find((x) => x.id === id);
    const n = openTasksFor((x) => x.employeeId === id);
    const msg = t("حذف الموظف \"{name}\"؟", { name: tv(u.name) }) + (n ? "\n" + t("سيتم إلغاء إسناد {n} مهمة.", { n }) : "");
    if (!confirm(msg)) return;
    try {
      await Store.deleteUser(id);
      state.users = state.users.filter((x) => x.id !== id);
      D().employees = D().employees.filter((x) => x.id !== id);
      D().tasks.forEach((x) => { if (x.employeeId === id) x.employeeId = ""; });
      if (state.taskEmp === id) state.taskEmp = "";
      commit(t("تم حذف الموظف"));
    } catch (err) {
      if (!sessionExpired(err)) toast(authError(err));
    }
  },
  "del-emp": (el) => {
    const e = D().employees.find((x) => x.id === el.dataset.id);
    const n = openTasksFor((x) => x.employeeId === e.id);
    const msg = t("حذف الموظف \"{name}\"؟", { name: tv(e.name) }) + (n ? "\n" + t("سيتم إلغاء إسناد {n} مهمة.", { n }) : "");
    if (!confirm(msg)) return;
    D().employees = D().employees.filter((x) => x.id !== e.id);
    D().tasks.forEach((x) => { if (x.employeeId === e.id) x.employeeId = ""; });
    if (state.taskEmp === e.id) state.taskEmp = "";
    commit(t("تم حذف الموظف"));
  },

  "new-src": () => sourceModal(),
  "edit-src": (el) => sourceModal(D().sources.find((s) => s.id === el.dataset.id)),
  "del-src": (el) => {
    const s = D().sources.find((x) => x.id === el.dataset.id);
    if (!confirm(t("حذف المصدر \"{name}\"؟", { name: tv(s.name) }))) return;
    D().sources = D().sources.filter((x) => x.id !== s.id);
    commit(t("تم حذف المصدر"));
  },

  "save-types": () => {
    D().taskTypes = $("#taskTypes").value.split("\n").map((s) => s.trim()).filter(Boolean);
    commit(t("تم حفظ الأنواع"));
  },
  export: () => {
    const blob = new Blob([JSON.stringify(D(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  reload: async () => {
    try { await Store.reload(); render(); toast(t("تم التحديث")); }
    catch (err) { toast(t("فشل التحديث: {err}", { err: err.message })); }
  }
};

document.addEventListener("click", (ev) => {
  const tab = ev.target.closest(".tabs button");
  if (tab) { state.view = tab.dataset.view; render(); return; }
  // الروابط (اتصال، إيميل، موقع) تعمل كما هي ولا تفتح تفاصيل البطاقة
  if (ev.target.closest("a[href]")) return;
  const el = ev.target.closest("[data-action]");
  if (!el || el.tagName === "SELECT" || el.dataset.action === "rename-emp") return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (el.tagName !== "INPUT") ev.preventDefault();
  ev.stopPropagation();
  fn(el);
});

document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.dataset.action === "rental-status") {
    rentalById(el.dataset.id).status = el.value;
    commit(t("تم تحديث الحالة"));
    return;
  }
  if (el.id === "fRentalStatus") { state.rentalStatus = el.value; render(); return; }
  if (el.dataset.action === "assign-task") {
    taskById(el.dataset.id).employeeId = el.value;
    commit(t("تم الإسناد إلى {name}", { name: empName(el.value) }));
  } else if (el.id === "bulkAssign" && el.value) {
    bulkTasks("assign", el.value === "_none" ? "" : el.value);
  } else if (el.dataset.action === "rename-emp") {
    const e = D().employees.find((x) => x.id === el.dataset.id);
    const v = el.value.trim();
    if (v && v !== e.name) { e.name = v; commit(t("تم تعديل الاسم")); } else el.value = e.name;
  } else if (el.id === "fEmp") { state.taskEmp = el.value; state.selected.clear(); render(); }
  else if (el.id === "fType") { state.taskType = el.value; state.selected.clear(); render(); }
  else if (el.id === "importFile" && el.files[0]) {
    el.files[0].text().then((txt) => {
      if (!confirm(t("سيتم استبدال جميع البيانات الحالية بالملف المستورد. متابعة؟"))) return;
      Store.replace(JSON.parse(txt));
      commit(t("تم الاستيراد"));
    }).catch(() => toast(t("ملف غير صالح")));
  }
});

document.addEventListener("input", (ev) => {
  if (ev.target.id === "rentalSearch") {
    state.rentalSearch = ev.target.value;
    $(".rental-list").innerHTML = rentalRows();
    return;
  }
  if (ev.target.id === "search") {
    // نحدّث النتائج فقط دون إعادة رسم حقل البحث، حتى لا تُغلق لوحة المفاتيح على الجوال
    state.search = ev.target.value;
    state.limit = PAGE_SIZE;
    const tmp = document.createElement("div");
    tmp.innerHTML = renderDirectory();
    $(".layout").replaceWith(tmp.querySelector(".layout"));
  }
});

document.addEventListener("submit", async (ev) => {
  if (ev.target.id === "loginForm") {
    ev.preventDefault();
    const f = ev.target;
    const btn = f.querySelector("button");
    btn.disabled = true;
    try {
      await Store.login(f.username.value.trim(), f.password.value, f.remember.checked);
      state.users = null;
      setSync(syncLabel());
      render();
    } catch (err) {
      btn.disabled = false;
      f.password.value = "";
      toast(authError(err));
    }
    return;
  }
  if (ev.target.id === "addUserForm") {
    ev.preventDefault();
    const f = ev.target;
    const role = f.role.value;
    try {
      const u = await Store.saveUser({
        name: f.name.value.trim(), password: f.password.value, role, active: true,
        access: role === "admin" ? Object.keys(VIEWS) : ["directory", "tasks", "rentals", "sources"]
      });
      state.users.push(u);
      D().employees.push({ id: u.id, name: u.name });
      commit(t("تمت إضافة {name}", { name: u.name }));
    } catch (err) {
      if (!sessionExpired(err)) toast(authError(err));
    }
    return;
  }
  if (ev.target.id !== "addEmpForm") return;
  ev.preventDefault();
  const name = ev.target.name.value.trim();
  if (!name) return;
  D().employees.push({ id: uid(), name });
  commit(t("تمت إضافة {name}", { name }));
});

// شعار لا يمكن تحميله يُستبدل بالحرف الأول من الاسم
document.addEventListener("error", (ev) => {
  const img = ev.target;
  if (img.tagName !== "IMG" || !img.dataset.initial) return;
  const div = document.createElement("div");
  div.className = img.className;
  div.textContent = img.dataset.initial;
  img.replaceWith(div);
}, true);

// تحديث تلقائي من السيرفر عند العودة للصفحة
window.addEventListener("focus", async () => {
  if (Store.mode !== "supabase" || !Store.user || $("#modal").open) return;
  // لا نعيد الرسم إذا كان المدير يكتب في نموذج (مثل كلمة سر موظف)
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  try {
    await Store.reload();
    if (!typing) render();
  } catch (err) { sessionExpired(err); }
});

// فتح تفاصيل البطاقة بلوحة المفاتيح (Enter / Space)
document.addEventListener("keydown", (ev) => {
  const card = ev.target.closest?.(".card.clickable");
  if (card && ev.target === card && (ev.key === "Enter" || ev.key === " ")) {
    ev.preventDefault();
    entityDetails(entById(card.dataset.id));
  }
});

// ---------- language ----------
function setLang(lang) {
  LANG = lang;
  try { localStorage.setItem("lang", lang); } catch {}
  applyStaticText();
  if ($("#modal").open) closeModal();
  if (Store.data) { if (Store.user || Store.mode !== "supabase") setSync(syncLabel()); render(); }
}

(async () => {
  applyStaticText();
  try {
    await Store.init();
    setSync(syncLabel());
  } catch (err) {
    console.error(err);
    setSync(t("⚠️ تعذر الاتصال بقاعدة البيانات"));
    toast(t("تعذر الاتصال: {err}", { err: err.message || err }));
  }
  render();
})();
