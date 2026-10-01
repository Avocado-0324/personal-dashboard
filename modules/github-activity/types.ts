export type GithubActivityData = {
  windowDays: 7;
  summary: { commits: number; pullRequests: number; reviews: number };
  items: Array<{
    id: string;
    repo: string;
    type: 'commit' | 'pr' | 'review' | 'issue' | 'other';
    title: string;
    at: string;
    url: string;
  }>;
  login: string;
};
