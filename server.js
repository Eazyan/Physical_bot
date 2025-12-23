
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

// Глобальная обработка ошибок для предотвращения "вылета"
process.on('uncaughtException', (err) => {
    console.error('КРИТИЧЕСКАЯ ОШИБКА (Uncaught):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('НЕОБРАБОТАННОЕ ПРЕРЫВАНИЕ (Rejection):', promise, 'причина:', reason);
});

// Инициализация папок и файлов
try {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        console.log('✅ Папка uploads создана');
    }
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ students: [], submissions: [] }, null, 2));
        console.log('✅ Файл db.json создан');
    }
} catch (err) {
    console.error('❌ Ошибка инициализации файловой системы:', err);
}

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Логгер запросов для отладки
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

app.use('/uploads', express.static(UPLOADS_DIR));

// Чтение и запись БД
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Проверка работоспособности (Health Check)
app.get('/', (req, res) => {
    res.send('🏃‍♂️ Сервер Физкульт-Бота работает!');
});

app.get('/api/students', (req, res) => res.json(readDB().students));

app.post('/api/students', (req, res) => {
    const db = readDB();
    const student = req.body;
    const index = db.students.findIndex(s => s.id === student.id);
    if (index !== -1) db.students[index] = { ...db.students[index], ...student };
    else db.students.push(student);
    writeDB(db);
    res.json({ success: true, student });
});

app.get('/api/submissions', (req, res) => res.json(readDB().submissions));

app.post('/api/submissions', (req, res) => {
    const db = readDB();
    const { submission, videoBase64 } = req.body;
    let finalSub = { ...submission };

    if (videoBase64) {
        const fileName = `video_${Date.now()}.mp4`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        const base64Data = videoBase64.replace(/^data:video\/\w+;base64,/, "");
        fs.writeFileSync(filePath, base64Data, 'base64');
        // Используем относительный путь для гибкости
        finalSub.videoUrl = `/uploads/${fileName}`;
    }

    db.submissions.unshift(finalSub);
    writeDB(db);
    res.json({ success: true, submission: finalSub });
});

app.patch('/api/submissions/:id', (req, res) => {
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
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 СЕРВЕР ЗАПУЩЕН И ГОТОВ К РАБОТЕ`);
    console.log(`📍 Локально: http://localhost:${PORT}`);
    console.log(`🌍 В сети: http://ваш-ip:${PORT}`);
    console.log(`----------------------------------\n`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Порт ${PORT} занят другим процессом!`);
    } else {
        console.error('❌ Ошибка сервера:', err);
    }
});
