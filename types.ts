
export enum UserRole {
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
  GUEST = 'GUEST',
}

export enum TaskType {
  THEORY = 'THEORY',
  PRACTICE = 'PRACTICE',
}

export enum SubmissionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  note?: string;
}

export interface PracticeTask {
  title: string;
  description: string;
  durationOrReps: string;
  imageUrl?: string;
}

export interface Submission {
  id: string;
  studentId: string;
  type: TaskType;
  status: SubmissionStatus;
  timestamp: number;
  // For Theory
  quizScore?: number;
  totalQuestions?: number;
  // For Practice
  taskDetails?: PracticeTask;
  videoUrl?: string; // Simulated URL
  videoUrls?: string[];
}

export interface StudentPermissions {
    canDoTheory: boolean;
    canDoPractice: boolean;
}

export interface Student {
  id: string;
  fullName: string;
  groupNumber: string;
  password?: string; // New field for security
  missedClasses: number;
  classesMadeUp: number;
  permissions: StudentPermissions;
}

export interface AppState {
  currentUser: Student | null; // If null, user needs to register
  role: UserRole;
}
