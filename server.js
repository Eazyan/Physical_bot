import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID, createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002;
const DB_FILE = path.join(__dirname, 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_TOTAL_SIZE_BYTES = Math.floor(1.5 * 1024 * 1024 * 1024);
const MAX_FILE_SIZE_BYTES = MAX_TOTAL_SIZE_BYTES;

const EXT_TO_MIME = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.m4v': 'video/x-m4v',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.3gp': 'video/3gpp',
    '.3g2': 'video/3gpp2',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
};

const MIME_TO_EXT = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'video/ogg': '.ogg',
    'video/x-m4v': '.m4v',
    'video/x-matroska': '.mkv',
    'video/x-msvideo': '.avi',
    'video/3gpp': '.3gp',
    'video/3gpp2': '.3g2',
    'video/mpeg': '.mpeg',
};

// Настройка Multer для больших файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${randomUUID()}`;
        const originalExt = path.extname(file.originalname || '').toLowerCase();
        const extFromMime = MIME_TO_EXT[file.mimetype];
        const safeExt = EXT_TO_MIME[originalExt] ? originalExt : (extFromMime || '.bin');
        cb(null, `${file.fieldname}-${uniqueSuffix}${safeExt}`);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const isAllowedExt = !!EXT_TO_MIME[ext];
        const isAllowedMime = !!MIME_TO_EXT[file.mimetype];
        if (isAllowedExt || isAllowedMime) return cb(null, true);
        const err = new Error('Недопустимый формат видео.');
        err.code = 'INVALID_FILE_TYPE';
        return cb(err);
    },
});

// Инициализация
try {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ students: [], submissions: [] }, null, 2));
} catch (err) {
    console.error('Ошибка инициализации:', err);
}

app.use(cors());
app.use(express.json({ limit: '20mb' }));

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
        const { submission, videoBase64, videosBase64 } = req.body;
        if (!submission) {
            return res.status(400).json({ error: 'Отсутствуют данные submission.' });
        }
        const hasBase64 = !!videoBase64 || (Array.isArray(videosBase64) && videosBase64.length > 0);
        if (hasBase64) {
            return res.status(400).json({
                error: 'Base64-загрузка видео отключена. Используйте multipart /submissions/multipart.'
            });
        }

        if (submission?.type === 'PRACTICE') {
            return res.status(400).json({
                error: 'Видео для практики принимаются только через multipart /submissions/multipart.'
            });
        }

        let finalSub = { ...submission, videoUrls: [] };

        db.submissions.unshift(finalSub);
        
        // Если это тест и он пройден успешно - сразу увеличиваем счетчик у студента
        if (finalSub.type === 'THEORY' && finalSub.status === 'APPROVED') {
            const student = db.students.find(s => s.id === finalSub.studentId);
            if (student) {
                student.classesMadeUp = (student.classesMadeUp || 0) + 1;
            }
        }

        writeDB(db);
        res.json({ success: true, submission: finalSub });
    }
};

const getMimeTypeForFile = (filePath) => {
    const ext = path.extname(filePath || '').toLowerCase();
    return EXT_TO_MIME[ext] || 'application/octet-stream';
};

const cleanupFiles = (files = []) => {
    files.forEach(file => {
        if (file?.path && fs.existsSync(file.path)) {
            try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
        }
    });
};

const computeSha256 = (filePath) => new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
});

const handleMultipartSubmission = async (req, res) => {
    try {
        const db = readDB();
        if (!req.body?.submission) {
            cleanupFiles(req.files);
            return res.status(400).json({ error: 'Отсутствуют данные submission.' });
        }
        let submission;
        try {
            submission = JSON.parse(req.body.submission);
        } catch (e) {
            cleanupFiles(req.files);
            return res.status(400).json({ error: 'Неверный формат submission.' });
        }
        let finalSub = { ...submission, videoUrls: [] };

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Не загружено ни одного видео.' });
        }

        const totalSize = req.files.reduce((acc, file) => acc + (file.size || 0), 0);
        if (totalSize > MAX_TOTAL_SIZE_BYTES) {
            cleanupFiles(req.files);
            return res.status(413).json({ error: 'Общий размер видео превышает лимит 1.5ГБ.' });
        }

        if (req.files.some(file => (file.size || 0) === 0)) {
            cleanupFiles(req.files);
            return res.status(400).json({ error: 'Обнаружен пустой файл. Загрузите видео заново.' });
        }

        const hasMismatch = req.files.some(file => {
            if (!file?.path || !fs.existsSync(file.path)) return true;
            const stat = fs.statSync(file.path);
            return stat.size !== file.size;
        });
        if (hasMismatch) {
            cleanupFiles(req.files);
            return res.status(500).json({ error: 'Не удалось сохранить видео полностью. Повторите загрузку.' });
        }

        finalSub.videoMeta = [];
        for (const file of req.files) {
            const filePath = file.path;
            const sha256 = await computeSha256(filePath);
            const mimeType = getMimeTypeForFile(filePath);
            const url = `/uploads/${file.filename}`;
            finalSub.videoUrls.push(url);
            finalSub.videoMeta.push({
                url,
                filename: file.filename,
                size: file.size || 0,
                mimeType,
                sha256,
            });
        }
        finalSub.videoUrl = finalSub.videoUrls[0];

        db.submissions.unshift(finalSub);
        writeDB(db);
        res.json({ success: true, submission: finalSub });
    } catch (err) {
        console.error('[MULTIPART ERROR]', err);
        cleanupFiles(req.files);
        res.status(500).json({ error: 'Ошибка обработки загрузки' });
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
const handleUploadErrors = (req, res, next) => {
    upload.array('videos')(req, res, (err) => {
        if (!err) return next();
        cleanupFiles(req.files);
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'Файл превышает лимит 1.5ГБ.' });
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({ error: 'Недопустимый формат или поле файла.' });
            }
            return res.status(400).json({ error: 'Ошибка загрузки видео.' });
        }
        if (err.code === 'INVALID_FILE_TYPE') {
            return res.status(400).json({ error: 'Недопустимый формат видео.' });
        }
        console.error('[UPLOAD ERROR]', err);
        return res.status(500).json({ error: 'Ошибка загрузки видео.' });
    });
};

app.post('/phys-app/api/submissions/multipart', handleUploadErrors, handleMultipartSubmission);
app.patch('/phys-app/api/submissions/:id', handleApiSubmissionsPatch);

// API маршруты без префикса (для прямого доступа к localhost:3002)
app.get('/api/students', handleApiStudents.get);
app.post('/api/students', handleApiStudents.post);
app.get('/api/submissions', handleApiSubmissions.get);
app.post('/api/submissions', handleApiSubmissions.post);
app.post('/api/submissions/multipart', handleUploadErrors, handleMultipartSubmission);
app.patch('/api/submissions/:id', handleApiSubmissionsPatch);

// === РАЗДАЧА ФРОНТЕНДА И ФАЙЛОВ ===

// 1. Кастомная раздача видеофайлов с поддержкой Range (до статики)
const parseRange = (rangeHeader, size) => {
    if (!rangeHeader) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match) return null;
    const startStr = match[1];
    const endStr = match[2];
    if (startStr === '' && endStr === '') return null;

    let start = 0;
    let end = size - 1;

    if (startStr === '') {
        const suffixLength = parseInt(endStr, 10);
        if (Number.isNaN(suffixLength)) return null;
        if (suffixLength <= 0) return { invalid: true };
        start = Math.max(size - suffixLength, 0);
    } else {
        start = parseInt(startStr, 10);
        if (Number.isNaN(start) || start < 0) return null;
        if (endStr !== '') {
            end = parseInt(endStr, 10);
            if (Number.isNaN(end) || end < start) return null;
        }
    }

    if (start >= size) return { invalid: true };
    if (end >= size) end = size - 1;
    return { start, end };
};

const streamVideo = (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(UPLOADS_DIR, filename);
        if (!fs.existsSync(filePath)) return res.status(404).end();

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;
        const contentType = getMimeTypeForFile(filePath);

        if (!range) {
            res.setHeader('Content-Length', fileSize);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Type', contentType);
            fs.createReadStream(filePath).pipe(res);
            return;
        }

        const parsed = parseRange(range, fileSize);
        if (!parsed || parsed.invalid) {
            res.status(416);
            res.setHeader('Content-Range', `bytes */${fileSize}`);
            return res.end();
        }

        const { start, end } = parsed;
        const chunkSize = (end - start) + 1;
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': contentType,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
    } catch (err) {
        console.error('[STREAM ERROR]', err);
        res.status(500).end();
    }
};

// Маршруты для видео (с префиксом /phys-app и без него)
app.get('/phys-app/uploads/:filename', (req, res) => streamVideo(req, res));
app.get('/uploads/:filename', (req, res) => streamVideo(req, res));

// 1б. Статическая раздача загруженных файлов (картинки и прочее)
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

// Обработчик ошибок JSON parser (например, слишком большой payload)
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Слишком большой запрос. Для видео используйте multipart /submissions/multipart.'
        });
    }
    return next(err);
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
