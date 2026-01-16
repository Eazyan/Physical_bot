import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002;
const DB_FILE = path.join(__dirname, 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Инициализация
try {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ students: [], submissions: [] }, null, 2));
} catch (err) {
    console.error('Ошибка инициализации:', err);
}

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Логирование API запросов
app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
        console.log(`[API] ${req.method} ${req.url}`);
    }
    next();
});

// === API ROUTES ===
app.get('/health', (req, res) => res.send('OK'));

// Функция для обработки API запросов
const handleApiStudents = {
    get: (req, res) => res.json(readDB().students),
    post: (req, res) => {
        const db = readDB();
        const student = req.body;
        const index = db.students.findIndex(s => s.id === student.id);
        if (index !== -1) db.students[index] = { ...db.students[index], ...student };
        else db.students.push(student);
        writeDB(db);
        res.json({ success: true, student });
    }
};

const handleApiSubmissions = {
    get: (req, res) => res.json(readDB().submissions),
    post: (req, res) => {
        const db = readDB();
        const { submission, videoBase64 } = req.body;
        let finalSub = { ...submission };

        if (videoBase64) {
            const fileName = `video_${Date.now()}.mp4`;
            const filePath = path.join(UPLOADS_DIR, fileName);
            const base64Data = videoBase64.replace(/^data:video\/\w+;base64,/, "");
            fs.writeFileSync(filePath, base64Data, 'base64');
            finalSub.videoUrl = `/phys-app/uploads/${fileName}`;
        }

        db.submissions.unshift(finalSub);
        writeDB(db);
        res.json({ success: true, submission: finalSub });
    }
};

const handleApiSubmissionsPatch = (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const { status } = req.body;
    const sub = db.submissions.find(s => s.id === id);
    if (sub) {
        sub.status = status;
        if (status === 'APPROVED') {
            const student = db.students.find(s => s.id === sub.studentId);
            if (student) student.classesMadeUp = (student.classesMadeUp || 0) + 1;
        }
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Not found' });
    }
};

// API маршруты с префиксом /phys-app/api (для работы через Apache)
app.get('/phys-app/api/students', handleApiStudents.get);
app.post('/phys-app/api/students', handleApiStudents.post);
app.get('/phys-app/api/submissions', handleApiSubmissions.get);
app.post('/phys-app/api/submissions', handleApiSubmissions.post);
app.patch('/phys-app/api/submissions/:id', handleApiSubmissionsPatch);

// API маршруты без префикса (для прямого доступа к localhost:3002)
app.get('/api/students', handleApiStudents.get);
app.post('/api/students', handleApiStudents.post);
app.get('/api/submissions', handleApiSubmissions.get);
app.post('/api/submissions', handleApiSubmissions.post);
app.patch('/api/submissions/:id', handleApiSubmissionsPatch);

// === РАЗДАЧА ФРОНТЕНДА И ФАЙЛОВ ===

// 1. Сначала раздаем загруженные файлы (с префиксом /phys-app и без него)
app.use('/phys-app/uploads', express.static(UPLOADS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// 2. Middleware для обработки запросов с префиксом /phys-app
// Когда Apache проксирует /phys-app/... на http://localhost:3002/phys-app/...,
// мы убираем префикс /phys-app перед обработкой статики (но НЕ для API)
app.use('/phys-app', (req, res, next) => {
    // НЕ трогаем API запросы - они обрабатываются отдельными маршрутами выше
    if (req.url.startsWith('/phys-app/api') || req.url.startsWith('/api')) {
        return next();
    }
    // Убираем префикс /phys-app из req.url для правильной обработки статики
    if (req.url.startsWith('/phys-app')) {
        req.url = req.url.replace(/^\/phys-app/, '') || '/';
    }
    next();
});

// 3. Раздаем статику из папки dist (собранный React проект)
// После middleware префикс /phys-app уже убран из req.url
app.use('/phys-app', express.static(path.join(__dirname, 'dist')));

// Также поддерживаем запросы без префикса (для прямого доступа)
app.use(express.static(path.join(__dirname, 'dist')));

// 4. Любой другой запрос перенаправляем на index.html (для SPA роутинга)
app.get('/phys-app*', (req, res) => {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Приложение еще не собрано. Выполните npm run build');
    }
});

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Приложение еще не собрано. Выполните npm run build');
    }
});

// === HELPERS ===
function readDB() {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } 
    catch (e) { return { students: [], submissions: [] }; }
}
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 БОТ ЗАПУЩЕН НА ПОРТУ ${PORT}`);
    console.log(`---------------------------------------------------`);
    console.log(`1. Соберите фронтенд: npm run build`);
    console.log(`2. Создайте туннель:  npx localtunnel --port ${PORT}`);
    console.log(`---------------------------------------------------\n`);
});