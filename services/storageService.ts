
import { Student, Submission, SubmissionStatus, TaskType, PracticeTask, UserRole } from "../types";

const getAppBase = (): string => {
    if (typeof window === 'undefined') return '';
    const path = window.location.pathname || '';
    if (path === '/phys-app' || path.startsWith('/phys-app/')) return '/phys-app';
    return '';
};

// Поддерживаем запуск как с /phys-app, так и с корня
const APP_BASE = getAppBase();
const API_BASE = `${APP_BASE}/api`;
const UPLOADS_BASE = APP_BASE;
const SESSION_KEY = "pe_bot_session";

const normalizeName = (name: string): string => {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
};

export const getStudents = async (): Promise<Student[]> => {
    try {
        const res = await fetch(`${API_BASE}/students`);
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        console.error("API unreachable");
        return [];
    }
};

export const getStudentById = async (id: string): Promise<Student | undefined> => {
    const students = await getStudents();
    return students.find(s => s.id === id);
}

export const registerNewStudent = async (fullName: string, groupNumber: string, password: string): Promise<Student> => {
  const students = await getStudents();
  const normalizedInputName = normalizeName(fullName);

  if (students.find(s => normalizeName(s.fullName) === normalizedInputName)) {
      throw new Error("Студент с таким именем уже зарегистрирован.");
  }

  const newStudent: Student = {
    id: Date.now().toString(),
    fullName: fullName.trim().replace(/\s+/g, ' '), 
    groupNumber: groupNumber.trim(),
    password: password, 
    missedClasses: 0,
    classesMadeUp: 0,
    permissions: { canDoTheory: true, canDoPractice: true }
  };

  await fetch(`${API_BASE}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStudent)
  });

  saveSession(UserRole.STUDENT, newStudent.id);
  return newStudent;
};

export const loginStudent = async (fullName: string, password: string): Promise<Student> => {
    const students = await getStudents();
    const normalizedInputName = normalizeName(fullName);
    const student = students.find(s => normalizeName(s.fullName) === normalizedInputName);

    if (!student) throw new Error("Студент не найден.");
    if (student.password && student.password !== password) throw new Error("Неверный пароль.");
    
    saveSession(UserRole.STUDENT, student.id);
    return student;
}

export const updateStudent = async (id: string, updates: Partial<Student>) => {
    const student = await getStudentById(id);
    if (student) {
        await fetch(`${API_BASE}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...student, ...updates })
        });
    }
}

export const saveSession = (role: UserRole, studentId?: string) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ role, studentId }));
}

export const getSession = () => {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
}

export const clearSession = () => localStorage.removeItem(SESSION_KEY);

export const getSubmissions = async (): Promise<Submission[]> => {
    try {
        const res = await fetch(`${API_BASE}/submissions`);
        const subs: Submission[] = await res.json();
        const normalizeVideoUrl = (url?: string) => {
            if (!url) return url;
            if (url.startsWith('http://') || url.startsWith('https://')) return url;
            if (APP_BASE) {
                if (url.startsWith('/phys-app/')) return url;
                if (url.startsWith('/uploads/')) return `${UPLOADS_BASE}${url}`;
                if (url.startsWith('uploads/')) return `${UPLOADS_BASE}/${url}`;
                return url;
            }
            if (url.startsWith('/phys-app/')) return url.replace(/^\/phys-app/, '');
            return url;
        };
        return subs.map(sub => ({
            ...sub,
            videoUrl: normalizeVideoUrl(sub.videoUrl),
            videoUrls: sub.videoUrls ? sub.videoUrls.map(v => normalizeVideoUrl(v)) : undefined,
        }));
    } catch (e) {
        return [];
    }
};

export const submitTheoryResult = async (studentId: string, score: number, total: number): Promise<boolean> => {
  const isPassed = (score >= 7);
  const sub: Submission = {
    id: Date.now().toString(),
    studentId,
    type: TaskType.THEORY,
    status: isPassed ? SubmissionStatus.APPROVED : SubmissionStatus.REJECTED,
    timestamp: Date.now(),
    quizScore: score,
    totalQuestions: total
  };

  await fetch(`${API_BASE}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission: sub })
  });

  return isPassed;
};

export const submitPracticeVideo = async (
  studentId: string,
  task: PracticeTask,
  videoFiles: File[],
  onProgress?: (percent: number) => void
) => {
  const sub: Submission = {
    id: Date.now().toString(),
    studentId,
    type: TaskType.PRACTICE,
    status: SubmissionStatus.PENDING,
    timestamp: Date.now(),
    taskDetails: task
  };

  const formData = new FormData();
  formData.append('submission', JSON.stringify(sub));
  videoFiles.forEach(file => {
    formData.append('videos', file);
  });

  await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/submissions/multipart`);

      if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                  const percent = Math.round((event.loaded / event.total) * 100);
                  onProgress(Math.min(100, Math.max(0, percent)));
              }
          };
      }

      xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
              if (onProgress) onProgress(100);
              resolve();
              return;
          }
          let message = "Ошибка загрузки";
          try {
              const data = JSON.parse(xhr.responseText || "{}");
              if (data?.error) message = data.error;
          } catch (e) {
              // ignore
          }
          reject(new Error(message));
      };

      xhr.onerror = () => reject(new Error("Ошибка сети при загрузке"));
      xhr.onabort = () => reject(new Error("Загрузка отменена"));
      xhr.send(formData);
  });
};

export const updateSubmissionStatus = async (id: string, status: SubmissionStatus) => {
    await fetch(`${API_BASE}/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
}
