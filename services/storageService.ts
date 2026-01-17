
import { Student, Submission, SubmissionStatus, TaskType, PracticeTask, UserRole } from "../types";

// ИСПОЛЬЗУЕМ ОТНОСИТЕЛЬНЫЕ ПУТИ С ПРЕФИКСОМ /phys-app
// Это необходимо для работы через Apache проксирование без конфликтов с основным приложением
const API_BASE = '/phys-app/api';
const UPLOADS_BASE = '/phys-app'; // Пути к файлам с префиксом (напр. /phys-app/uploads/video.mp4)
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
        // Просто возвращаем как есть, так как пути уже относительные (/uploads/...)
        return subs;
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

export const submitPracticeVideo = async (studentId: string, task: PracticeTask, videoBase64: string, videosBase64?: string[]) => {
  const sub: Submission = {
    id: Date.now().toString(),
    studentId,
    type: TaskType.PRACTICE,
    status: SubmissionStatus.PENDING,
    timestamp: Date.now(),
    taskDetails: task
  };

  const res = await fetch(`${API_BASE}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission: sub, videoBase64, videosBase64 })
  });
  
  if (!res.ok) throw new Error("Ошибка загрузки");
};

export const updateSubmissionStatus = async (id: string, status: SubmissionStatus) => {
    await fetch(`${API_BASE}/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
}
