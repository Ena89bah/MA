// طبقة قاعدة البيانات: Supabase إذا تم ضبط config.js، وإلا localStorage
const DB_KEY = "directory_db_v1";
const TOKEN_KEY = "directory_session";

function emptyDB() {
  return { categories: [], entities: [], employees: [], tasks: [], taskTypes: [], sources: [], rentals: [] };
}

// مصادر بيانات التواصل (الأسعار تقريبية – تحقق منها في مواقعها)
function defaultSources() {
  const s = (id, name, url, role, strength, gulf, price) => ({ id, kind: "paid", name, url, role, strength, gulf, price, notes: "" });
  const f = (id, name, url, role, strength, gulf, price) => ({ id, kind: "free", name, url, role, strength, gulf, price, notes: "" });
  return [
    f("free1", "موقع البراند الرسمي", "", "إيميلات عامة وأرقام",
      "صفحة (اتصل بنا) و(من نحن) وقسم الوظائف والمركز الإعلامي فيها إيميلات وأرقام رسمية", "متوفر لكل البراندات تقريباً", "مجاني"),
    f("free2", "إنستغرام وتيك توك وX", "https://www.instagram.com", "إيميل وواتساب الأعمال",
      "حسابات البراندات التجارية تضع زر (تواصل) أو إيميل التعاون والإعلانات في البايو", "ممتاز للبراندات في الخليج", "مجاني"),
    f("free3", "LinkedIn (الحساب المجاني)", "https://www.linkedin.com", "معرفة الأشخاص",
      "صفحة الشركة ← (الأشخاص) تعرض الموظفين ومناصبهم، مع حد للبحث الشهري", "ممتاز", "مجاني"),
    f("free4", "بحث Google المتقدم", "https://www.google.com", "معرفة الأشخاص والإيميلات",
      "مثال: site:linkedin.com/in \"اسم البراند\" \"Marketing Manager\" أو \"@brand.com\" لإيجاد صيغة الإيميل", "جيد", "مجاني"),
    f("free5", "خرائط Google", "https://maps.google.com", "أرقام الفروع",
      "أرقام هواتف الفروع والمكاتب الرئيسية ومواقعها", "ممتاز للمحلات والمطاعم", "مجاني"),
    f("free6", "أدلة الغرف التجارية", "", "بيانات الشركات",
      "أدلة أعضاء الغرف التجارية تعرض بيانات تواصل الشركات المسجلة", "جيد للشركات المحلية", "مجاني غالباً"),
    f("free7", "Hunter.io (خطة مجانية)", "https://hunter.io", "إيميلات وصيغة الإيميل",
      "يكشف صيغة إيميلات الشركة (مثل name@brand.com) ويتحقق من صحة الإيميل، برصيد مجاني شهري محدود", "متوسط", "مجاني محدود، ثم مدفوع"),
    f("free8", "theHarvester (مفتوح المصدر)", "https://github.com/laramies/theHarvester", "جمع الإيميلات العامة",
      "أداة مفتوحة المصدر تجمع الإيميلات المنشورة علناً لنطاق الشركة من محركات البحث", "متوسط، تحتاج خبرة تقنية", "مجاني"),
    s("src1", "LinkedIn Sales Navigator", "https://business.linkedin.com/sales-solutions", "معرفة الأشخاص",
      "أدق مصدر للأسماء والمناصب الحالية، وفلترة قوية حسب الشركة والمنصب", "ممتاز، لأن أغلب موظفي البراندات موجودون عليه", "حوالي 100$ شهرياً"),
    s("src2", "Apollo.io", "https://www.apollo.io", "جلب الرقم والإيميل",
      "أفضل قيمة مقابل السعر: إيميلات وأرقام وإضافة على المتصفح فوق LinkedIn", "الإيميلات جيدة، والأرقام متوسطة", "من حوالي 50$ شهرياً، وفيه خطة مجانية"),
    s("src3", "Lusha", "https://www.lusha.com", "جلب الرقم والإيميل",
      "سهل جداً، وأرقام الجوال فيه أدق نسبياً", "جيد في الشرق الأوسط مقارنة بغيره", "من حوالي 40–50$ شهرياً"),
    s("src4", "Cognism", "https://www.cognism.com", "جلب الرقم والإيميل",
      "أرقام جوال موثقة هاتفياً، ويلتزم بقوانين حماية البيانات", "قوي في أوروبا والشرق الأوسط", "غالٍ، تعاقد سنوي بآلاف الدولارات"),
    s("src5", "ZoomInfo", "https://www.zoominfo.com", "قاعدة بيانات شاملة",
      "أكبر قاعدة بيانات", "مبالغ فيه للخليج مقارنة بسعره", "غالٍ جداً، تعاقد سنوي"),
    s("src6", "RocketReach", "https://rocketreach.co", "جلب الإيميل",
      "بديل بسيط لجلب الإيميلات", "متوسط", "حوالي 50–100$ شهرياً")
  ];
}

function seedDB() {
  const e = (id, name) => ({ id, name });
  return {
    taskTypes: ["تواصل مباشر", "إرسال إيميل", "جلب بيانات التواصل", "متابعة"],
    sources: defaultSources(),
    employees: [e("emp1", "نوف"), e("emp2", "علي"), e("emp3", "مي")],
    categories: [
      { id: "cat1", name: "مطاعم وكافيهات", type: "activity" },
      { id: "cat2", name: "عقارات", type: "activity" },
      { id: "cat3", name: "أزياء", type: "brand" }
    ],
    entities: [
      {
        id: "ent1", categoryId: "cat1", name: "شركة المثال للأغذية", logo: "", notes: "عميل محتمل – مهتم بالعروض الموسمية",
        links: [{ title: "الموقع الرسمي", url: "https://example.com" }], files: [],
        contacts: [
          { name: "أحمد", phone: "0500000001", email: "ahmed@example.com" },
          { name: "سارة", phone: "0500000002", email: "sara@example.com" }
        ]
      },
      { id: "ent2", categoryId: "cat3", name: "براند تجريبي", logo: "", notes: "", contacts: [] }
    ],
    tasks: [
      { id: "t1", title: "تواصل مع أحمد وسارة", type: "تواصل مباشر", entityId: "ent1", employeeId: "emp1", done: false, notes: "", createdAt: Date.now() },
      { id: "t2", title: "جلب بيانات التواصل", type: "جلب بيانات التواصل", entityId: "ent2", employeeId: "emp2", done: false, notes: "", createdAt: Date.now() },
      { id: "t3", title: "إرسال إيميل تعريفي", type: "إرسال إيميل", entityId: "ent1", employeeId: "emp3", done: true, notes: "", createdAt: Date.now() }
    ]
  };
}

// البيانات الأولية: data/seed.json (يُبنى بـ tools/build-data.mjs)، وإلا بيانات تجريبية
async function loadSeed() {
  try {
    const r = await fetch("data/seed.json", { cache: "no-cache" });
    if (r.ok) return normalize(await r.json());
  } catch {}
  return seedDB();
}

function normalize(d) {
  const base = emptyDB();
  if (!d || typeof d !== "object") return base;
  for (const k of Object.keys(base)) base[k] = Array.isArray(d[k]) ? d[k] : [];
  // قواعد البيانات القديمة التي لا تحتوي على المصادر تحصل على القائمة الافتراضية
  if (!("sources" in d)) base.sources = defaultSources();
  return base;
}

const Store = {
  mode: "local",
  client: null,
  data: emptyDB(),

  async init() {
    const cfg = window.APP_CONFIG || {};
    if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
      this.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      this.mode = "supabase";
      // جلسة "حفظ الدخول" في localStorage، والجلسة العادية في sessionStorage وتنتهي بإغلاق المتصفح
      try { this.token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch {}
      if (this.token) {
        try {
          this.user = await this.rpc("app_me", { p_token: this.token });
          await this.reload();
        } catch { this.forgetSession(); }
      }
    } else {
      let raw = null;
      try { raw = localStorage.getItem(DB_KEY); } catch {}
      this.data = raw ? normalize(JSON.parse(raw)) : await loadSeed();
    }
  },

  async reload() {
    if (this.mode !== "supabase") return;
    const d = await this.rpc("app_get_state", { p_token: this.token });
    this.data = d && Object.keys(d).length ? normalize(d) : await loadSeed();
    this.snapshot();
  },

  // صورة لآخر ما حُفظ، لنرسل عند الحفظ ما تغيّر فقط
  snapshot() {
    const { entities, ...rest } = this.data;
    this.savedRest = JSON.stringify(rest);
    this.savedEnts = new Map(entities.map((e) => [e.id, JSON.stringify(e)]));
  },

  // ---------- الدخول والمستخدمين ----------
  async rpc(fn, args) {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  },

  needsLogin() { return this.mode === "supabase" && !this.user; },

  async login(name, password, remember) {
    const r = await this.rpc("app_login", { p_name: name, p_password: password, p_remember: remember });
    if (r.error) throw new Error(r.error);
    this.token = r.token;
    this.user = r.user;
    try { (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, r.token); } catch {}
    await this.reload();
  },

  forgetSession() {
    this.token = null;
    this.user = null;
    this.data = emptyDB();
    try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch {}
  },

  async logout() {
    try { await this.rpc("app_logout", { p_token: this.token }); } catch {}
    this.forgetSession();
  },

  listUsers() { return this.rpc("app_list_users", { p_token: this.token }); },

  saveUser(u) {
    return this.rpc("app_save_user", {
      p_token: this.token, p_id: u.id || "", p_name: u.name, p_password: u.password || "",
      p_role: u.role, p_access: u.access, p_active: u.active
    });
  },

  deleteUser(id) { return this.rpc("app_delete_user", { p_token: this.token, p_id: id }); },

  async save() {
    // في الوضع المشترك لا نترك نسخة من البيانات في المتصفح
    if (this.mode !== "supabase") {
      try { localStorage.setItem(DB_KEY, JSON.stringify(this.data)); } catch {}
    } else {
      const { entities, ...rest } = this.data;
      const upsert = entities.filter((e) => this.savedEnts.get(e.id) !== JSON.stringify(e));
      const ids = new Set(entities.map((e) => e.id));
      const del = [...this.savedEnts.keys()].filter((id) => !ids.has(id));
      if (this.perEntity !== false && (upsert.length || del.length)) {
        try {
          await this.rpc("app_save_entities", { p_token: this.token, p_upsert: upsert, p_delete: del });
          this.perEntity = true;
        } catch (err) {
          // قبل تشغيل supabase-entities.sql لا توجد الدالة، فنحفظ المستند كاملاً كما كان
          if (!/app_save_entities|schema cache/.test(err.message)) throw err;
          this.perEntity = false;
        }
      }
      if (this.perEntity === false) {
        await this.rpc("app_save_state", { p_token: this.token, p_data: this.data });
      } else if (JSON.stringify(rest) !== this.savedRest) {
        await this.rpc("app_save_state", { p_token: this.token, p_data: rest });
      }
      this.snapshot();
    }
  },

  // يرفع الملف إلى Supabase Storage ويعيد رابطه، أو يحوّله إلى data URL في الوضع المحلي
  async uploadFile(file) {
    if (this.mode === "supabase") {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await this.client.storage.from("files").upload(path, file, { contentType: file.type });
      if (error) throw error;
      return this.client.storage.from("files").getPublicUrl(path).data.publicUrl;
    }
    if (file.size > 1.5 * 1024 * 1024) throw new Error("الحد الأقصى للملف 1.5MB في الوضع المحلي");
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  },

  replace(d) {
    this.data = normalize(d);
  }
};
