export const INTERVIEW_TOPICS = [
  'current_projects',
  'key_contacts',
  'undocumented_processes',
  'access_credentials',
  'successor_recommendations',
] as const;

export type InterviewTopic = (typeof INTERVIEW_TOPICS)[number];
