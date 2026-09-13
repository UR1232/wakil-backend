const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// فحص الاتصال السريع (Ping/Health check)
app.get('/api/ping', (req, res) => res.status(200).send('pong'));
app.head('/api/ping', (req, res) => res.status(200).end());
app.get('/ping', (req, res) => res.status(200).send('pong'));
app.head('/ping', (req, res) => res.status(200).end());


// مسارات ملفات التخزين المحلي السحابي
const DATA_FILE = path.join(__dirname, 'citizens.json');
const ARCHIVE_FILE = path.join(__dirname, 'archive.json');
const AGENTS_FILE = path.join(__dirname, 'agents.json');
const OWNER_FILE = path.join(__dirname, 'owner.json');

// بيانات الأونر الافتراضية
const DEFAULT_OWNER = {
  username: 'admin',
  password: 'admin2026',
  name: 'المالك العام للمنظومة',
  role: 'owner'
};

function getOwnerConfig() {
  if (fs.existsSync(OWNER_FILE)) {
    try { return JSON.parse(fs.readFileSync(OWNER_FILE, 'utf8')); } catch (_) {}
  }
  return DEFAULT_OWNER;
}

function saveOwnerConfig(cfg) {
  fs.writeFileSync(OWNER_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

// قراءة وحفظ الوكلاء
function getAgents() {
  if (!fs.existsSync(AGENTS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')); } catch (_) { return []; }
}

function saveAgents(data) {
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// قراءة وحفظ المواطنين المتعددين
function getAllCitizensMap() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(raw)) return { '868': raw };
    return raw || {};
  } catch (_) {
    return {};
  }
}

function saveAllCitizensMap(map) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(map, null, 2), 'utf8');
}

function getCitizensByAgency(agency = '868') {
  const map = getAllCitizensMap();
  return map[String(agency)] || [];
}

function saveCitizensByAgency(agency = '868', list = []) {
  const map = getAllCitizensMap();
  map[String(agency)] = list;
  saveAllCitizensMap(map);
}

// قراءة وحفظ الأرشيف المتعدد
function getAllArchiveMap() {
  if (!fs.existsSync(ARCHIVE_FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
    if (Array.isArray(raw)) return { '868': raw };
    return raw || {};
  } catch (_) {
    return {};
  }
}

function saveAllArchiveMap(map) {
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(map, null, 2), 'utf8');
}

function getArchiveByAgency(agency = '868') {
  const map = getAllArchiveMap();
  return map[String(agency)] || [];
}

function saveArchiveByAgency(agency = '868', list = []) {
  const map = getAllArchiveMap();
  map[String(agency)] = list;
  saveAllArchiveMap(map);
}


// تهيئة قاعدة البيانات بالوكيل الافتراضي والـ 1042 مواطن
function initData() {
  const agents = getAgents();
  if (agents.length === 0) {
    saveAgents([
      {
        id: 'agent_868',
        username: 'user',
        password: '00000000',
        name: 'فاضل عباس كريم',
        agencyNumber: '868',
        licenseNumber: '000699',
        type: 'ghiz',
        governorate: 'ذي قار',
        branch: 'فرع تموين ذي قار',
        createdAt: new Date().toISOString()
      }
    ]);
  }

  const map = getAllCitizensMap();
  if (!map['868'] || map['868'].length < 1000) {
    const seed1042 = path.join(__dirname, 'citizens_1042.json');
    if (fs.existsSync(seed1042)) {
      try {
        const raw = JSON.parse(fs.readFileSync(seed1042, 'utf8'));
        if (Array.isArray(raw) && raw.length > 0) {
          saveCitizensByAgency('868', raw);
          console.log('Seeded agency 868 with 1,042 citizens');
        }
      } catch(_) {}
    }
  }
}
initData();

// ══ ROUTES ══

// فحص صحة السيرفر
app.get('/', (req, res) => {
  const agents = getAgents();
  res.json({
    status: 'online',
    message: 'سيرفر منظومة وكيل لإدارة الوكلاء والحصص التموينية يعمل بنجاح 🚀',
    version: '1.0.12',
    totalAgents: agents.length,
    time: new Date().toISOString()
  });
});

// فحص إصدار التطبيق والتحديث الهوائي الفوري
app.get('/api/app-version', (req, res) => {
  res.json({
    version: '1.0.18',
    versionCode: 18,
    bundleUrl: 'https://wakil-api.onrender.com/index.html',
    downloadUrl: 'https://files.catbox.moe/tja4pv.apk',
    notes: 'إلغاء زر الاستعادة وجعل الإعدادات نظيفة ومقتصرة على التحديث الهوائي فقط',
    updatedAt: new Date().toISOString()
  });
});

// خدمة حزمة التحديث الهوائي (OTA Bundle)
app.get('/api/ota-bundle', (req, res) => {
  const p1 = path.join(__dirname, 'public', 'index.html');
  const p2 = path.join(__dirname, 'index.html');
  const targetFile = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
  if (targetFile) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(targetFile);
  }
  res.status(404).send('OTA bundle file not found');
});

// خدمة ملف التطبيق
app.get('/app.html', (req, res) => {
  const p1 = path.join(__dirname, 'public', 'index.html');
  const p2 = path.join(__dirname, 'index.html');
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.status(404).send('Not found');
});

// خدمة ملف الـ APK
app.get('/wakil.apk', (req, res) => {
  const apkPath = path.join(__dirname, 'public', 'wakil.apk');
  if (fs.existsSync(apkPath)) {
    res.download(apkPath, 'wakil.apk');
  } else {
    res.status(404).send('APK file not found');
  }
});

// ══ 1. AUTHENTICATION (تسجيل الدخول الذكي: مالك أو وكيل) ══
app.post('/api/login', (req, res) => {
  const { username, password, agentType } = req.body;
  const u = (username || '').trim().toLowerCase();
  const p = (password || '').trim();

  // 1. فحص حساب الأونر / المالك العام
  const owner = getOwnerConfig();
  if ((u === owner.username.toLowerCase() || u === 'owner' || u === 'admin') && p === owner.password) {
    return res.json({
      success: true,
      role: 'owner',
      token: 'owner_session_' + Date.now(),
      owner: {
        username: owner.username,
        name: owner.name || 'المالك العام للمنظومة',
        role: 'owner'
      }
    });
  }

  // 2. فحص حسابات الوكلاء المسجلين
  const agents = getAgents();
  const matched = agents.find(ag => ag.username.toLowerCase() === u && ag.password === p);
  if (matched) {
    return res.json({
      success: true,
      role: 'agent',
      token: 'agent_session_' + Date.now(),
      agent: {
        id: matched.id,
        name: matched.name,
        agencyNumber: matched.agencyNumber,
        licenseNumber: matched.licenseNumber || '',
        type: matched.type || agentType || 'ghiz',
        governorate: matched.governorate || 'ذي قار',
        branch: matched.branch || 'فرع تموين ذي قار',
        username: matched.username
      }
    });
  }

  return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
});

// ══ 2. OWNER MANAGEMENT APIS (خاصة بالمالك فقط) ══

// جلب قائمة الوكلاء وإحصائياتهم الشاملة
app.get('/api/owner/agents', (req, res) => {
  const agents = getAgents();
  const map = getAllCitizensMap();

  const enriched = agents.map(ag => {
    const list = map[String(ag.agencyNumber)] || [];
    const total = list.length;
    const received = list.filter(c => c.isReceived || c.done).length;
    const pending = total - received;
    const pct = total ? Math.round((received / total) * 100) : 0;

    return {
      ...ag,
      stats: {
        totalCitizens: total,
        receivedCount: received,
        pendingCount: pending,
        completionPct: pct
      }
    };
  });

  res.json({
    success: true,
    totalAgents: agents.length,
    agents: enriched
  });
});


// مزامنة ودمج الوكلاء سحابياً دفعة واحدة (Push / Sync)
app.post('/api/owner/agents/sync', (req, res) => {
  const { agents: incoming } = req.body;
  if (!Array.isArray(incoming)) {
    return res.status(400).json({ success: false, message: 'قائمة الوكلاء غير صحيحة' });
  }

  const existing = getAgents();
  let changed = false;

  incoming.forEach(inAg => {
    if (!inAg || !inAg.username || !inAg.password) return;
    const idx = existing.findIndex(e => e.username.toLowerCase() === inAg.username.toLowerCase() || String(e.agencyNumber) === String(inAg.agencyNumber));
    if (idx === -1) {
      existing.push({
        id: inAg.id || ('agent_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
        name: inAg.name,
        username: inAg.username,
        password: inAg.password,
        agencyNumber: String(inAg.agencyNumber),
        type: inAg.type || 'ghiz',
        governorate: inAg.governorate || 'ذي قار',
        branch: inAg.branch || 'فرع التموين',
        createdAt: inAg.createdAt || new Date().toISOString()
      });
      changed = true;
    } else {
      existing[idx] = {
        ...existing[idx],
        password: inAg.password || existing[idx].password,
        name: inAg.name || existing[idx].name,
        type: inAg.type || existing[idx].type
      };
      changed = true;
    }
  });

  if (changed) {
    saveAgents(existing);
  }

  console.log(`Cloud sync: total agents is now ${existing.length}`);
  res.json({ success: true, message: `تمت مزامنة ${existing.length} وكيل سحابياً بنجاح!`, agents: existing });
});

// إضافة وكيل جديد
app.post('/api/owner/agents', (req, res) => {
  const { name, username, password, agencyNumber, type, governorate, branch, licenseNumber } = req.body;

  if (!name || !username || !password || !agencyNumber) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال كافة الحقول المطلوبة (الاسم، اليوزر، الباسورد، رمز الوكالة)' });
  }

  const agents = getAgents();
  const uClean = username.trim();
  const codeClean = String(agencyNumber).trim();

  if (agents.some(a => a.username.toLowerCase() === uClean.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'اسم المستخدم هذا مستخدم بالفعل من قبل وكيل آخر' });
  }
  if (agents.some(a => String(a.agencyNumber) === codeClean)) {
    return res.status(400).json({ success: false, message: 'رمز الوكالة هذا مسجل مسبقاً لوكيل آخر' });
  }

  const newAgent = {
    id: 'agent_' + Date.now(),
    name: name.trim(),
    username: uClean,
    password: password.trim(),
    agencyNumber: codeClean,
    licenseNumber: (licenseNumber || '').trim(),
    type: type === 'tahn' ? 'tahn' : 'ghiz',
    governorate: (governorate || 'ذي قار').trim(),
    branch: (branch || 'فرع التموين').trim(),
    createdAt: new Date().toISOString()
  };

  agents.push(newAgent);
  saveAgents(agents);

  // تهيئة قائمة مواطنين فارغة لهذا الوكيل
  saveCitizensByAgency(codeClean, []);

  console.log(`New agent created by Owner: ${newAgent.name} (User: ${newAgent.username}, Agency: ${newAgent.agencyNumber})`);

  res.json({
    success: true,
    message: `تم إنشاء الوكيل (${newAgent.name}) بنجاح!`,
    agent: newAgent
  });
});

// تعديل بيانات الوكيل أو كلمة مروره
app.put('/api/owner/agents/:id', (req, res) => {
  const id = req.params.id;
  const agents = getAgents();
  const idx = agents.findIndex(a => a.id === id || a.agencyNumber === id);

  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'الوكيل غير موجود' });
  }

  const { name, username, password, type, governorate, branch, licenseNumber } = req.body;
  const current = agents[idx];

  if (username && username.trim().toLowerCase() !== current.username.toLowerCase()) {
    if (agents.some((a, i) => i !== idx && a.username.toLowerCase() === username.trim().toLowerCase())) {
      return res.status(400).json({ success: false, message: 'اسم المستخدم مستخدم لوكيل آخر' });
    }
  }

  agents[idx] = {
    ...current,
    name: name !== undefined ? name.trim() : current.name,
    username: username !== undefined ? username.trim() : current.username,
    password: password !== undefined ? password.trim() : current.password,
    type: type !== undefined ? (type === 'tahn' ? 'tahn' : 'ghiz') : current.type,
    governorate: governorate !== undefined ? governorate.trim() : current.governorate,
    branch: branch !== undefined ? branch.trim() : current.branch,
    licenseNumber: licenseNumber !== undefined ? licenseNumber.trim() : current.licenseNumber,
    updatedAt: new Date().toISOString()
  };

  saveAgents(agents);
  res.json({ success: true, message: 'تم تحديث بيانات الوكيل بنجاح', agent: agents[idx] });
});

// حذف وكيل
app.delete('/api/owner/agents/:id', (req, res) => {
  const id = req.params.id;
  let agents = getAgents();
  const agent = agents.find(a => a.id === id || a.agencyNumber === id);

  if (!agent) {
    return res.status(404).json({ success: false, message: 'الوكيل غير موجود' });
  }

  agents = agents.filter(a => a.id !== id && a.agencyNumber !== id);
  saveAgents(agents);

  // حذف مواطني الوكيل وأرشيفه
  const map = getAllCitizensMap();
  delete map[String(agent.agencyNumber)];
  saveAllCitizensMap(map);

  const archMap = getAllArchiveMap();
  delete archMap[String(agent.agencyNumber)];
  saveAllArchiveMap(archMap);

  console.log(`Agent deleted: ${agent.name} (${agent.agencyNumber})`);
  res.json({ success: true, message: `تم حذف الوكيل (${agent.name}) وكافة بياناته بنجاح` });
});

// جلب مواطني وكيل معين للمالك (للتصفح والطباعة)
app.get('/api/owner/agents/:id/citizens', (req, res) => {
  const id = req.params.id;
  const agents = getAgents();
  const agent = agents.find(a => a.id === id || a.agencyNumber === id);

  if (!agent) {
    return res.status(404).json({ success: false, message: 'الوكيل غير موجود' });
  }

  const list = getCitizensByAgency(agent.agencyNumber);
  const total = list.length;
  const received = list.filter(c => c.isReceived || c.done).length;

  res.json({
    success: true,
    agent,
    stats: { total, received, pending: total - received },
    citizens: list
  });
});

// إحصائيات المنظومة العامة للمالك
app.get('/api/owner/stats', (req, res) => {
  const agents = getAgents();
  const map = getAllCitizensMap();

  let totalCitizensAll = 0;
  let totalReceivedAll = 0;

  agents.forEach(ag => {
    const list = map[String(ag.agencyNumber)] || [];
    totalCitizensAll += list.length;
    totalReceivedAll += list.filter(c => c.isReceived || c.done).length;
  });

  const ghizCount = agents.filter(a => a.type === 'ghiz').length;
  const tahnCount = agents.filter(a => a.type === 'tahn').length;

  res.json({
    totalAgents: agents.length,
    ghizAgents: ghizCount,
    tahnAgents: tahnCount,
    totalCitizensAll,
    totalReceivedAll,
    overallPct: totalCitizensAll ? Math.round((totalReceivedAll / totalCitizensAll) * 100) : 0
  });
});

// ══ 3. MULTI-TENANT CITIZENS & ARCHIVE APIS (للوكلاء والمالك) ══

// استيراد وحفظ كشف مواطنين كامل سحابياً لوكيل معين

// تصفير وحذف كشف المواطنين بالكامل لوكيل معين
app.post('/api/citizens/clear', (req, res) => {
  const agency = req.body.agencyNumber || req.query.agencyNumber || '868';
  saveCitizensByAgency(agency, []);
  console.log(`Cleared all citizens for agency ${agency}`);
  res.json({ success: true, message: `تم تصفير وحذف كشف المواطنين للوكالة (${agency}) بنجاح!` });
});

app.post('/api/citizens/import', (req, res) => {
  const agency = req.body.agencyNumber || req.query.agencyNumber || '868';
  const incoming = req.body.citizens;

  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({ success: false, error: 'قائمة المواطنين فارغة أو غير صحيحة' });
  }

  const formatted = incoming.map(c => ({
    id: c.id || c.seq,
    name: c.name,
    cardNumber: c.card || c.cardNumber,
    oldCardNumber: c.oldCard || c.oldCardNumber || '',
    familyCount: c.fam !== undefined ? c.fam : (c.familyCount || 0),
    eligibleCount: c.eligible !== undefined ? c.eligible : (c.eligibleCount || 0),
    blockedCount: c.blocked !== undefined ? c.blocked : (c.blockedCount || 0),
    isWelfare: !!c.welfare || !!c.isWelfare,
    isReceived: !!c.done || !!c.isReceived,
    receivedAt: c.doneAt || c.receivedAt || null,
    items: c.items || { oil: false, flour: false, rice: false, sugar: false, paste: false, milk: false },
    customItems: c.custom || c.customItems || [],
    notes: c.notes || ''
  }));

  saveCitizensByAgency(agency, formatted);
  console.log(`Saved ${formatted.length} citizens for agency ${agency}`);
  res.json({ success: true, message: `تم حفظ ${formatted.length} مواطناً سحابياً بنجاح للوكالة (${agency})!`, count: formatted.length });
});

// جلب قائمة المواطنين للوكيل الحالي
app.get('/api/citizens', (req, res) => {
  const agency = req.query.agencyNumber || '868';
  const query = (req.query.search || '').trim().toLowerCase();
  let list = getCitizensByAgency(agency);

  if (query) {
    list = list.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.cardNumber.includes(query) ||
      c.oldCardNumber.includes(query)
    );
  }

  const total = list.length;
  const received = list.filter(c => c.isReceived).length;
  const pending = total - received;

  res.json({
    stats: { total, received, pending },
    citizens: list
  });
});

// تفاصيل مواطن واحد
app.get('/api/citizens/:id', (req, res) => {
  const agency = req.query.agencyNumber || '868';
  const id = parseInt(req.params.id);
  const list = getCitizensByAgency(agency);
  const citizen = list.find(c => c.id === id);

  if (!citizen) {
    return res.status(404).json({ error: 'المواطن غير موجود' });
  }
  res.json(citizen);
});

// تحديث وتعديل بيانات واستلام المواطن بالكامل

// حذف مواطن معين لوكيل
app.delete('/api/citizens/:id', (req, res) => {
  const agency = req.body.agencyNumber || req.query.agencyNumber || '868';
  const id = parseInt(req.params.id);
  let list = getCitizensByAgency(agency);
  const idx = list.findIndex(c => c.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'المواطن غير موجود' });
  }

  const deleted = list.splice(idx, 1);
  saveCitizensByAgency(agency, list);
  console.log(`Deleted citizen ${deleted[0].name} (ID: ${id}) from agency ${agency}`);
  res.json({ success: true, message: `تم حذف المواطن (${deleted[0].name}) بنجاح`, citizen: deleted[0] });
});

app.put('/api/citizens/:id', (req, res) => {
  const agency = req.body.agencyNumber || req.query.agencyNumber || '868';
  const id = parseInt(req.params.id);
  let list = getCitizensByAgency(agency);
  const idx = list.findIndex(c => c.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'المواطن غير موجود' });
  }

  const current = list[idx];
  const {
    name,
    cardNumber, card,
    oldCardNumber, oldCard,
    familyCount, fam,
    eligibleCount, elig,
    blockedCount, blk,
    isWelfare, welfare,
    isReceived,
    items,
    customItems,
    notes
  } = req.body;

  const updatedCard = cardNumber !== undefined ? cardNumber : (card !== undefined ? card : current.cardNumber);
  const updatedOldCard = oldCardNumber !== undefined ? oldCardNumber : (oldCard !== undefined ? oldCard : current.oldCardNumber);

  list[idx] = {
    ...current,
    name: name !== undefined ? String(name).trim() : current.name,
    cardNumber: updatedCard !== undefined ? String(updatedCard).trim() : current.cardNumber,
    oldCardNumber: updatedOldCard !== undefined ? String(updatedOldCard).trim() : (current.oldCardNumber || ''),
    familyCount: familyCount !== undefined ? parseInt(familyCount) : (fam !== undefined ? parseInt(fam) : current.familyCount),
    eligibleCount: eligibleCount !== undefined ? parseInt(eligibleCount) : (elig !== undefined ? parseInt(elig) : current.eligibleCount),
    blockedCount: blockedCount !== undefined ? parseInt(blockedCount) : (blk !== undefined ? parseInt(blk) : current.blockedCount),
    isWelfare: isWelfare !== undefined ? !!isWelfare : (welfare !== undefined ? !!welfare : current.isWelfare),
    isReceived: isReceived !== undefined ? !!isReceived : current.isReceived,
    receivedAt: isReceived ? (current.receivedAt || new Date().toISOString()) : (isReceived === false ? null : current.receivedAt),
    items: items !== undefined ? items : current.items,
    customItems: customItems !== undefined ? customItems : current.customItems,
    notes: notes !== undefined ? notes : current.notes
  };

  saveCitizensByAgency(agency, list);
  res.json({ success: true, citizen: list[idx] });
});

// إلغاء استلام الحصة
app.post('/api/citizens/:id/cancel', (req, res) => {
  const agency = req.body.agencyNumber || req.query.agencyNumber || '868';
  const id = parseInt(req.params.id);
  let list = getCitizensByAgency(agency);
  const idx = list.findIndex(c => c.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'المواطن غير موجود' });
  }

  list[idx] = {
    ...list[idx],
    isReceived: false,
    receivedAt: null,
    items: { oil: false, flour: false, rice: false, sugar: false, paste: false, milk: false },
    customItems: []
  };

  saveCitizensByAgency(agency, list);
  res.json({ success: true, message: 'تم إلغاء الاستلام بنجاح', citizen: list[idx] });
});

// إنهاء وأرشفة الشهر
app.post('/api/archive/finish-month', (req, res) => {
  const agency = req.body.agencyNumber || req.query.agencyNumber || '868';
  const { monthTitle, citizens: clientCitizens } = req.body;
  if (!monthTitle) {
    return res.status(400).json({ error: 'يرجى تزويد اسم للشهر الأرشيفي' });
  }

  let citizensToArchive = getCitizensByAgency(agency);
  if (Array.isArray(clientCitizens) && clientCitizens.length > 0) {
    citizensToArchive = clientCitizens;
  }
  const receivedCount = citizensToArchive.filter(c => c.isReceived || c.done).length;

  const archive = getArchiveByAgency(agency);
  const snapshot = {
    id: 'm_arch_' + Date.now(),
    monthTitle: monthTitle.trim(),
    label: monthTitle.trim(),
    archivedAt: new Date().toISOString(),
    date: new Date().toISOString(),
    totalCitizens: citizensToArchive.length,
    receivedCount: receivedCount,
    citizens: citizensToArchive
  };

  archive.unshift(snapshot);
  saveArchiveByAgency(agency, archive);

  // تصفير الشهر الحالي لهذا الوكيل
  const current = getCitizensByAgency(agency);
  const resetCitizens = current.map(c => ({
    ...c,
    isReceived: false,
    receivedAt: null,
    items: { oil: false, flour: false, rice: false, sugar: false, paste: false, milk: false },
    customItems: []
  }));
  saveCitizensByAgency(agency, resetCitizens);

  res.json({
    success: true,
    message: `تمت أرشفة (${monthTitle}) بنجاح للوكالة (${agency}) وتصفير السجل للشهر الجديد!`,
    snapshot
  });
});

// جلب قائمة أرشيف الأشهر لوكيل معين
app.get('/api/archive', (req, res) => {
  const agency = req.query.agencyNumber || '868';
  res.json(getArchiveByAgency(agency));
});

// تعديل اسم شهر في الأرشيف
app.put('/api/archive/:id', (req, res) => {
  const agency = req.query.agencyNumber || '868';
  const id = req.params.id;
  const { newTitle } = req.body;

  let archive = getArchiveByAgency(agency);
  const month = archive.find(m => m.id === id);

  if (!month) {
    return res.status(404).json({ error: 'الشهر غير موجود في الأرشيف' });
  }

  month.monthTitle = newTitle.trim();
  saveArchiveByAgency(agency, archive);

  res.json({ success: true, month });
});

// تعديل أو تأكيد أو إلغاء استلام مواطن داخل شهر في الأرشيف
app.put('/api/archive/:id/citizen', (req, res) => {
  const agency = req.body.agencyNumber || req.query.agencyNumber || '868';
  const monthId = req.params.id;
  const { citizenId, items, customItems, isReceived, done, doneAt, name, card, oldCard, familyCount, eligibleCount, blockedCount, isWelfare, notes } = req.body;

  let archive = getArchiveByAgency(agency);
  const month = archive.find(m => m.id === monthId);
  if (!month) {
    return res.status(404).json({ error: 'الشهر غير موجود في الأرشيف' });
  }

  if (Array.isArray(month.citizens)) {
    const cIdx = month.citizens.findIndex(c => c.id === citizenId);
    if (cIdx !== -1) {
      const cit = month.citizens[cIdx];
      if (done !== undefined) cit.done = !!done;
      if (isReceived !== undefined) cit.done = !!isReceived;
      if (doneAt !== undefined) cit.doneAt = doneAt;
      if (items !== undefined) cit.items = items;
      if (customItems !== undefined) cit.custom = customItems;
      if (name !== undefined) cit.name = name;
      if (card !== undefined) cit.card = card;
      if (oldCard !== undefined) cit.oldCard = oldCard;
      if (familyCount !== undefined) cit.fam = familyCount;
      if (eligibleCount !== undefined) cit.elig = eligibleCount;
      if (blockedCount !== undefined) cit.blk = blockedCount;
      if (isWelfare !== undefined) cit.welfare = isWelfare;
      if (notes !== undefined) cit.notes = notes;

      month.receivedCount = month.citizens.filter(c => c.done || c.isReceived).length;
      saveArchiveByAgency(agency, archive);
      return res.json({ success: true, citizen: cit, monthStats: { total: month.citizens.length, received: month.receivedCount } });
    }
  }
  res.status(404).json({ error: 'المواطن غير موجود في هذا الشهر' });
});


module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}
