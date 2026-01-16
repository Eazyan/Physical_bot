
import React, { useState, useEffect } from 'react';
import { Student, Submission, SubmissionStatus, TaskType } from '../types';
import { getStudents, getSubmissions, updateStudent, updateSubmissionStatus } from '../services/storageService';
import { Users, CheckSquare, History, Play, Check, X, LogOut, Search, Plus, Minus, ArrowLeft, Settings, ToggleLeft, ToggleRight, Calendar, Key, Eye, EyeOff, Download } from 'lucide-react';

interface Props {
  onLogout: () => void;
}

export default function TeacherView({ onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<'STUDENTS' | 'REVIEWS'>('STUDENTS');
  const [students, setStudents] = useState<Student[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [viewingVideoUrl, setViewingVideoUrl] = useState<string | null>(null);

  const refreshData = async () => {
      const [sList, subList] = await Promise.all([getStudents(), getSubmissions()]);
      setStudents(sList);
      setSubmissions(subList);
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, []);

  const pendingSubmissions = submissions.filter(s => s.status === SubmissionStatus.PENDING && s.type === TaskType.PRACTICE);
  const filteredStudents = students.filter(s => 
      s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.groupNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const StudentDetailView = ({ studentId }: { studentId: string }) => {
      const student = students.find(s => s.id === studentId);
      const [showPassword, setShowPassword] = useState(false);
      if (!student) return <div className="p-10 text-center">Студент не найден</div>;

      const studentSubmissions = submissions.filter(s => s.studentId === studentId);
      const debt = Math.max(0, (student.missedClasses || 0) - (student.classesMadeUp || 0));

      const handleUpdatePermissions = async (key: 'canDoTheory' | 'canDoPractice', value: boolean) => {
          const newPerms = { ...student.permissions, [key]: value };
          await updateStudent(student.id, { permissions: newPerms });
          refreshData();
      };

      const handleManualUpdate = async (key: 'missedClasses' | 'classesMadeUp', delta: number) => {
          const newVal = Math.max(0, (student[key] || 0) + delta);
          await updateStudent(student.id, { [key]: newVal });
          refreshData();
      }

      return (
          <div className="absolute inset-0 bg-white z-20 flex flex-col animate-in slide-in-from-right duration-200">
              <div className="bg-white border-b p-4 flex items-center gap-3 sticky top-0 z-10">
                  <button onClick={() => setSelectedStudentId(null)} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={24} /></button>
                  <div className="flex-1">
                      <h2 className="font-bold text-lg">{student.fullName}</h2>
                      <span className="text-sm text-gray-500">{student.groupNumber}</span>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  <div className="grid grid-cols-3 gap-3">
                      <div className="p-4 rounded-xl border bg-gray-50 text-center">
                          <div className="text-2xl font-bold text-red-600">{debt}</div>
                          <div className="text-[10px] uppercase">Долг</div>
                      </div>
                      <div className="p-4 rounded-xl border bg-gray-50 text-center relative group">
                          <div className="text-2xl font-bold">{student.missedClasses}</div>
                          <div className="text-[10px] uppercase">Пропуски</div>
                          <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1">
                              <button onClick={() => handleManualUpdate('missedClasses', -1)}><Minus size={14}/></button>
                              <button onClick={() => handleManualUpdate('missedClasses', 1)}><Plus size={14}/></button>
                          </div>
                      </div>
                      <div className="p-4 rounded-xl border bg-gray-50 text-center relative group">
                          <div className="text-2xl font-bold">{student.classesMadeUp}</div>
                          <div className="text-[10px] uppercase">Зачтено</div>
                           <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1">
                              <button onClick={() => handleManualUpdate('classesMadeUp', -1)}><Minus size={14}/></button>
                              <button onClick={() => handleManualUpdate('classesMadeUp', 1)}><Plus size={14}/></button>
                          </div>
                      </div>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                      <h3 className="font-bold mb-4">Доступ</h3>
                      <div className="space-y-4">
                          <div className="flex justify-between">
                              <span>Теория</span>
                              <button onClick={() => handleUpdatePermissions('canDoTheory', !student.permissions.canDoTheory)}>
                                  {student.permissions.canDoTheory ? <ToggleRight className="text-blue-600" size={32} /> : <ToggleLeft className="text-gray-300" size={32} />}
                              </button>
                          </div>
                          <div className="flex justify-between">
                              <span>Практика</span>
                               <button onClick={() => handleUpdatePermissions('canDoPractice', !student.permissions.canDoPractice)}>
                                  {student.permissions.canDoPractice ? <ToggleRight className="text-blue-600" size={32} /> : <ToggleLeft className="text-gray-300" size={32} />}
                              </button>
                          </div>
                      </div>
                  </div>
                  <div className="space-y-2">
                      <h3 className="font-bold">История</h3>
                      {studentSubmissions.map(sub => (
                          <div key={sub.id} className="bg-white border p-3 rounded-lg text-sm">
                              <div className="flex justify-between mb-1">
                                  <span className="font-bold text-[10px] uppercase">{sub.type}</span>
                                  <span className="text-[10px] uppercase">{sub.status}</span>
                              </div>
                              <div>{sub.type === 'THEORY' ? `Результат: ${sub.quizScore}/${sub.totalQuestions}` : sub.taskDetails?.title}</div>
                              {sub.videoUrl && <button onClick={() => setViewingVideoUrl(sub.videoUrl!)} className="text-blue-600 flex items-center gap-1 mt-1"><Play size={12}/> Смотреть</button>}
                              {sub.videoUrls && sub.videoUrls.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                      {sub.videoUrls.map((vUrl, idx) => (
                                          <button key={idx} onClick={() => setViewingVideoUrl(vUrl)} className="text-blue-600 flex items-center gap-1 text-[10px] bg-blue-50 px-2 py-1 rounded-md">
                                              <Play size={10}/> Видео {idx + 1}
                                          </button>
                                      ))}
                                  </div>
                              )}
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-2xl mx-auto border-x relative">
      <header className="bg-white border-b p-4 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-bold">Управление</h1>
            <button onClick={onLogout}><LogOut size={20} /></button>
        </div>
        <div className="flex p-1 bg-gray-100 rounded-lg">
            <button onClick={() => setActiveTab('STUDENTS')} className={`flex-1 py-2 text-sm rounded-md ${activeTab === 'STUDENTS' ? 'bg-white shadow-sm' : ''}`}>Студенты</button>
            <button onClick={() => setActiveTab('REVIEWS')} className={`flex-1 py-2 text-sm rounded-md relative ${activeTab === 'REVIEWS' ? 'bg-white shadow-sm' : ''}`}>Проверка {pendingSubmissions.length > 0 && <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full"></span>}</button>
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        {activeTab === 'STUDENTS' && (
            <div className="space-y-4">
                <input type="text" placeholder="Поиск..." className="w-full px-4 py-2 bg-white border rounded-xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <div className="grid gap-3">
                    {filteredStudents.map(student => (
                        <button key={student.id} onClick={() => setSelectedStudentId(student.id)} className="bg-white p-4 rounded-xl border flex justify-between items-center">
                            <div><div className="font-bold">{student.fullName}</div><div className="text-xs text-gray-500">{student.groupNumber}</div></div>
                            <div className="text-right"><div className="text-xl font-bold text-red-500">{Math.max(0, student.missedClasses - student.classesMadeUp)}</div><div className="text-[10px] uppercase">Долг</div></div>
                        </button>
                    ))}
                </div>
            </div>
        )}

        {activeTab === 'REVIEWS' && (
            <div className="space-y-4">
                {pendingSubmissions.map(sub => {
                    const student = students.find(s => s.id === sub.studentId);
                    return (
                        <div key={sub.id} className="bg-white p-4 rounded-xl border">
                            <div className="font-bold mb-2">{student?.fullName} ({student?.groupNumber})</div>
                            <div className="text-sm font-bold text-gray-800 mb-2">{sub.taskDetails?.title}</div>
                            
                            {sub.taskDetails?.imageUrl && (
                                <div className="mb-4 rounded-lg overflow-hidden border">
                                    <div className="bg-gray-100 px-3 py-1 text-[10px] font-bold text-gray-500 uppercase">Карточка задания</div>
                                    <img src={sub.taskDetails.imageUrl} alt="Задание" className="w-full h-auto max-h-48 object-contain bg-white" />
                                </div>
                            )}

                            <div className="space-y-2 mb-4">
                                <div className="text-[10px] font-bold text-gray-500 uppercase">Видеоматериалы:</div>
                                {sub.videoUrls && sub.videoUrls.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {sub.videoUrls.map((vUrl, idx) => (
                                            <button 
                                                key={idx} 
                                                onClick={() => setViewingVideoUrl(vUrl)} 
                                                className="aspect-video bg-black rounded-lg flex items-center justify-center relative overflow-hidden group"
                                            >
                                                <Play size={24} className="text-white z-10" />
                                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 text-center">Видео {idx + 1}</div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <button onClick={() => setViewingVideoUrl(sub.videoUrl || null)} className="w-full aspect-video bg-black rounded-lg flex items-center justify-center"><Play size={32} className="text-white"/></button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={async () => { await updateSubmissionStatus(sub.id, SubmissionStatus.REJECTED); refreshData(); }} className="py-2 border rounded-lg text-red-600 font-bold">Отклонить</button>
                                <button onClick={async () => { await updateSubmissionStatus(sub.id, SubmissionStatus.APPROVED); refreshData(); }} className="py-2 bg-emerald-600 text-white rounded-lg font-bold">Принять</button>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
      </main>

      {viewingVideoUrl && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4" onClick={() => setViewingVideoUrl(null)}>
              <button 
                  onClick={() => setViewingVideoUrl(null)} 
                  className="absolute top-4 right-4 z-[110] p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors"
                  title="Закрыть"
              >
                  <X size={32} />
              </button>
              
              <div className="w-full max-w-3xl flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
                  <div className="w-full bg-black rounded-lg shadow-2xl overflow-hidden border border-white/10">
                      <video 
                          src={viewingVideoUrl} 
                          controls 
                          autoPlay 
                          className="w-full h-auto max-h-[75vh]" 
                      />
                  </div>
                  <div className="flex gap-4">
                        <a 
                            href={viewingVideoUrl} 
                            download 
                            className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl flex items-center gap-2 transition-all border border-white/20"
                        >
                            <Download size={20} /> Скачать видео
                        </a>
                        <button 
                            onClick={() => setViewingVideoUrl(null)}
                            className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl transition-all border border-white/20"
                        >
                            Закрыть
                        </button>
                  </div>
              </div>
          </div>
      )}
      {selectedStudentId && <StudentDetailView studentId={selectedStudentId} />}
    </div>
  );
}
