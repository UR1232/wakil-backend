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
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const ANNOUNCEMENT_FILE = path.join(__dirname, 'announcement.json');
const ANNOUNCEMENTS_LIST_FILE = path.join(__dirname, 'announcements.json');
const REVOKED_FILE = path.join(__dirname, 'revoked_sessions.json');

const APP_VERSION = '1.0.44';
const APP_VERSION_CODE = 44;
let APK_DOWNLOAD_URL = 'https://files.catbox.moe/ksanzg.apk';

// دالة تحويل الأرقام العربية والفارسية إلى أرقام إنجليزية قياسية
function normalizeDigits(str) {
  if (str === null || str === undefined) return '';
  return String(str).trim()
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}

function getSessions() {
  if (!fs.existsSync(SESSIONS_FILE)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    if (!Array.isArray(list)) return [];
    return list;
  } catch (_) { return []; }
}
function saveSessions(data) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getRevokedSessions() {
  if (!fs.existsSync(REVOKED_FILE)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(REVOKED_FILE, 'utf8'));
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    // تخليد الطرد الدائم لمدة 30 يوماً لضمان طرد أي جهاز أوفلاين يعود لاحقاً
    return list.filter(r => {
      const t = new Date(r.revokedAt || 0).getTime();
      return (now - t < 30 * 24 * 60 * 60 * 1000);
    });
  } catch (_) { return []; }
}
function saveRevokedSessions(data) {
  try {
    fs.writeFileSync(REVOKED_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

// ══ منظومة التعاميم الإدارية المتعددة والمجدولة والمستهدفة ══
function getAnnouncementsList() {
  if (!fs.existsSync(ANNOUNCEMENTS_LIST_FILE)) {
    // ترقية من الملف القديم الفردي إذا وجد
    if (fs.existsSync(ANNOUNCEMENT_FILE)) {
      try {
        const old = JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE, 'utf8'));
        if (old && old.text) {
          const initList = [{
            id: 'ann_' + Date.now(),
            title: old.title || 'تعميم إداري رسمي',
            text: old.text,
            priority: old.priority || 'normal',
            targetType: 'all',
            targetAgencies: [],
            targetNames: 'كافة الوكلاء في المنظومة',
            scheduleType: 'now',
            scheduledAt: null,
            createdAt: old.createdAt || new Date().toISOString(),
            updatedAt: old.updatedAt || new Date().toISOString(),
            active: old.active !== false
          }];
          fs.writeFileSync(ANNOUNCEMENTS_LIST_FILE, JSON.stringify(initList, null, 2), 'utf8');
          return initList;
        }
      } catch (_) {}
    }
    return [];
  }
  try {
    const list = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_LIST_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (_) { return []; }
}

function saveAnnouncementsList(list) {
  try {
    fs.writeFileSync(ANNOUNCEMENTS_LIST_FILE, JSON.stringify(list, null, 2), 'utf8');
    // أيضاً تحديث أول تعميم نشط في announcement.json لضمان التوافقية مع الأنظمة السابقة
    const activeFirst = list.find(a => a.active);
    fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify(activeFirst || { active: false, title: '', text: '' }, null, 2), 'utf8');
  } catch (_) {}
}

function getActiveAnnouncementsForUser(agencyNumber, userRole, userId, username) {
  const all = getAnnouncementsList();
  const now = Date.now();

  return all.filter(ann => {
    if (!ann.active) return false;

    // فحص الجدولة الزمنية: إذا كان مجدولاً في المستقبل، لا يظهر إلا عندما يحين وقته
    if (ann.scheduleType === 'scheduled' && ann.scheduledAt) {
      const schTime = new Date(ann.scheduledAt).getTime();
      if (now < schTime) return false;
    }

    // الأونر يرى كافة التعاميم
    if (userRole === 'owner') return true;

    // فحص الجمهور المستهدف
    if (!ann.targetType || ann.targetType === 'all') return true;

    if (ann.targetType === 'specific') {
      const agencies = (Array.isArray(ann.targetAgencies) ? ann.targetAgencies : [])
        .map(a => normalizeDigits(a).toLowerCase().trim());
      const normAgency = normalizeDigits(agencyNumber).toLowerCase().trim();
      const normUser = normalizeDigits(userId).toLowerCase().trim();
      const normUname = normalizeDigits(username).toLowerCase().trim();

      if (normAgency && agencies.includes(normAgency)) return true;
      if (normUser && agencies.includes(normUser)) return true;
      if (normUname && agencies.includes(normUname)) return true;
      return false;
    }

    return true;
  });
}

function getAnnouncement() {
  const list = getAnnouncementsList();
  return list.find(a => a.active) || { active: false, title: '', text: '', priority: 'normal' };
}
function saveAnnouncement(data) {
  let list = getAnnouncementsList();
  if (data.id) {
    const idx = list.findIndex(a => a.id === data.id);
    if (idx !== -1) list[idx] = { ...list[idx], ...data };
    else list.unshift(data);
  } else {
    list.unshift(data);
  }
  saveAnnouncementsList(list);
}

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
  let list = [];
  if (fs.existsSync(AGENTS_FILE)) {
    try { list = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8')); } catch (_) { list = []; }
  }
  // Ensure default agent 868 is always present
  if (!list.some(a => String(a.agencyNumber) === '868')) {
    list.unshift({
      id: 'agent_868',
      username: 'user_868',
      password: '0000',
      name: 'فاضل عباس كريم',
      agencyNumber: '868',
      licenseNumber: '000699',
      type: 'ghiz',
      governorate: 'ذي قار',
      branch: 'فرع تموين ذي قار',
      createdAt: '2026-09-12T05:54:11.801Z',
      isFrozen: false
    });
  }
  return list;
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
        password: '0000',
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
    latestVersion: APP_VERSION,
    versionCode: APP_VERSION_CODE,
    bundleUrl: 'https://wakil-api.onrender.com/index.html',
    downloadUrl: APK_DOWNLOAD_URL,
    notes: 'إصدار v1.0.39: اعتماد كلمة مرور من 4 أرقام، إظهار كلمة المرور بالكامل عند تعديل معلومات الوكيل، ودعم مستشعر البصمة والوجه المدمج بنظام BiometricPrompt الحديث.',
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


// مسح الطرد القديم عند تسجيل الدخول الجديد بكلمة المرور
app.post('/api/sessions/clear-revoke', (req, res) => {
  const { deviceId, agencyNumber, userId } = req.body;
  if (!deviceId) return res.json({ success: true });
  
  let revokedList = getRevokedSessions();
  const initialLen = revokedList.length;
  revokedList = revokedList.filter(r => {
    if (r.deviceId === deviceId) {
      if (agencyNumber && String(r.agencyNumber) === String(agencyNumber)) return false;
      if (userId && r.userId === userId) return false;
    }
    return true;
  });
  if (revokedList.length !== initialLen) {
    saveRevokedSessions(revokedList);
  }
  res.json({ success: true, message: 'Revocation cleared' });
});

// ══ 1. AUTHENTICATION (تسجيل الدخول الذكي مع تسجيل الجهاز والجلسة) ══
app.post('/api/login', (req, res) => {
  const { username, password, agentType, deviceInfo } = req.body;

  const rawU = (username || '').trim();
  const rawP = (password || '').trim();
  const u = normalizeDigits(rawU).toLowerCase();
  const p = normalizeDigits(rawP);

  const devId = (deviceInfo && deviceInfo.deviceId) || ('dev_' + Math.random().toString(36).substr(2, 8));
  const devName = (deviceInfo && deviceInfo.deviceName) || 'هاتف غير معروف';
  const devPlat = (deviceInfo && deviceInfo.platform) || 'Android';

  // 1. فحص حساب الأونر / المالك العام
  const owner = getOwnerConfig();
  const ownerPass = normalizeDigits(owner.password);
  if ((u === owner.username.toLowerCase() || u === 'owner' || u === 'admin') && (p === ownerPass || rawP === owner.password)) {
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const sessionToken = 'owner_session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    
    let sessions = getSessions();
    // إزالة أي جلسة قديمة ملغاة لنفس الجهاز لضمان عدم وجود طرد مسبق
    sessions = sessions.filter(s => s.deviceId !== devId);
    sessions.push({
      id: sessionId,
      token: sessionToken,
      userId: 'owner',
      userRole: 'owner',
      agencyNumber: null,
      username: owner.username,
      name: owner.name || 'المالك العام للمنظومة',
      deviceId: devId,
      deviceName: devName,
      platform: devPlat,
      loginAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      isOnline: true,
      status: 'active'
    });
    saveSessions(sessions);

    return res.json({
      success: true,
      role: 'owner',
      token: sessionToken,
      sessionId: sessionId,
      deviceId: devId,
      owner: {
        username: owner.username,
        name: owner.name || 'المالك العام للمنظومة',
        role: 'owner'
      }
    });
  }

  // 2. فحص حسابات الوكلاء المسجلين (مرونة كاملة: اسم المستخدم أو رمز الوكالة أو اسم الوكيل)
  const agents = getAgents();
  const matched = agents.find(ag => {
    const agUser = normalizeDigits(ag.username).toLowerCase();
    const agAgency = normalizeDigits(ag.agencyNumber);
    const agName = (ag.name || '').trim().toLowerCase();
    const agPass = normalizeDigits(ag.password);

    const userMatches = (
      agUser === u || 
      agAgency === u || 
      agName === rawU.toLowerCase() || 
      ag.id.toLowerCase() === u ||
      ag.id.toLowerCase() === ('agent_' + u)
    );

    let passMatches = (agPass === p || ag.password === rawP);
    // مرونة تامة لكلمات المرور الصفرية الشائعة (0000 أو 00000000)
    if (!passMatches && (agPass === '0000' || agPass === '00000000')) {
      if (p === '0000' || p === '00000000' || rawP === '0000' || rawP === '00000000') {
        passMatches = true;
      }
    }

    return userMatches && passMatches;
  });

  if (matched) {
    // فحص هل الحساب مجمّد من قبل الأونر؟
    if (matched.isFrozen) {
      return res.status(403).json({
        success: false,
        isFrozen: true,
        message: 'تم قفل وتجميد حساب الوكالة من قبل الإدارة العامة للمنظومة. يرجى مراجعة المسؤول.'
      });
    }

    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const sessionToken = 'agent_session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);

    let sessions = getSessions();
    // إزالة أي سجلات قديمة أو ملغاة لنفس الجهاز
    sessions = sessions.filter(s => s.deviceId !== devId);
    sessions.push({
      id: sessionId,
      token: sessionToken,
      userId: matched.id,
      userRole: 'agent',
      agencyNumber: String(matched.agencyNumber),
      username: matched.username,
      name: matched.name,
      deviceId: devId,
      deviceName: devName,
      platform: devPlat,
      loginAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      isOnline: true,
      status: 'active'
    });
    saveSessions(sessions);

    // مسح أي طرد دائم مسجل لهذا الجهاز فور تسجيل الدخول الصحيح بكلمة المرور
    let revokedList = getRevokedSessions();
    const prevLen = revokedList.length;
    revokedList = revokedList.filter(r => !(r.deviceId === devId && (String(r.agencyNumber) === String(matched.agencyNumber) || r.userId === matched.id)));
    if (revokedList.length !== prevLen) {
      saveRevokedSessions(revokedList);
    }

    return res.json({
      success: true,
      role: 'agent',
      token: sessionToken,
      sessionId: sessionId,
      deviceId: devId,
      agent: {
        id: matched.id,
        name: matched.name,
        agencyNumber: matched.agencyNumber,
        licenseNumber: matched.licenseNumber || '',
        type: matched.type || agentType || 'ghiz',
        governorate: matched.governorate || 'ذي قار',
        branch: matched.branch || 'فرع تموين ذي قار',
        username: matched.username,
        isFrozen: false
      }
    });
  }

  return res.status(401).json({ success: false, message: 'اسم المستخدم أو رمز الوكالة أو كلمة المرور غير صحيحة' });
});

// ══ 1.1 SESSIONS & DEVICES MANAGEMENT (إدارة الأجهزة والجلسات) ══

// نبض الجلسة وفحص الحالة والتعاميم (Heartbeat & Ping)
app.post('/api/sessions/ping', (req, res) => {
  const { sessionId, sessionToken, deviceId, userRole, agencyNumber, userId, username, deviceInfo } = req.body;
  let sessions = getSessions();
  const userAnnouncements = getActiveAnnouncementsForUser(agencyNumber, userRole, userId, username);
  const ann = userAnnouncements[0] || { active: false, title: '', text: '' };
  const nowIso = new Date().toISOString();

  // 1. المالك العام (Owner) محمي بنسبة 100% - لا يمكن طرده أو تجميده نهائياً
  const isOwner = (userRole === 'owner');

  if (isOwner) {
    let activeSession = sessions.find(s => 
      ((sessionId && s.id === sessionId) || 
       (sessionToken && s.token === sessionToken) || 
       (deviceId && s.deviceId === deviceId && (s.userRole === 'owner' || s.userId === 'owner'))) && 
      s.status === 'active'
    );

    if (activeSession) {
      activeSession.lastActive = nowIso;
      activeSession.isOnline = true;
      activeSession.agencyNumber = null; // المالك ليس له رمز وكالة
      if (deviceInfo && deviceInfo.deviceName) activeSession.deviceName = deviceInfo.deviceName;
      if (deviceInfo && deviceInfo.platform) activeSession.platform = deviceInfo.platform;
      saveSessions(sessions);
    } else if (deviceId || sessionId) {
      const devName = (deviceInfo && deviceInfo.deviceName) || 'هاتف المالك';
      const devPlat = (deviceInfo && deviceInfo.platform) || 'Android';
      const newSession = {
        id: sessionId || ('sess_owner_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
        token: sessionToken || ('tok_owner_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8)),
        userId: 'owner',
        userRole: 'owner',
        agencyNumber: null,
        username: 'admin',
        name: 'المالك العام للمنظومة',
        deviceId: deviceId || ('dev_' + Math.random().toString(36).substr(2, 8)),
        deviceName: devName,
        platform: devPlat,
        loginAt: nowIso,
        lastActive: nowIso,
        isOnline: true,
        status: 'active'
      };
      sessions.push(newSession);
      saveSessions(sessions);
    }

    return res.json({
      success: true,
      active: true,
      isOwner: true,
      announcement: ann,
      announcements: userAnnouncements
    });
  }

  // 2. فحص هل حساب الوكيل مجمّد؟ (للوكلاء فقط)
  if (agencyNumber) {
    const agents = getAgents();
    const ag = agents.find(a => String(a.agencyNumber) === String(agencyNumber));
    if (ag && ag.isFrozen) {
      return res.json({
        success: false,
        isFrozen: true,
        message: 'تم تجميد حساب الوكالة من قبل الإدارة العامة للمنظومة',
        announcement: ann
      });
    }
  }

  // 4. البحث عن الجلسة النشطة أولاً
  let activeSession = sessions.find(s => 
    ((sessionId && s.id === sessionId) || 
     (sessionToken && s.token === sessionToken) || 
     (deviceId && s.deviceId === deviceId && s.userRole === 'agent')) && 
    s.status === 'active'
  );

  // 3. فحص الطرد الدائم (سواء كان الوكيل أونلاين أو كان أوفلاين وعاد للتطبيق لاحقاً)
  const revokedList = getRevokedSessions();
  const explicitRevoked = revokedList.find(r => {
    // إذا كان الطرد صريحاً بنفس رقم الجلسة أو التوكن
    if (sessionId && r.sessionId === sessionId) return true;
    if (sessionToken && r.sessionToken === sessionToken) return true;

    // إذا كان الطرد بمعرف الجهاز
    if (deviceId && r.deviceId === deviceId && (agencyNumber ? String(r.agencyNumber) === String(agencyNumber) : true)) {
      // إذا كانت الجلسة الحالية قد سجلت دخول بعد تاريخ الطرد، فهذا تسجيل دخول جديد شرعي ولا يُطرد
      if (activeSession && activeSession.loginAt && r.revokedAt) {
        const loginTime = new Date(activeSession.loginAt).getTime();
        const revokeTime = new Date(r.revokedAt).getTime();
        if (loginTime >= revokeTime) return false;
      }
      return true;
    }
    return false;
  });

  if (explicitRevoked) {
    return res.json({
      success: false,
      revoked: true,
      message: explicitRevoked.revokeReason || 'تم إنهاء جلستك وطرد هذا الجهاز من قبل الإدارة',
      announcement: ann,
      version: APP_VERSION,
      versionCode: APP_VERSION_CODE,
      downloadUrl: APK_DOWNLOAD_URL
    });
  }



  if (activeSession) {
    activeSession.lastActive = nowIso;
    activeSession.isOnline = true;
    if (deviceInfo && deviceInfo.deviceName) activeSession.deviceName = deviceInfo.deviceName;
    if (deviceInfo && deviceInfo.platform) activeSession.platform = deviceInfo.platform;
    if (req.body.location && req.body.location.lat && req.body.location.lng) {
      activeSession.lastLocation = req.body.location;
    }
    saveSessions(sessions);
  }

  // حفظ الموقع في سجل الوكيل الدائم بهدوء
  if (req.body.location && req.body.location.lat && req.body.location.lng && (agencyNumber || userId)) {
    try {
      const allAgentsList = getAgents();
      const agRecord = allAgentsList.find(a => (agencyNumber && String(a.agencyNumber) === String(agencyNumber)) || (userId && a.id === userId));
      if (agRecord) {
        agRecord.lastLocation = {
          lat: req.body.location.lat,
          lng: req.body.location.lng,
          accuracy: req.body.location.accuracy || 10,
          updatedAt: req.body.location.updatedAt || nowIso
        };
        saveAgents(allAgentsList);
      }
    } catch (_) {}
  } else if (deviceId || sessionId) {
    const agents = getAgents();
    const matchedAg = agents.find(a => 
      (agencyNumber && String(a.agencyNumber) === String(agencyNumber))
    );
    const devName = (deviceInfo && deviceInfo.deviceName) || 'هاتف متصل';
    const devPlat = (deviceInfo && deviceInfo.platform) || 'Android';
    const newSession = {
      id: sessionId || ('sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
      token: sessionToken || ('tok_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8)),
      userId: matchedAg ? matchedAg.id : (agencyNumber ? 'agent_' + agencyNumber : 'agent'),
      userRole: 'agent',
      agencyNumber: agencyNumber ? String(agencyNumber) : null,
      username: matchedAg ? matchedAg.username : (agencyNumber || 'user'),
      name: matchedAg ? matchedAg.name : 'وكيل',
      deviceId: deviceId || ('dev_' + Math.random().toString(36).substr(2, 8)),
      deviceName: devName,
      platform: devPlat,
      loginAt: nowIso,
      lastActive: nowIso,
      isOnline: true,
      status: 'active'
    };
    sessions.push(newSession);
    saveSessions(sessions);
  }

  res.json({
    success: true,
    active: true,
    announcement: ann,
    announcements: userAnnouncements
  });
});

app.post('/api/sessions/offline', (req, res) => {
  const { sessionId, sessionToken, deviceId } = req.body;
  let sessions = getSessions();
  let updated = false;

  sessions.forEach(s => {
    if ((sessionId && s.id === sessionId) || 
        (sessionToken && s.token === sessionToken) || 
        (deviceId && s.deviceId === deviceId)) {
      s.isOnline = false;
      s.lastActive = new Date().toISOString();
      updated = true;
    }
  });

  if (updated) {
    saveSessions(sessions);
  }
  res.json({ success: true, offline: true });
});

// جلب قائمة الأجهزة المتصلة بحساب الوكيل مع حالة أونلاين/أوفلاين
app.get('/api/sessions/my', (req, res) => {
  const agencyNumber = req.query.agencyNumber;
  const username = req.query.username;
  const sessions = getSessions();
  const now = Date.now();

  let mySessions = sessions.filter(s => {
    if (s.status !== 'active') return false;
    if (agencyNumber && String(s.agencyNumber) === String(agencyNumber)) return true;
    if (username && s.username && s.username.toLowerCase() === username.toLowerCase()) return true;
    return false;
  });

  const formatted = mySessions.map(s => {
    const diffSec = Math.floor((now - new Date(s.lastActive || s.loginAt).getTime()) / 1000);
    const isOnline = (s.isOnline !== false) && (diffSec <= 15);
    return {
      ...s,
      presence: isOnline ? 'online' : 'offline',
      diffSec
    };
  });

  res.json({
    success: true,
    total: formatted.length,
    sessions: formatted
  });
});

// طرد جهاز للوكيل أو من الإعدادات (مع تأكيد كلمة مرور الوكيل أو المالك)
app.post('/api/sessions/revoke', (req, res) => {
  const { agencyNumber, username, password, targetSessionId, revokeAllOthers, currentSessionId } = req.body;

  if (!password) {
    return res.status(401).json({ success: false, message: 'يرجى إدخال كلمة المرور لتأكيد الخروج' });
  }

  const p = password.trim();
  const owner = getOwnerConfig();
  const agents = getAgents();
  const matchedAg = agents.find(a => 
    (agencyNumber && String(a.agencyNumber) === String(agencyNumber)) ||
    (username && a.username && a.username.toLowerCase() === username.toLowerCase())
  );

  const isOwnerAuth = (p === owner.password);
  const isAgentAuth = (matchedAg && matchedAg.password === p);

  if (!isOwnerAuth && !isAgentAuth) {
    return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة لتأكيد طرد الجهاز!' });
  }

  let sessions = getSessions();
  let revokedCount = 0;

  sessions.forEach(s => {
    // لا يمكن لأي وكيل طرد جلسة مالك
    if (!isOwnerAuth && (s.userRole === 'owner' || s.userId === 'owner')) return;

    if (revokeAllOthers) {
      const matchOwner = isOwnerAuth && (s.userRole === 'owner' || s.userId === 'owner');
      const matchAgent = isAgentAuth && (
        s.userId === matchedAg.id || 
        String(s.agencyNumber) === String(matchedAg.agencyNumber) ||
        (s.username && matchedAg.username && s.username.toLowerCase() === matchedAg.username.toLowerCase())
      );

      if ((matchOwner || matchAgent) && s.id !== currentSessionId && s.status === 'active') {
        s.status = 'revoked';
        s.isOnline = false;
        s.revokedAt = new Date().toISOString();
        revokedCount++;
      }
    } else if (targetSessionId) {
      if (s.id === targetSessionId && s.status === 'active') {
        s.status = 'revoked';
        s.isOnline = false;
        s.revokedAt = new Date().toISOString();
        revokedCount++;
      }
    }
  });

  saveSessions(sessions);

  if (revokedCount === 0) {
    return res.status(404).json({ success: false, message: 'لم يتم العثور على الجهاز المطلوب أو تم طرده مسبقاً' });
  }

  res.json({ success: true, message: 'تم إنهاء الجلسة وطرد الجهاز فوراً بنجاح!', revokedCount });
});

// جلب أجهزة المالك (الأونر) المتصلة مع حالة أونلاين/أوفلاين
app.get('/api/owner/sessions/my', (req, res) => {
  const sessions = getSessions();
  const now = Date.now();
  const ownerSessions = sessions.filter(s => (s.userRole === 'owner' || s.userId === 'owner') && s.status === 'active');

  const formatted = ownerSessions.map(s => {
    const diffSec = Math.floor((now - new Date(s.lastActive || s.loginAt).getTime()) / 1000);
    const isOnline = (s.isOnline !== false) && (diffSec <= 15);
    return {
      ...s,
      presence: isOnline ? 'online' : 'offline',
      diffSec
    };
  });

  res.json({
    success: true,
    total: formatted.length,
    sessions: formatted
  });
});

// طرد جهاز من أجهزة الأونر (مع تأكيد كلمة مرور الأونر إجبارياً)
app.post('/api/owner/sessions/revoke-self', (req, res) => {
  const { password, targetSessionId, revokeAllOthers, currentSessionId } = req.body;
  const owner = getOwnerConfig();

  if (!password || password.trim() !== owner.password) {
    return res.status(401).json({ success: false, message: 'كلمة مرور المالك غير صحيحة لتأكيد طرد الجهاز!' });
  }

  let sessions = getSessions();
  let count = 0;
  if (revokeAllOthers) {
    sessions.forEach(s => {
      if ((s.userRole === 'owner' || s.userId === 'owner') && s.id !== currentSessionId && s.status === 'active') {
        s.status = 'revoked';
        s.isOnline = false;
        s.revokedAt = new Date().toISOString();
        count++;
      }
    });
  } else if (targetSessionId) {
    sessions.forEach(s => {
      if ((s.id === targetSessionId || s.deviceId === targetSessionId) && (s.userRole === 'owner' || s.userId === 'owner')) {
        s.status = 'revoked';
        s.isOnline = false;
        s.revokedAt = new Date().toISOString();
        count++;
      }
    });
  }

  saveSessions(sessions);

  if (count === 0) {
    return res.status(404).json({ success: false, message: 'لم يتم العثور على الجهاز أو تم طرده مسبقاً' });
  }

  res.json({ success: true, message: 'تم تسجيل خروج جهاز المالك بنجاح!', count });
});

// جلب أجهزة وكيل معين من قبل الأونر مع حالة أونلاين/أوفلاين
app.get('/api/owner/agents/:id/sessions', (req, res) => {
  const id = req.params.id;
  const agents = getAgents();
  const ag = agents.find(a => a.id === id || String(a.agencyNumber) === id);
  if (!ag) return res.status(404).json({ success: false, message: 'الوكيل غير موجود' });

  const sessions = getSessions();
  const now = Date.now();
  const agentSessions = sessions.filter(s => 
    (s.userId === ag.id || 
     String(s.agencyNumber) === String(ag.agencyNumber) || 
     (s.username && ag.username && s.username.toLowerCase() === ag.username.toLowerCase())) && 
    s.status === 'active'
  );

  const formatted = agentSessions.map(s => {
    const diffSec = Math.floor((now - new Date(s.lastActive || s.loginAt).getTime()) / 1000);
    const isOnline = (s.isOnline !== false) && (diffSec <= 15);
    return {
      ...s,
      presence: isOnline ? 'online' : 'offline',
      diffSec
    };
  });

  res.json({
    success: true,
    agent: { id: ag.id, name: ag.name, agencyNumber: ag.agencyNumber },
    total: formatted.length,
    sessions: formatted
  });
});

// طرد أجهزة وكيل من قبل الأونر (بدون أي كلمة مرور للوكيل مطلقاً)
app.post('/api/owner/sessions/revoke', (req, res) => {
  const { targetSessionId, agentId, agencyNumber, revokeAll, reason } = req.body;
  const kickReason = (reason && reason.trim()) ? reason.trim() : 'تم إنهاء جلستك وطرد هذا الجهاز من قبل الإدارة العامة للمنظومة.';
  let sessions = getSessions();
  let revokedList = getRevokedSessions();
  let count = 0;
  const nowIso = new Date().toISOString();

  sessions.forEach(s => {
    // حماية تامة للمالك: لا يجوز طرد أو إلغاء أي جلسة تابعة للمالك مطلقاً هنا
    if (s.userRole === 'owner' || s.userId === 'owner') return;

    if (revokeAll) {
      const matchAg = (agentId && (s.userId === agentId || s.userId === 'agent_' + agentId)) ||
                      (agencyNumber && (String(s.agencyNumber) === String(agencyNumber) || s.userId === 'agent_' + agencyNumber));
      if (matchAg && s.status === 'active') {
        s.status = 'revoked';
        s.isOnline = false;
        s.revokedAt = nowIso;
        s.revokeReason = kickReason;
        count++;

        revokedList.push({
          sessionId: s.id,
          sessionToken: s.token,
          deviceId: s.deviceId,
          agencyNumber: s.agencyNumber,
          userId: s.userId,
          revokedAt: nowIso,
          revokeReason: kickReason,
          revokedBy: 'owner'
        });
      }
    } else if (targetSessionId) {
      if ((s.id === targetSessionId || s.deviceId === targetSessionId) && s.status === 'active') {
        s.status = 'revoked';
        s.isOnline = false;
        s.revokedAt = nowIso;
        s.revokeReason = kickReason;
        count++;

        revokedList.push({
          sessionId: s.id,
          sessionToken: s.token,
          deviceId: s.deviceId,
          agencyNumber: s.agencyNumber,
          userId: s.userId,
          revokedAt: nowIso,
          revokeReason: kickReason,
          revokedBy: 'owner'
        });
      }
    }
  });

  // إذا كانت الجلسة أوفلاين وغير موجودة في الجلسات النشطة، يتم تخليد الطرد الدائم أيضاً
  if (count === 0 && targetSessionId) {
    revokedList.push({
      sessionId: targetSessionId,
      agencyNumber: agencyNumber || null,
      userId: agentId || null,
      revokedAt: nowIso,
      revokeReason: kickReason,
      revokedBy: 'owner'
    });
    count = 1;
  }

  saveSessions(sessions);
  saveRevokedSessions(revokedList);
  res.json({ success: true, message: 'تم طرد جهاز الوكيل فوراً بنجاح وحفظ سبب الطرد!', count, reason: kickReason });
});

// ══ 1.2 FREEZE / SUSPEND AGENCY (قفل وتجميد حساب الوكالة) ══
app.post('/api/owner/agents/:id/freeze', (req, res) => {
  const id = req.params.id;
  const agents = getAgents();
  const ag = agents.find(a => a.id === id || String(a.agencyNumber) === id);
  if (!ag) return res.status(404).json({ success: false, message: 'الوكيل غير موجود' });

  ag.isFrozen = true;
  ag.frozenAt = new Date().toISOString();
  saveAgents(agents);

  // طرد كل جلساته النشطة فوراً
  let sessions = getSessions();
  sessions.forEach(s => {
    if (s.userId === ag.id || String(s.agencyNumber) === String(ag.agencyNumber)) {
      s.status = 'revoked';
    }
  });
  saveSessions(sessions);

  console.log(`Agent frozen: ${ag.name} (${ag.agencyNumber})`);
  res.json({
    success: true,
    message: `تم قفل وتجميد حساب الوكالة (${ag.name}) فوراً بنجاح!`,
    agent: ag
  });
});

app.post('/api/owner/agents/:id/unfreeze', (req, res) => {
  const id = req.params.id;
  const agents = getAgents();
  const ag = agents.find(a => a.id === id || String(a.agencyNumber) === id);
  if (!ag) return res.status(404).json({ success: false, message: 'الوكيل غير موجود' });

  ag.isFrozen = false;
  delete ag.frozenAt;
  saveAgents(agents);

  console.log(`Agent unfrozen: ${ag.name} (${ag.agencyNumber})`);
  res.json({
    success: true,
    message: `تم فك التجميد وتفعيل حساب الوكالة (${ag.name}) بنجاح!`,
    agent: ag
  });
});

// ══ 1.3 QUICK RESET AGENT PASSWORD (إعادة تعيين كلمة مرور الوكيل فورياً) ══
app.post('/api/owner/agents/:id/reset-password', (req, res) => {
  const id = req.params.id;
  const { newPassword } = req.body;
  if (!newPassword || !newPassword.trim()) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال كلمة المرور الجديدة' });
  }

  const agents = getAgents();
  const ag = agents.find(a => a.id === id || String(a.agencyNumber) === id);
  if (!ag) return res.status(404).json({ success: false, message: 'الوكيل غير موجود' });

  ag.password = newPassword.trim();
  ag.passwordUpdatedAt = new Date().toISOString();
  saveAgents(agents);

  // إنهاء الجلسات النشطة لكي يطالبه النظام بكلمة السر الجديدة
  let sessions = getSessions();
  sessions.forEach(s => {
    if (s.userId === ag.id || String(s.agencyNumber) === String(ag.agencyNumber)) {
      s.status = 'revoked';
    }
  });
  saveSessions(sessions);

  console.log(`Password reset for agent: ${ag.name} (${ag.agencyNumber})`);
  res.json({
    success: true,
    message: `تم تعيين كلمة المرور الجديدة للوكيل (${ag.name}) بنجاح!`,
    agent: ag
  });
});

// ══ 1.4 BROADCAST ANNOUNCEMENTS (التعاميم الإدارية الفورية للوكلاء) ══

// جلب كافة التعاميم للأونر (قائمة التعاميم الكاملة: النشطة والمجدولة)
app.get('/api/owner/announcements', (req, res) => {
  const list = getAnnouncementsList();
  res.json({
    success: true,
    total: list.length,
    announcements: list
  });
});

// إنشاء أو حفظ تعديل تعميم إداري
app.post('/api/owner/announcements', (req, res) => {
  const { id, title, text, message, priority, targetType, targetAgencies, targetNames, scheduleType, scheduledAt, isScheduled, active } = req.body;
  const content = (text || message || '').trim();
  if (!content) {
    return res.status(400).json({ success: false, message: 'يرجى كتابة نص التعميم' });
  }

  let list = getAnnouncementsList();
  const nowIso = new Date().toISOString();
  const isSch = (scheduleType === 'scheduled') || (isScheduled === true);
  const finalScheduleType = isSch ? 'scheduled' : 'now';
  const finalScheduledAt = (isSch && scheduledAt) ? scheduledAt : null;

  let targetAnnouncement = null;
  if (id) {
    const idx = list.findIndex(a => a.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        title: (title || list[idx].title || 'تعميم إداري رسمي').trim(),
        text: content,
        priority: priority === 'urgent' ? 'urgent' : 'normal',
        targetType: targetType === 'specific' ? 'specific' : 'all',
        targetAgencies: Array.isArray(targetAgencies) ? targetAgencies : [],
        targetNames: targetNames || (targetType === 'specific' ? 'وكلاء محددون' : 'كافة الوكلاء'),
        scheduleType: finalScheduleType,
        scheduledAt: finalScheduledAt,
        active: active !== undefined ? !!active : true,
        updatedAt: nowIso
      };
      targetAnnouncement = list[idx];
    }
  }

  if (!targetAnnouncement) {
    targetAnnouncement = {
      id: 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      title: (title || 'تعميم إداري رسمي').trim(),
      text: content,
      priority: priority === 'urgent' ? 'urgent' : 'normal',
      targetType: targetType === 'specific' ? 'specific' : 'all',
      targetAgencies: Array.isArray(targetAgencies) ? targetAgencies : [],
      targetNames: targetNames || (targetType === 'specific' ? 'وكلاء محددون' : 'كافة الوكلاء في المنظومة'),
      scheduleType: finalScheduleType,
      scheduledAt: finalScheduledAt,
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    list.unshift(targetAnnouncement);
  }

  saveAnnouncementsList(list);
  console.log('Announcement saved:', targetAnnouncement.title, 'Target:', targetAnnouncement.targetNames);
  res.json({
    success: true,
    message: 'تم حفظ ونشر التعميم الإداري بنجاح 📢',
    announcement: targetAnnouncement,
    announcements: list
  });
});

// حذف تعميم معين
app.delete('/api/owner/announcements/:id', (req, res) => {
  const id = req.params.id;
  let list = getAnnouncementsList();
  const initLen = list.length;
  list = list.filter(a => a.id !== id);

  if (list.length === initLen) {
    return res.status(404).json({ success: false, message: 'التعميم غير موجود أو تم حذفه مسبقاً' });
  }

  saveAnnouncementsList(list);
  res.json({ success: true, message: 'تم حذف التعميم الإداري المحدد بنجاح 🗑️', announcements: list });
});

// تفعيل أو تعطيل تعميم معين
app.post('/api/owner/announcements/:id/toggle', (req, res) => {
  const id = req.params.id;
  let list = getAnnouncementsList();
  const ann = list.find(a => a.id === id);
  if (!ann) return res.status(404).json({ success: false, message: 'التعميم غير موجود' });

  ann.active = !ann.active;
  ann.updatedAt = new Date().toISOString();
  saveAnnouncementsList(list);

  res.json({
    success: true,
    message: ann.active ? 'تم تفعيل وعرض التعميم بنجاح' : 'تم إيقاف عرض التعميم مؤقتاً',
    announcement: ann,
    announcements: list
  });
});

// جلب التعاميم النشطة للوكيل المعني
app.get('/api/announcements', (req, res) => {
  const agencyNumber = req.query.agencyNumber;
  const userRole = req.query.userRole || 'agent';
  const activeList = getActiveAnnouncementsForUser(agencyNumber, userRole);
  res.json({
    success: true,
    total: activeList.length,
    announcements: activeList
  });
});

// مسارات قديمة للتوافقية
app.get('/api/announcement', (req, res) => {
  res.json(getAnnouncement());
});
app.post('/api/owner/announcement', (req, res) => {
  req.url = '/api/owner/announcements';
  app._router.handle(req, res);
});
app.delete('/api/owner/announcement', (req, res) => {
  let list = getAnnouncementsList();
  if (list.length > 0) {
    list[0].active = false;
    saveAnnouncementsList(list);
  }
  res.json({ success: true, message: 'تم إيقاف التعميم الحالي' });
});

// ══ 1.5 FULL SYSTEM BACKUP (تنزيل نسخة احتياطية شاملة للمنظومة) ══
app.get('/api/owner/backup/full', (req, res) => {
  const agents = getAgents();
  const citizens = getAllCitizensMap();
  const archive = getAllArchiveMap();
  const owner = getOwnerConfig();
  const announcement = getAnnouncement();
  const sessions = getSessions();

  const totalCitizensCount = Object.values(citizens).reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0);

  const backupData = {
    meta: {
      system: 'WAKIL Cloud Management System',
      systemVersion: '1.0.20',
      exportedAt: new Date().toISOString(),
      totalAgents: agents.length,
      totalCitizens: totalCitizensCount
    },
    agents,
    citizens,
    archive,
    owner: {
      username: owner.username,
      name: owner.name,
      role: owner.role
    },
    announcement,
    activeSessions: sessions.filter(s => s.status === 'active')
  };

  const filename = `wakil_full_system_backup_${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(backupData, null, 2));
});

// ══ 2. OWNER MANAGEMENT APIS (خاصة بالمالك فقط) ══

// جلب قائمة الوكلاء وإحصائياتهم الشاملة
app.get(['/api/owner/agents', '/api/agents'], (req, res) => {
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
  
// ══════════════════════════════════════════════════════════════════
// ══ SECRET GEO VAULT (سجل المواقع الجغرافي المشفر للأونر) ══
// ══════════════════════════════════════════════════════════════════

app.post('/api/owner/geo-vault/verify', (req, res) => {
  const { pin } = req.body;
  const owner = getOwnerConfig();
  const validPin = owner.vaultPin || owner.password || 'admin2026';
  if (String(pin || '').trim() === String(validPin).trim()) {
    return res.json({ success: true, message: 'تم التحقق بنجاح' });
  }
  return res.status(401).json({ success: false, message: 'رمز الأمان غير صحيح' });
});

app.post('/api/owner/geo-vault/update-pin', (req, res) => {
  const { currentPin, newPin } = req.body;
  const owner = getOwnerConfig();
  const validPin = owner.vaultPin || owner.password || 'admin2026';
  if (String(currentPin || '').trim() !== String(validPin).trim()) {
    return res.status(401).json({ success: false, message: 'رمز الأمان الحالي غير صحيح' });
  }
  if (!newPin || String(newPin).trim().length < 4) {
    return res.status(400).json({ success: false, message: 'رمز الأمان الجديد يجب أن يتكون من 4 أرقام على الأقل' });
  }
  owner.vaultPin = String(newPin).trim();
  saveOwnerConfig(owner);
  return res.json({ success: true, message: 'تم تحديث رمز الأمان بنجاح' });
});

app.get('/api/owner/geo-vault/agents-locations', (req, res) => {
  const pin = req.headers['x-vault-pin'] || req.query.pin;
  const owner = getOwnerConfig();
  const validPin = owner.vaultPin || owner.password || 'admin2026';
  if (String(pin || '').trim() !== String(validPin).trim()) {
    return res.status(401).json({ success: false, message: 'غير مصرح: يرجى إدخال رمز الأمان السري' });
  }

  const agents = getAgents();
  const sessions = getSessions();
  const now = Date.now();

  const result = agents.map(ag => {
    const agSessions = sessions.filter(s => 
      s.userRole === 'agent' && (String(s.agencyNumber) === String(ag.agencyNumber) || s.userId === ag.id)
    );
    const latestSession = agSessions.sort((a,b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime())[0];
    
    const isOnline = latestSession ? (now - new Date(latestSession.lastActive).getTime() < 3 * 60 * 1000) : false;
    const location = (latestSession && latestSession.lastLocation) || ag.lastLocation || null;

    return {
      id: ag.id,
      name: ag.name,
      agencyNumber: ag.agencyNumber,
      username: ag.username,
      type: ag.type || 'ghiz',
      isOnline,
      lastActive: latestSession ? latestSession.lastActive : null,
      deviceName: latestSession ? latestSession.deviceName : 'غير متصل',
      location
    };
  });

  res.json({ success: true, agents: result });
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}
