
import React, { useState, useEffect } from 'react';
import { Student, UserRole, TaskType, QuizQuestion, PracticeTask } from '../types';
import { registerNewStudent, loginStudent, submitTheoryResult, submitPracticeVideo, getStudents } from '../services/storageService';
import { generateQuiz, generatePracticeTask } from '../services/geminiService';
import { Dumbbell, BookOpen, Clock, CheckCircle, XCircle, LogOut, Upload, Play, Loader2, Video, Trophy, User, Lock, AlertCircle, ArrowRight as ArrowRightIcon } from 'lucide-react';

interface Props {
  student: Student | null;
  onLogin: (s: Student) => void;
  onLogout: () => void;
}

export default function StudentView({ student, onLogin, onLogout }: Props) {
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'DASHBOARD' | 'THEORY' | 'PRACTICE'>('DASHBOARD');

  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [authName, setAuthName] = useState('');
  const [authGroup, setAuthGroup] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const [practiceTask, setPracticeTask] = useState<PracticeTask | null>(null);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    if (student) {
      const interval = setInterval(async () => {
        const students = await getStudents();
        const updated = students.find(s => s.id === student.id);
        
        if (updated) {
            const hasChanged = 
                updated.missedClasses !== student.missedClasses || 
                updated.classesMadeUp !== student.classesMadeUp ||
                updated.permissions.canDoTheory !== student.permissions.canDoTheory ||
                updated.permissions.canDoPractice !== student.permissions.canDoPractice;

            if (hasChanged) {
                onLogin(updated);
            }
        }
      }, 3000); 
      return () => clearInterval(interval);
    }
  }, [student, onLogin]);


  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!authName || !authPassword) return;
    if (authMode === 'REGISTER' && !authGroup) return;

    setLoading(true);
    try {
      if (authMode === 'REGISTER') {
        const s = await registerNewStudent(authName, authGroup, authPassword);
        onLogin(s);
      } else {
        const s = await loginStudent(authName, authPassword);
        onLogin(s);
      }
    } catch (err: any) {
        setAuthError(err.message || 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const startTheory = async () => {
    if (!student?.permissions?.canDoTheory) return;
    setQuizLoading(true);
    setView('THEORY');
    setQuizFinished(false);
    setScore(0);
    setCurrentQuestionIndex(0);
    try {
      const questions = await generateQuiz();
      setQuizQuestions(questions);
    } catch (e) {
      alert("Ошибка загрузки теста. Попробуйте снова.");
      setView('DASHBOARD');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleAnswer = (optionIndex: number) => {
    if (selectedOption !== null) return;
    
    const isCorrect = optionIndex === quizQuestions[currentQuestionIndex].correctAnswerIndex;
    setSelectedOption(optionIndex);
    if (isCorrect) {
      setScore(s => s + 1);
      // Если правильно - сразу дальше через небольшую паузу
      setTimeout(() => {
        setSelectedOption(null);
        if (currentQuestionIndex + 1 < quizQuestions.length) {
          setCurrentQuestionIndex(prev => prev + 1);
        } else {
          finishQuiz(score + 1);
        }
      }, 600);
    } else {
      // Если не правильно - показываем примечание (если есть) или ждем дольше
      if (quizQuestions[currentQuestionIndex].note) {
        setShowNote(true);
      } else {
        setTimeout(() => proceedToNext(false), 2000);
      }
    }
  };

  const proceedToNext = (isCorrect: boolean) => {
    setShowNote(false);
    setSelectedOption(null);
    if (currentQuestionIndex + 1 < quizQuestions.length) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      finishQuiz(score + (isCorrect ? 1 : 0));
    }
  };

  const finishQuiz = async (finalScore: number) => {
    setQuizFinished(true);
    const passed = await submitTheoryResult(student!.id, finalScore, quizQuestions.length);
    if (passed) {
        onLogin({ ...student!, classesMadeUp: student!.classesMadeUp + 1 });
    }
  };

  const startPractice = async () => {
    if (!student?.permissions?.canDoPractice) return;
    setPracticeLoading(true);
    setView('PRACTICE');
    setVideoFiles([]);
    try {
      const task = await generatePracticeTask();
      setPracticeTask(task);
    } catch (e) {
        alert("Ошибка генерации задания");
        setView('DASHBOARD');
    } finally {
      setPracticeLoading(false);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const allowedExts = ['mp4', 'mov', 'webm'];
      const hasUnsupported = newFiles.some(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return !ext || !allowedExts.includes(ext);
      });
      const maxTotalSize = 1.5 * 1024 * 1024 * 1024; // 1.5GB in bytes
      const maxFileSize = maxTotalSize;
      const hasTooLargeFile = newFiles.some(f => f.size > maxFileSize);
      const totalSize = [...videoFiles, ...newFiles].reduce((acc, f) => acc + f.size, 0);

      if (hasUnsupported) {
        alert("Разрешены только форматы: MP4, MOV, WEBM.");
        return;
      }

      if (hasTooLargeFile) {
        alert("Один из файлов превышает 1.5ГБ. Выберите файл меньшего размера.");
        return;
      }
      
      if (totalSize > maxTotalSize) {
        alert("Общий размер видео превышает 1.5ГБ. Выберите файлы меньшего размера.");
        return;
      }
      
      setVideoFiles(prev => [...prev, ...newFiles]);
    }
  };

  const submitPractice = async () => {
    if (videoFiles.length === 0 || !practiceTask) return;
    setLoading(true);
    setUploadProgress(0);

    try {
      await submitPracticeVideo(student!.id, practiceTask, videoFiles, (percent) => {
        setUploadProgress(percent);
      });
      setLoading(false);
      setView('DASHBOARD');
      setUploadProgress(null);
      alert(`Загружено файлов: ${videoFiles.length}. Видео отправлены на проверку!`);
    } catch (e: any) {
      alert(e.message || "Ошибка загрузки.");
      setLoading(false);
      setUploadProgress(null);
    }
  };

  if (!student) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col justify-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
          <div className="flex justify-center mb-6">
              <div className="bg-blue-100 p-4 rounded-full text-blue-600 shadow-inner">
                  <User size={32} />
              </div>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
              <button onClick={() => { setAuthMode('LOGIN'); setAuthError(''); }} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${authMode === 'LOGIN' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Вход</button>
              <button onClick={() => { setAuthMode('REGISTER'); setAuthError(''); }} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${authMode === 'REGISTER' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Регистрация</button>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-800 text-center">{authMode === 'LOGIN' ? 'С возвращением!' : 'Создать аккаунт'}</h2>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="text" required className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none" placeholder="ФИО (Полностью)" value={authName} onChange={(e) => setAuthName(e.target.value)} />
            {authMode === 'REGISTER' && <input type="text" required className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none" placeholder="Номер группы" value={authGroup} onChange={(e) => setAuthGroup(e.target.value)} />}
            <input type="password" required className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none" placeholder="Пароль" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} />
            {authError && <div className="text-red-600 text-sm">{authError}</div>}
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg">{loading ? <Loader2 className="animate-spin mx-auto" /> : (authMode === 'LOGIN' ? "Войти" : "Зарегистрироваться")}</button>
            <button type="button" onClick={onLogout} className="w-full text-slate-500 text-sm py-2">Назад в меню</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'DASHBOARD') {
    const debt = Math.max(0, student.missedClasses - student.classesMadeUp);
    return (
      <div className="max-w-lg mx-auto pb-20">
        <header className="bg-blue-600 text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden">
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h1 className="text-2xl font-bold">{student.fullName}</h1>
                        <p className="text-blue-100">{student.groupNumber}</p>
                    </div>
                    <button onClick={onLogout} className="p-2 bg-white/10 rounded-lg"><LogOut size={20} /></button>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 text-center">
                        <div className="text-blue-100 text-xs uppercase mb-1">Долги</div>
                        <div className="text-3xl font-bold">{debt}</div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 text-center">
                        <div className="text-blue-100 text-xs uppercase mb-1">Зачтено</div>
                        <div className="text-3xl font-bold">{student.classesMadeUp}</div>
                    </div>
                </div>
            </div>
        </header>
        <main className="p-6 space-y-4">
            <button onClick={startTheory} disabled={!student.permissions.canDoTheory} className="w-full p-5 bg-white border rounded-2xl flex items-center gap-4 hover:shadow-md transition-all">
                <div className="bg-indigo-100 text-indigo-600 p-3 rounded-full"><BookOpen size={24} /></div>
                <div className="text-left"><div className="font-bold">Теория</div><div className="text-sm text-gray-500">Ответьте на вопросы</div></div>
            </button>
            <button onClick={startPractice} disabled={!student.permissions.canDoPractice} className="w-full p-5 bg-white border rounded-2xl flex items-center gap-4 hover:shadow-md transition-all">
                <div className="bg-emerald-100 text-emerald-600 p-3 rounded-full"><Video size={24} /></div>
                <div className="text-left"><div className="font-bold">Практика</div><div className="text-sm text-gray-500">Видео упражнение</div></div>
            </button>
        </main>
      </div>
    );
  }

  if (view === 'THEORY') {
      if (quizLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;
      if (quizFinished) return (
          <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
              <Trophy size={64} className="text-emerald-500 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Тест завершен</h2>
              <p className="text-gray-600 mb-8">Результат: {score}/{quizQuestions.length}</p>
              <button onClick={() => setView('DASHBOARD')} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold">Назад</button>
          </div>
      );
      const question = quizQuestions[currentQuestionIndex];
      return (
          <div className="min-h-screen p-6 bg-gray-50 max-w-lg mx-auto">
                <div className="text-gray-400 mb-8">Вопрос {currentQuestionIndex+1}/{quizQuestions.length}</div>
                <h2 className="text-xl font-bold mb-8">{question.question}</h2>
                <div className="space-y-3">
                    {question.options.map((opt, idx) => {
                        const isSelected = selectedOption === idx;
                        const isCorrect = idx === question.correctAnswerIndex;
                        let btnClass = "w-full text-left p-4 rounded-xl border bg-white transition-all ";
                        
                        if (selectedOption !== null) {
                            if (isSelected) {
                                if (isCorrect) {
                                    btnClass += "border-emerald-500 bg-emerald-50 text-emerald-700 ";
                                } else {
                                    btnClass += "border-rose-500 bg-rose-50 text-rose-700 ";
                                }
                            } else {
                                btnClass += "opacity-50 ";
                            }
                        } else {
                            btnClass += "hover:border-blue-500 ";
                        }

                        return (
                            <button key={idx} disabled={selectedOption !== null} onClick={() => handleAnswer(idx)} className={btnClass}>
                                {opt}
                            </button>
                        );
                    })}
                </div>

                {showNote && question.note && (
                    <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                        <h4 className="font-bold text-blue-800 mb-1">Примечание:</h4>
                        <p className="text-blue-700 text-sm">{question.note}</p>
                        <button onClick={() => proceedToNext(selectedOption === question.correctAnswerIndex)} className="mt-4 w-full py-3 bg-blue-600 text-white rounded-xl font-bold">
                            Далее
                        </button>
                    </div>
                )}
          </div>
      );
  }

  if (view === 'PRACTICE') {
      return (
          <div className="min-h-screen p-6 bg-gray-50 flex flex-col max-w-lg mx-auto">
               <div className="flex justify-between items-center mb-6"><h2 className="font-bold">Практика</h2><button onClick={() => setView('DASHBOARD')}><XCircle size={24}/></button></div>
                <div className="bg-white p-6 rounded-2xl border mb-6">
                    <h3 className="text-xl font-bold mb-2">{practiceTask?.title}</h3>
                    {practiceTask?.imageUrl ? (
                        <div className="mb-4 overflow-hidden rounded-xl border border-gray-100 shadow-sm">
                            <img 
                                src={practiceTask.imageUrl} 
                                alt={practiceTask.title} 
                                className="w-full h-auto object-contain"
                            />
                        </div>
                    ) : (
                        <p className="text-gray-600 mb-4">{practiceTask?.description}</p>
                    )}
                    <div className="font-bold text-emerald-600">Цель: {practiceTask?.durationOrReps}</div>
                </div>
                <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl cursor-pointer bg-white mb-6 p-4 text-center">
                    {videoFiles.length > 0 ? (
                        <>
                            <CheckCircle size={40} className="text-emerald-500 mb-2" />
                            <div className="text-sm font-bold text-gray-700">Выбрано файлов: {videoFiles.length}</div>
                            <div className="text-xs text-gray-500 mt-1">
                                {videoFiles.map(f => f.name).join(', ')}
                            </div>
                            <button 
                                onClick={(e) => { e.preventDefault(); setVideoFiles([]); }}
                                className="mt-4 text-rose-500 text-xs font-bold underline"
                            >
                                Очистить список
                            </button>
                        </>
                    ) : (
                        <>
                            <Upload size={40} className="text-gray-300 mb-2" />
                            <span className="text-gray-500 font-medium">Загрузить видео (можно несколько)</span>
                            <span className="text-xs text-gray-400 mt-1">Форматы: MP4, MOV, WEBM • Макс. общий размер: 1.5ГБ</span>
                        </>
                    )}
                    <input
                        type="file"
                        accept=".mp4,.mov,.webm"
                        multiple
                        className="hidden"
                        onChange={handleVideoUpload}
                    />
                </label>
                <button onClick={submitPractice} disabled={videoFiles.length === 0 || loading} className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-50">
                    {loading ? <Loader2 className="animate-spin mx-auto" /> : `Отправить на проверку (${videoFiles.length})`}
                </button>
                {loading && uploadProgress !== null && (
                    <div className="mt-4">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Загрузка...</span>
                            <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                    </div>
                )}
          </div>
      );
  }

  return null;
}
