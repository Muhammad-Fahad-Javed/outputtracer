// Type definitions for OutputTracer Learn Platform

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "exact_output"
  | "output_prediction"
  | "code_trace"
  | "short_answer";

export type CourseDifficulty = "beginner" | "intermediate" | "advanced" | "Beginner" | "Intermediate" | "Advanced" | "All Levels";

export interface LearnLanguage {
  id: string; // 'cpp' | '8086-assembly' | string
  slug?: string;
  name: string;
  description: string;
  icon?: string;
  display_order?: number;
  displayOrder?: number;
  is_published?: boolean;
  isPublished?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LearnCourse {
  id: string; // slug e.g. 'cpp-fundamentals'
  slug?: string;
  language_id?: string;
  languageId?: string;
  languageSlug?: string;
  languageName?: string;
  title: string;
  description: string;
  difficulty: CourseDifficulty;
  estimated_duration?: string;
  estimatedDuration?: string;
  estimatedHours?: number | string;
  thumbnail_icon?: string;
  thumbnailIcon?: string;
  display_order?: number;
  displayOrder?: number;
  is_published?: boolean;
  isPublished?: boolean;
  created_at?: string;
  updated_at?: string;
  // Computed / aggregated optional fields
  modules?: LearnModule[];
  lesson_count?: number;
  totalLessons?: number;
  question_count?: number;
  totalQuestions?: number;
  progress_percentage?: number;
  progressPercent?: number;
  completed_lessons_count?: number;
  completedLessons?: number;
}

export interface LearnModule {
  id: string;
  course_id?: string;
  courseId?: string;
  title: string;
  description?: string;
  display_order?: number;
  displayOrder?: number;
  is_published?: boolean;
  isPublished?: boolean;
  created_at?: string;
  updated_at?: string;
  lessons?: LearnLesson[];
}

export interface LearnLesson {
  id: string;
  slug?: string;
  module_id?: string;
  moduleId?: string;
  course_id?: string;
  courseId?: string;
  title: string;
  notes?: string; // Markdown notes
  content?: string; // Unified markdown content
  code_snippet?: string;
  starterCode?: string;
  expected_output?: string;
  explanation?: string;
  estimated_minutes?: number;
  estimatedMinutes?: number;
  display_order?: number;
  displayOrder?: number;
  is_published?: boolean;
  isPublished?: boolean;
  created_at?: string;
  updated_at?: string;
  is_completed?: boolean;
  isCompleted?: boolean;
  questionCount?: number;
  questions?: LearnQuestion[];
}

export interface LearnQuestion {
  id: string;
  lesson_id?: string | null;
  lessonId?: string | null;
  course_id?: string;
  courseId?: string;
  type: QuestionType;
  title?: string;
  prompt?: string; // Unified prompt
  question_text?: string;
  code_snippet?: string;
  codeSnippet?: string;
  options?: string[]; // Multiple choice options
  answer?: string; // Kept server-side, masked on student client
  explanation: string;
  hint?: string;
  points: number;
  difficulty?: "Easy" | "Medium" | "Hard" | "easy" | "medium" | "hard";
  display_order?: number;
  displayOrder?: number;
  is_published?: boolean;
  isPublished?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LearnEnrollment {
  id: string;
  user_id: string;
  course_id: string;
  last_accessed_lesson_id?: string | null;
  started_at: string;
  updated_at: string;
}

export interface LearnLessonCompletion {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  completed_at: string;
}

export interface LearnQuestionAttempt {
  id: string;
  user_id: string;
  course_id: string;
  question_id: string;
  submitted_answer: string;
  is_correct: boolean;
  points_awarded: number;
  created_at: string;
}

export interface StudentDashboardSummary {
  enrolledCourses: {
    courseId: string;
    courseSlug: string;
    courseTitle: string;
    languageSlug: string;
    languageName: string;
    completedLessons: number;
    totalLessons: number;
    progressPercent: number;
  }[];
  completedLessons: number;
  totalLessonsAcrossAllCourses: number;
  questionsAttempted: number;
  questionsCorrect: number;
  accuracyPercent: number;
  totalPoints: number;
  overallProgressPercent: number;
  recentAttempts: {
    id: string;
    questionPrompt: string;
    submittedAnswer: string;
    isCorrect: boolean;
    earnedPoints: number;
    createdAt: string;
  }[];
  recentLessons?: {
    lesson: LearnLesson;
    course: LearnCourse;
    completedAt?: string;
  }[];
}

export interface AdminAnalyticsSummary {
  totalLearners: number;
  totalCourses: number;
  publishedCourses: number;
  publishedCoursesCount?: number;
  totalLessons: number;
  totalEnrollments: number;
  totalCompletions: number;
  totalLessonCompletions?: number;
  totalAttempts: number;
  averageAccuracy: number;
  popularCourses: {
    courseId: string;
    courseTitle: string;
    enrollmentCount: number;
    completionCount: number;
  }[];
}
