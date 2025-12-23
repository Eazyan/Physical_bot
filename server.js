
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3002;
const DB_FILE = './db.json';
const UPLOADS_DIR = './uploads';

// Создаем папку для видео и файл БД, если их нет
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ students: [], submissions: [] }, null, 2));
}

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Чтение БД
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
// Запись в БД
const writeDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

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
        const fileName = `video_${Date.now()}.mp4`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        const base64Data = videoBase64.replace(/^data:video\/\w+;base64,/, "");
        fs.writeFileSync(filePath, base64Data, 'base64');
        finalSub.videoUrl = `http://localhost:${PORT}/uploads/${fileName}`; 
        // Примечание: В продакшене лучше заменить localhost на ваш IP/домен
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
        // Если одобрено, обновляем счетчик у студента
        if (status === 'APPROVED') {
            const student = db.students.find(s => s.id === sub.studentId);
            if (student) {
                student.classesMadeUp = (student.classesMadeUp || 0) + 1;
            }
        }
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📁 Видео сохраняются в: ${path.resolve(UPLOADS_DIR)}`);
    console.log(`📝 База данных: ${path.resolve(DB_FILE)}`);
});
