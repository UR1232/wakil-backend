const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// مسارات ملفات التخزين المحلي السحابي
const DATA_FILE = path.join(__dirname, 'citizens.json');
const ARCHIVE_FILE = path.join(__dirname, 'archive.json');

// تهيئة قاعدة البيانات بالـ 500 مواطن إذا لم تكن موجودة
function initData() {
    const seedPath = fs.existsSync(path.join(__dirname, 'citizens_500.json'))
        ? path.join(__dirname, 'citizens_500.json')
        : path.join(__dirname, '..', 'citizens_500.json');

    let current = [];
    if (fs.existsSync(DATA_FILE)) {
        try { current = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) {}
    }

    if (!fs.existsSync(DATA_FILE) || current.length === 0) {
        let initialCitizens = [];
        if (fs.existsSync(seedPath)) {
            initialCitizens = JSON.parse(fs.readFileSync(seedPath, 'utf8')).map(c => ({
                id: c.seq,
                name: c.name,
                cardNumber: c.cardNumber,
                oldCardNumber: c.oldCard || '',
                familyCount: c.total,
                eligibleCount: c.eligible,
                blockedCount: c.blocked,
                isWelfare: c.isWelfare,
                isReceived: false,
                receivedAt: null,
                items: { oil: false, flour: false, rice: false, sugar: false, paste: false, milk: false },
                customItems: [],
                notes: ''
            }));
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialCitizens, null, 2), 'utf8');
        console.log(`Initialized citizens database with ${initialCitizens.length} citizens.`);
    }

    if (!fs.existsSync(ARCHIVE_FILE)) {
        const sampleArchive = [
            {
                id: 'm_arch_prev1',
                monthTitle: 'شهر أيلول 2025',
                archivedAt: '2025-09-01T00:00:00.000Z',
                totalCitizens: 500,
                receivedCount: 485,
                citizens: []
            }
        ];
        fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(sampleArchive, null, 2), 'utf8');
    }
}

initData();

function getCitizens() {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveCitizens(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getArchive() {
    return JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
}

function saveArchive(data) {
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ══ ROUTES ══

// فحص صحة السيرفر
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'سيرفر وكيل لإدارة الحصص التموينية يعمل بنجاح على Render 🚀',
        version: '1.0.1',
        time: new Date().toISOString()
    });
});

// 0. التحقق من إصدار التطبيق والتحديث السحابي OTA
app.get('/api/app-version', (req, res) => {
    res.json({
        version: '1.0.2',
        notes: 'إلغاء الشريط الأبيض أعلى الشاشة وإزالة نص تنبيه الأوفلاين التوضيحي',
        updatedAt: new Date().toISOString()
    });
});

// خدمة ملف التطبيق لتحديث الأجهزة
app.get('/app.html', (req, res) => {
    const p1 = path.join(__dirname, 'public', 'index.html');
    const p2 = path.join(__dirname, 'index.html');
    if (fs.existsSync(p1)) return res.sendFile(p1);
    if (fs.existsSync(p2)) return res.sendFile(p2);
    res.status(404).send('Not found');
});

// إعادة تهيئة وتعبئة الـ 500 مواطن
app.get('/api/seed', (req, res) => {
    const seedPath = fs.existsSync(path.join(__dirname, 'citizens_500.json'))
        ? path.join(__dirname, 'citizens_500.json')
        : path.join(__dirname, '..', 'citizens_500.json');

    if (!fs.existsSync(seedPath)) {
        return res.status(404).json({ error: 'ملف citizens_500.json غير موجود' });
    }

    const initialCitizens = JSON.parse(fs.readFileSync(seedPath, 'utf8')).map(c => ({
        id: c.seq,
        name: c.name,
        cardNumber: c.cardNumber,
        oldCardNumber: c.oldCard || '',
        familyCount: c.total,
        eligibleCount: c.eligible,
        blockedCount: c.blocked,
        isWelfare: c.isWelfare,
        isReceived: false,
        receivedAt: null,
        items: { oil: false, flour: false, rice: false, sugar: false, paste: false, milk: false },
        customItems: [],
        notes: ''
    }));

    saveCitizens(initialCitizens);
    res.json({ success: true, message: `تمت تعبئة قاعدة البيانات بـ ${initialCitizens.length} مواطن بنجاح!`, count: initialCitizens.length });
});

// 1. تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password, agentType } = req.body;
    if (username === 'user' && password === '00000000') {
        res.json({
            success: true,
            token: 'wakil_session_token_' + Date.now(),
            agent: {
                name: 'فاضل عباس كريم',
                agencyNumber: '868',
                licenseNumber: '000699',
                type: agentType || 'food'
            }
        });
    } else {
        res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
});

// 2. جلب قائمة المواطنين والإحصائيات
app.get('/api/citizens', (req, res) => {
    const query = (req.query.search || '').trim().toLowerCase();
    let list = getCitizens();

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

// 3. تفاصيل مواطن واحد
app.get('/api/citizens/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const list = getCitizens();
    const citizen = list.find(c => c.id === id);

    if (!citizen) {
        return res.status(404).json({ error: 'المواطن غير موجود' });
    }
    res.json(citizen);
});

// 4. تحديث أو استلام الحصة وتعديل المواد
app.put('/api/citizens/:id', (req, res) => {
    const id = parseInt(req.params.id);
    let list = getCitizens();
    const idx = list.findIndex(c => c.id === id);

    if (idx === -1) {
        return res.status(404).json({ error: 'المواطن غير موجود' });
    }

    const current = list[idx];
    const { name, isReceived, items, customItems, notes } = req.body;

    list[idx] = {
        ...current,
        name: name !== undefined ? name : current.name,
        isReceived: isReceived !== undefined ? isReceived : current.isReceived,
        receivedAt: isReceived ? (current.receivedAt || new Date().toISOString()) : null,
        items: items !== undefined ? items : current.items,
        customItems: customItems !== undefined ? customItems : current.customItems,
        notes: notes !== undefined ? notes : current.notes
    };

    saveCitizens(list);
    res.json({ success: true, citizen: list[idx] });
});

// 5. إلغاء استلام الحصة
app.post('/api/citizens/:id/cancel', (req, res) => {
    const id = parseInt(req.params.id);
    let list = getCitizens();
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

    saveCitizens(list);
    res.json({ success: true, message: 'تم إلغاء الاستلام بنجاح', citizen: list[idx] });
});

// 6. إنهاء وأرشفة الشهر
app.post('/api/archive/finish-month', (req, res) => {
    const { monthTitle } = req.body;
    if (!monthTitle) {
        return res.status(400).json({ error: 'يرجى تزويد اسم للشهر الأرشيفي' });
    }

    const citizens = getCitizens();
    const receivedCount = citizens.filter(c => c.isReceived).length;

    const archive = getArchive();
    const snapshot = {
        id: 'm_arch_' + Date.now(),
        monthTitle: monthTitle.trim(),
        archivedAt: new Date().toISOString(),
        totalCitizens: citizens.length,
        receivedCount: receivedCount,
        citizens: citizens
    };

    archive.unshift(snapshot);
    saveArchive(archive);

    // تصفير الشهر الحالي لبدء شهر جديد
    const resetCitizens = citizens.map(c => ({
        ...c,
        isReceived: false,
        receivedAt: null,
        items: { oil: false, flour: false, rice: false, sugar: false, paste: false, milk: false },
        customItems: []
    }));
    saveCitizens(resetCitizens);

    res.json({
        success: true,
        message: `تمت أرشفة (${monthTitle}) بنجاح وتصفير السجل للشهر الجديد!`,
        snapshot
    });
});

// 7. جلب قائمة الأشهر المؤرشفة
app.get('/api/archive', (req, res) => {
    res.json(getArchive());
});

// 8. تعديل اسم الشهر في الأرشيف
app.put('/api/archive/:id', (req, res) => {
    const id = req.params.id;
    const { newTitle } = req.body;

    let archive = getArchive();
    const month = archive.find(m => m.id === id);

    if (!month) {
        return res.status(404).json({ error: 'الشهر غير موجود في الأرشيف' });
    }

    month.monthTitle = newTitle.trim();
    saveArchive(archive);

    res.json({ success: true, month });
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
