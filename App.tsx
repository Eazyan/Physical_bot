
import React, { useState, useEffect } from 'react';
import { UserRole, Student } from './types';
import { getSession, saveSession, clearSession, getStudentById } from './services/storageService';
import StudentView from './components/StudentView';
import TeacherView from './components/TeacherView';
import { BookOpen, UserCheck, ShieldCheck, ArrowRight, Loader2, Lock, X } from 'lucide-react';

export default function App() {
  const [role, setRole] = useState<UserRole>(UserRole.GUEST);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [initializing, setInitializing] = useState(true);
  
  const [showTeacherLogin, setShowTeacherLogin] = useState(false);
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherError, setTeacherError] = useState('');

  useEffect(() => {
    const init = async () => {
        const session = getSession();
        if (session) {
            if (session.role === UserRole.TEACHER) {
                setRole(UserRole.TEACHER);
            } else if (session.role === UserRole.STUDENT && session.studentId) {
                const student = await getStudentById(session.studentId);
                if (student) {
                    setCurrentStudent(student);
                    setRole(UserRole.STUDENT);
                } else {
                    clearSession();
                }
            }
        }
        setInitializing(false);
    };
    init();
  }, []);

  const handleStudentLogin = (student: Student) => {
      setCurrentStudent(student);
      setRole(UserRole.STUDENT);
  };

  const verifyTeacherPassword = (e: React.FormEvent) => {
      e.preventDefault();
      if (teacherPassword === 'prepod123') {
          setRole(UserRole.TEACHER);
          saveSession(UserRole.TEACHER);
          setShowTeacherLogin(false);
          setTeacherPassword('');
          setTeacherError('');
      } else {
          setTeacherError('Неверный пароль');
      }
  };

  const handleLogout = () => {
      setCurrentStudent(null);
      setRole(UserRole.GUEST);
      clearSession();
  };

  if (initializing) {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center">
              <Loader2 className="animate-spin text-emerald-500" size={48} />
          </div>
      )
  }

  if (role === UserRole.GUEST) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white relative">
        <div className={`w-full max-w-md space-y-8 transition-all ${showTeacherLogin ? 'blur-sm scale-95 opacity-50' : ''}`}>
          <div className="text-center space-y-2">
            <div className="bg-emerald-500 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
              <ShieldCheck size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Физкультура Бот</h1>
            <p className="text-slate-400">Кафедра Физического Воспитания</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setRole(UserRole.STUDENT)}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 p-4 rounded-xl flex items-center justify-between group transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="bg-blue-500/10 p-3 rounded-lg">
                  <UserCheck className="text-blue-400" size={24} />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Я Студент</div>
                  <div className="text-sm text-slate-400">Вход или Регистрация</div>
                </div>
              </div>
              <ArrowRight className="text-slate-500 group-hover:text-blue-400 transition-colors" />
            </button>

            <button
              onClick={() => setShowTeacherLogin(true)}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 p-4 rounded-xl flex items-center justify-between group transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="bg-emerald-500/10 p-3 rounded-lg">
                  <BookOpen className="text-emerald-400" size={24} />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Я Преподаватель</div>
                  <div className="text-sm text-slate-400">Управление и проверка</div>
                </div>
              </div>
              <ArrowRight className="text-slate-500 group-hover:text-emerald-400 transition-colors" />
            </button>
          </div>
        </div>

        {showTeacherLogin && (
            <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-slate-900 animate-in fade-in zoom-in duration-200">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-lg">Вход для преподавателя</h3>
                        <button onClick={() => setShowTeacherLogin(false)} className="text-gray-400 hover:text-gray-600">
                            <X size={24} />
                        </button>
                    </div>
                    <form onSubmit={verifyTeacherPassword} className="p-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <Lock size={16} /> Пароль доступа
                            </label>
                            <input 
                                type="password" 
                                autoFocus
                                value={teacherPassword}
                                onChange={(e) => setTeacherPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                                placeholder="••••••••"
                            />
                            {teacherError && <p className="text-red-500 text-sm">{teacherError}</p>}
                        </div>
                        <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-colors">
                            Войти
                        </button>
                    </form>
                </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 font-sans">
      {role === UserRole.STUDENT && (
        <StudentView
          student={currentStudent}
          onLogin={handleStudentLogin}
          onLogout={handleLogout}
        />
      )}
      {role === UserRole.TEACHER && (
        <TeacherView
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
