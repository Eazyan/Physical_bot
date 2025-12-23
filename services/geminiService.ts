import { QuizQuestion, PracticeTask } from "../types";

// Статическая база вопросов (Теория)
const QUESTION_BANK: QuizQuestion[] = [
  {
    question: "Сколько игроков одной команды находятся на площадке во время волейбольного матча?",
    options: ["5 игроков", "6 игроков", "7 игроков", "11 игроков"],
    correctAnswerIndex: 1,
  },
  {
    question: "Какова продолжительность тайма в классическом футболе?",
    options: ["30 минут", "40 минут", "45 минут", "60 минут"],
    correctAnswerIndex: 2,
  },
  {
    question: "Что из перечисленного является олимпийским видом спорта?",
    options: ["Шахматы", "Керлинг", "Боулинг", "Дартс"],
    correctAnswerIndex: 1,
  },
  {
    question: "Какой витамин вырабатывается в организме человека под воздействием солнечных лучей?",
    options: ["Витамин А", "Витамин С", "Витамин D", "Витамин Е"],
    correctAnswerIndex: 2,
  },
  {
    question: "Как называется бег на короткие дистанции?",
    options: ["Марафон", "Спринт", "Кросс", "Стайерский бег"],
    correctAnswerIndex: 1,
  },
  {
    question: "Какова высота баскетбольного кольца от пола?",
    options: ["2.90 м", "3.00 м", "3.05 м", "3.15 м"],
    correctAnswerIndex: 2,
  },
  {
    question: "Что означает аббревиатура ГТО?",
    options: ["Готов к труду и обороне", "Главное тренировочное общество", "Городское творческое объединение", "Готовность тела отличная"],
    correctAnswerIndex: 0,
  },
  {
    question: "Сколько очков дается за попадание штрафного броска в баскетболе?",
    options: ["1 очко", "2 очка", "3 очка", "0.5 очка"],
    correctAnswerIndex: 0,
  },
  {
    question: "Какой стиль плавания считается самым быстрым?",
    options: ["Брасс", "Баттерфляй", "Кроль на спине", "Кроль (вольный стиль)"],
    correctAnswerIndex: 3,
  },
  {
    question: "В каком году проходила Олимпиада в Сочи?",
    options: ["2010", "2012", "2014", "2018"],
    correctAnswerIndex: 2,
  },
];

// Статическая база заданий (Практика)
const TASK_BANK: PracticeTask[] = [
  {
    title: "Приседания",
    description: "Выполните классические приседания. Спина прямая, пятки не отрывать от пола, присед до параллели с полом.",
    durationOrReps: "30 повторений",
  },
  {
    title: "Отжимания от пола",
    description: "Упор лежа, руки на ширине плеч. Касание грудью пола (или предмета высотой 5-10 см).",
    durationOrReps: "20 повторений",
  },
  {
    title: "Планка",
    description: "Удержание позиции 'планка' на локтях. Тело должно образовывать прямую линию.",
    durationOrReps: "1 минута 30 секунд",
  },
  {
    title: "Бёрпи (Burpees)",
    description: "Упор присев, упор лежа (отжаться), упор присев, выпрыгивание вверх с хлопком над головой.",
    durationOrReps: "15 повторений",
  },
  {
    title: "Прыжки на скакалке",
    description: "Непрерывные прыжки на скакалке в среднем темпе.",
    durationOrReps: "2 минуты",
  },
  {
    title: "Пресс (Скручивания)",
    description: "Лежа на спине, ноги согнуты в коленях. Подъем корпуса к коленям.",
    durationOrReps: "40 повторений",
  },
  {
    title: "Выпады",
    description: "Попеременные выпады ногами вперед. Спина прямая, колено задней ноги почти касается пола.",
    durationOrReps: "20 повторений на каждую ногу",
  },
];

// Функция перемешивания массива (Фишер-Йетс)
function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export const generateQuiz = async (topic: string = "Общая физкультура"): Promise<QuizQuestion[]> => {
  // Имитация задержки сети
  await new Promise(resolve => setTimeout(resolve, 600));
  
  // Возвращаем 5 случайных вопросов
  return shuffle(QUESTION_BANK).slice(0, 5);
};

export const generatePracticeTask = async (): Promise<PracticeTask> => {
  // Имитация задержки сети
  await new Promise(resolve => setTimeout(resolve, 600));
  
  // Возвращаем 1 случайное задание
  const randomIndex = Math.floor(Math.random() * TASK_BANK.length);
  return TASK_BANK[randomIndex];
};