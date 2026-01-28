import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { randomUUID, createHash } from 'crypto';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002;
const DB_FILE = path.join(__dirname, 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TEMP_UPLOADS_DIR = path.join(__dirname, 'uploads_tmp');
const MAX_TOTAL_SIZE_BYTES = Math.floor(1.5 * 1024 * 1024 * 1024);
const MAX_FILE_SIZE_BYTES = MAX_TOTAL_SIZE_BYTES;
const MIN_FREE_SPACE_BYTES = 300 * 1024 * 1024;
const TRANSCODE_CONCURRENCY = 2;
const TRANSCODE_TIMEOUT_MS = 20 * 60 * 1000;

const EXT_TO_MIME = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.m4v': 'video/x-m4v',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.3gp': 'video/3gpp',
    '.3g2': 'video/3gpp2',
    '.mpeg': 'video/mpeg',
    '.mpg': 'video/mpeg',
    '.ts': 'video/mp2t',
    '.m2ts': 'video/mp2t',
    '.mts': 'video/mp2t',
    '.flv': 'video/x-flv',
    '.f4v': 'video/x-f4v',
    '.mxf': 'application/mxf',
};

const MIME_TO_EXT = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'video/ogg': '.ogg',
    'video/x-m4v': '.m4v',
    'video/x-matroska': '.mkv',
    'video/x-msvideo': '.avi',
    'video/x-ms-wmv': '.wmv',
    'video/3gpp': '.3gp',
    'video/3gpp2': '.3g2',
    'video/mpeg': '.mpeg',
    'video/mp2t': '.ts',
    'video/x-flv': '.flv',
    'video/x-f4v': '.f4v',
    'application/mxf': '.mxf',
};

const ALLOWED_EXTS = new Set([
    '.mp4', '.mov', '.webm', '.ogg', '.ogv', '.m4v', '.mkv', '.avi', '.wmv',
    '.3gp', '.3g2', '.mpeg', '.mpg', '.ts', '.m2ts', '.mts', '.flv', '.f4v', '.mxf',
]);
const ALLOWED_MIMES = new Set([
    'video/mp4', 'video/quicktime', 'video/webm', 'video/ogg', 'video/x-m4v',
    'video/x-matroska', 'video/x-msvideo', 'video/x-ms-wmv', 'video/3gpp', 'video/3gpp2',
    'video/mpeg', 'video/mp2t', 'video/x-flv', 'video/x-f4v', 'application/mxf',
]);

const FFMPEG_AVAILABLE = (() => {
    try {
        const res = spawnSync('ffmpeg', ['-version']);
        return res.status === 0;
    } catch (e) {
        return false;
    }
})();

const FFPROBE_AVAILABLE = (() => {
    try {
        const res = spawnSync('ffprobe', ['-version']);
        return res.status === 0;
    } catch (e) {
        return false;
    }
})();

const MIN_VIDEO_SECONDS = 3;

const transcodeQueue = [];
let activeTranscodes = 0;

const enqueueTranscode = (task) => new Promise((resolve, reject) => {
    transcodeQueue.push({ task, resolve, reject });
    processTranscodeQueue();
});

const processTranscodeQueue = () => {
    if (activeTranscodes >= TRANSCODE_CONCURRENCY) return;
    const item = transcodeQueue.shift();
    if (!item) return;
    activeTranscodes += 1;
    (async () => {
        try {
            const result = await item.task();
            item.resolve(result);
        } catch (err) {
            item.reject(err);
        } finally {
            activeTranscodes -= 1;
            processTranscodeQueue();
        }
    })();
};

// Настройка Multer для больших файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_UPLOADS_DIR),
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
        const isAllowedExt = ALLOWED_EXTS.has(ext);
        const isAllowedMime = ALLOWED_MIMES.has(file.mimetype);
        if (isAllowedExt || isAllowedMime) return cb(null, true);
        const err = new Error('Недопустимый формат видео. Разрешены: mp4, mov, webm, avi, mkv, wmv, ogg, ogv, m4v, 3gp, 3g2, mpeg, mpg, ts, m2ts, mts, flv, f4v, mxf.');
        err.code = 'INVALID_FILE_TYPE';
        return cb(err);
    },
});

// Инициализация
try {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    if (!fs.existsSync(TEMP_UPLOADS_DIR)) fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });
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

const cleanupPaths = (paths = []) => {
    paths.forEach(filePath => {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
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

const getFreeDiskBytes = (dirPath) => {
    try {
        const res = spawnSync('df', ['-k', dirPath], { encoding: 'utf8' });
        if (res.status !== 0 || !res.stdout) return null;
        const lines = res.stdout.trim().split('\n');
        if (lines.length < 2) return null;
        const parts = lines[lines.length - 1].trim().split(/\s+/);
        if (parts.length < 4) return null;
        const availableKb = parseInt(parts[3], 10);
        if (!Number.isFinite(availableKb)) return null;
        return availableKb * 1024;
    } catch (e) {
        return null;
    }
};

const probeVideo = (filePath) => new Promise((resolve, reject) => {
    const args = [
        '-v', 'error',
        '-print_format', 'json',
        '-show_entries', 'format=duration',
        filePath,
    ];
    const proc = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
        if (code !== 0) {
            const err = new Error('ffprobe failed');
            err.code = 'PROBE_FAILED';
            err.details = stderr;
            return reject(err);
        }
        try {
            const data = JSON.parse(stdout || '{}');
            const duration = parseFloat(data?.format?.duration);
            if (!Number.isFinite(duration)) {
                const err = new Error('Invalid duration');
                err.code = 'PROBE_FAILED';
                err.details = stderr;
                return reject(err);
            }
            resolve({ duration });
        } catch (e) {
            const err = new Error('ffprobe parse failed');
            err.code = 'PROBE_FAILED';
            err.details = stderr;
            reject(err);
        }
    });
});

const transcodeToMp4 = (inputPath, outputPath) => new Promise((resolve, reject) => {
    const args = [
        '-y',
        '-i', inputPath,
        '-map', '0:v:0',
        '-map', '0:a?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputPath,
    ];
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    const timeoutId = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
        const err = new Error('Transcode timeout');
        err.code = 'TRANSCODE_TIMEOUT';
        reject(err);
    }, TRANSCODE_TIMEOUT_MS);
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code === 0) return resolve();
        const err = new Error('Не удалось конвертировать видео.');
        err.code = 'TRANSCODE_FAILED';
        err.details = stderr;
        reject(err);
    });
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

        if (!FFMPEG_AVAILABLE || !FFPROBE_AVAILABLE) {
            cleanupFiles(req.files);
            return res.status(500).json({ error: 'Сервер не готов к обработке видео (ffmpeg/ffprobe не найдены).' });
        }

        const totalSize = req.files.reduce((acc, file) => acc + (file.size || 0), 0);
        if (totalSize > MAX_TOTAL_SIZE_BYTES) {
            cleanupFiles(req.files);
            return res.status(413).json({ error: 'Общий размер видео превышает лимит 1.5ГБ.' });
        }

        const freeBytes = getFreeDiskBytes(UPLOADS_DIR);
        if (freeBytes !== null) {
            const requiredBytes = (totalSize * 2) + MIN_FREE_SPACE_BYTES;
            if (freeBytes < requiredBytes) {
                cleanupFiles(req.files);
                return res.status(507).json({ error: 'Недостаточно места на сервере для обработки видео.' });
            }
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
        const convertedPaths = [];
        for (const file of req.files) {
            const inputPath = file.path;
            const outputName = `video-${Date.now()}-${randomUUID()}.mp4`;
            const outputPath = path.join(UPLOADS_DIR, outputName);
            convertedPaths.push(outputPath);

            console.log(`[TRANSCODE] queued: ${file.originalname} -> ${outputName}`);
            try {
                await enqueueTranscode(async () => {
                    const probe = await probeVideo(inputPath);
                    if (probe.duration < MIN_VIDEO_SECONDS) {
                        const err = new Error('Video too short');
                        err.code = 'VIDEO_TOO_SHORT';
                        throw err;
                    }
                    console.log(`[TRANSCODE] start: ${file.originalname} -> ${outputName}`);
                    await transcodeToMp4(inputPath, outputPath);
                    console.log(`[TRANSCODE] done: ${file.originalname} -> ${outputName}`);
                });
            } catch (err) {
                if (err?.code === 'VIDEO_TOO_SHORT') {
                    cleanupPaths(convertedPaths);
                    cleanupFiles(req.files);
                    return res.status(400).json({
                        error: `Видео слишком короткое. Минимальная длительность: ${MIN_VIDEO_SECONDS} сек.`,
                    });
                }
                if (err?.code === 'TRANSCODE_TIMEOUT') {
                    console.error(`[TRANSCODE] timeout: ${file.originalname}`);
                    cleanupPaths(convertedPaths);
                    cleanupFiles(req.files);
                    return res.status(504).json({
                        error: 'Превышено время конвертации. Попробуйте видео меньшего размера.',
                    });
                }
                if (err?.code === 'PROBE_FAILED') {
                    console.error(`[PROBE] error: ${file.originalname}`, err?.details || err);
                    cleanupPaths(convertedPaths);
                    cleanupFiles(req.files);
                    return res.status(400).json({
                        error: 'Файл повреждён или не распознаётся. Перезапишите видео и загрузите снова.',
                    });
                }
                console.error(`[TRANSCODE] error: ${file.originalname}`, err?.details || err);
                cleanupPaths(convertedPaths);
                cleanupFiles(req.files);
                return res.status(500).json({
                    error: 'Не удалось конвертировать видео. Возможно файл повреждён.',
                });
            }

            if (!fs.existsSync(outputPath)) {
                cleanupPaths(convertedPaths);
                cleanupFiles(req.files);
                return res.status(500).json({ error: 'Не удалось сохранить конвертированное видео.' });
            }

            const stat = fs.statSync(outputPath);
            if (!stat.size) {
                cleanupPaths(convertedPaths);
                cleanupFiles(req.files);
                return res.status(500).json({ error: 'Конвертированное видео пустое. Повторите загрузку.' });
            }

            const sha256 = await computeSha256(outputPath);
            const mimeType = getMimeTypeForFile(outputPath);
            const url = `/uploads/${outputName}`;
            finalSub.videoUrls.push(url);
            finalSub.videoMeta.push({
                url,
                filename: outputName,
                size: stat.size,
                mimeType,
                sha256,
                originalFilename: file.originalname,
                originalSize: file.size || 0,
                transcoded: true,
            });
        }

        cleanupFiles(req.files);
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
function writeDB(data) {
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, DB_FILE);
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 БОТ ЗАПУЩЕН НА ПОРТУ ${PORT}`);
    if (!FFMPEG_AVAILABLE) {
        console.warn('⚠️  ffmpeg не найден: конвертация видео недоступна.');
    }
    if (!FFPROBE_AVAILABLE) {
        console.warn('⚠️  ffprobe не найден: проверка видео недоступна.');
    }
    console.log(`⚙️  Транскод: параллельность=${TRANSCODE_CONCURRENCY}, таймаут=${Math.round(TRANSCODE_TIMEOUT_MS / 60000)} мин, мин.длительность=${MIN_VIDEO_SECONDS} сек`);
    console.log(`---------------------------------------------------`);
    console.log(`1. Соберите фронтенд: npm run build`);
    console.log(`2. Создайте туннель:  npx localtunnel --port ${PORT}`);
    console.log(`---------------------------------------------------\n`);
});
