// API Configuration
export const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

export const PROCESS_CALL_ENDPOINT = '/process-call';

// Score thresholds for grading
export const GRADE_THRESHOLDS = {
  A: 90,
  B: 80,
  C: 70,
  D: 60,
  F: 0
};

// Score colors
export const SCORE_COLORS = {
  A: '#10b981', // green
  B: '#3b82f6', // blue
  C: '#f59e0b', // orange
  D: '#ef4444', // red
  F: '#dc2626'  // darker red
};

export const getGrade = (score) => {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
};

export const getGradeLabel = (score) => {
  const grade = getGrade(score);
  const labels = {
    A: 'Excellent',
    B: 'Good',
    C: 'Satisfactory',
    D: 'Needs Improvement',
    F: 'Poor'
  };
  return labels[grade];
};

export const getScoreColor = (score) => {
  const grade = getGrade(score);
  return SCORE_COLORS[grade];
};
