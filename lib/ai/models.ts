/** One shared model for every application skill. Skills are prompts, not separate models. */
export const AI_MODEL = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';
export type AITask = 'worksheet'|'lesson'|'quiz'|'explain'|'story'|'questions'|'lesson-plan'|'notice'|'school-report'|'assistant';
export const TEACHER_TASKS: AITask[] = ['worksheet','lesson','quiz','explain','story','questions','lesson-plan'];
export const ADMIN_TASKS: AITask[] = ['notice','school-report','assistant'];
