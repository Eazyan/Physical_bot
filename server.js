
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

// Создаем папку для видео и файл БД, если их нет
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ students: [], submissions: [] }, null, 2));
}

app.use(cors());
// Увеличиваем лимит для приема видео в base64
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Раздача статических файлов (видео)
app.use('/uploads', express.static(UPLOADS_DIR));

// Чтение БД
const readDB = () => {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { students: [], submissions: [] };
    }
};

// Запись в БД
const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// API: Получить всех студентов
app.get('/api/students', (req, res) => {
    res.json(readDB().students);
});

// API: Сохранить/Обновить студента
app.post('/api/students', (req, res) => {
    const db = readDB();
    const student = req.body;
    const index = db.students.findIndex(s => s.id === student.id);
    
    if (index !== -1) {
        db.students[index] = { ...db.students[index], ...student };
    } else {
        db.students.push(student);
    }
    
    writeDB(db);
    res.json({ success: true, student });
});

// API: Получить все работы
app.get('/api/submissions', (req, res) => {
    res.json(readDB().submissions);
});

// API: Загрузить видео и создать submission
app.post('/api/submissions', (req, res) => {
    const db = readDB();
    const { submission, videoBase64 } = req.body;
    
    let finalSub = { ...submission };

    if (videoBase64) {
        try {
            const fileName = `video_${Date.now()}.mp4`;
            const filePath = path.join(UPLOADS_DIR, fileName);
            const base64Data = videoBase64.replace(/^data:video\/\w+;base64,/, "");
            fs.writeFileSync(filePath, base64Data, 'base64');
            
            // ВАЖНО: При деплое замените localhost на ваш внешний IP сервера
            finalSub.videoUrl = `http://localhost:${PORT}/uploads/${fileName}`;
        } catch (error) {
            console.error('Ошибка при сохранении видео:', error);
            return res.status(500).json({ error: 'Failed to save video file' });
        }
    }

    db.submissions.unshift(finalSub);
    writeDB(db);
    res.json({ success: true, submission: finalSub });
});

// API: Обновить статус работы (принять/отклонить)
app.patch('/api/submissions/:id', (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const { status } = req.body;
    
    const sub = db.submissions.find(s => s.id === id);
    if (sub) {
        sub.status = status;
        if (status === 'APPROVED') {
            const student = db.students.find(s => s.id === sub.studentId);
            if (student) {
                student.classesMadeUp = (student.classesMadeUp || 0) + 1;
            }
        }
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Submission not found' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Сервер Физкульт-Бота запущен!`);
    console.log(`📡 API доступно по адресу: http://ваш-ip:${PORT}/api`);
    console.log(`📂 Папка с видео: ${UPLOADS_DIR}`);
    console.log(`📝 Файл базы данных: ${DB_FILE}\n`);
});
