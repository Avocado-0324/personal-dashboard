import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';

export type GithubConnectorStatus = {
  ready: boolean;
  displayName?: string;
  error?: string;
};

export type GithubActivity = {
  id: string;
  repo: string;
  type: 'commit' | 'pr' | 'review' | 'issue' | 'other';
  title: string;
  at: string;
  url: string;
};

export type GithubActivitySummary = {
  commits: number;
  pullRequests: number;
  reviews: number;
};

export async function getGithubStatus(): Promise<GithubConnectorStatus> {
  try {
    const cookieStore = await cookies();
    const disconnectedCookie = cookieStore.get('pd_github_disconnected');
    
    if (disconnectedCookie?.value === '1') {
      return { ready: false };
    }

    const session = await auth();
    const githubToken = (session as any)?.githubAccessToken;
    const githubLogin = (session as any)?.githubLogin;
    
    if (!session || !githubToken || !githubLogin) {
      return { ready: false };
    }

    return {
      ready: true,
      displayName: githubLogin,
    };
  } catch (error) {
    return {
      ready: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function fetchGithubActivity(): Promise<{
  activities: GithubActivity[];
  summary: GithubActivitySummary;
  login: string;
}> {
  const cookieStore = await cookies();
  const disconnectedCookie = cookieStore.get('pd_github_disconnected');
  
  if (disconnectedCookie?.value === '1') {
    throw new Error('GitHub disconnected');
  }

  const session = await auth();
  const githubToken = (session as any)?.githubAccessToken;
  const login = (session as any)?.githubLogin;
  
  if (!session || !githubToken || !login) {
    throw new Error('Not authenticated');
  }

  const eventsResponse = await fetch(
    `https://api.github.com/users/${login}/events?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!eventsResponse.ok) {
    throw new Error('Failed to fetch GitHub events');
  }

  const events = await eventsResponse.json();

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentEvents = events.filter((event: any) => {
    const eventDate = new Date(event.created_at).getTime();
    return eventDate >= sevenDaysAgo;
  });

  const summary: GithubActivitySummary = {
    commits: 0,
    pullRequests: 0,
    reviews: 0,
  };

  const priorityActivities: GithubActivity[] = [];
  const otherActivities: GithubActivity[] = [];

  for (const event of recentEvents) {
    const repo = event.repo?.name || 'unknown';
    const at = event.created_at;

    switch (event.type) {
      case 'PushEvent': {
        const commitCount = event.payload?.commits?.length || 0;
        summary.commits += commitCount;
        
        const message = event.payload?.commits?.[0]?.message || 'Pushed commits';
        priorityActivities.push({
          id: event.id,
          repo,
          type: 'commit',
          title: message.split('\n')[0],
          at,
          url: `https://github.com/${repo}`,
        });
        break;
      }
      case 'PullRequestEvent': {
        summary.pullRequests++;
        
        const pr = event.payload?.pull_request;
        priorityActivities.push({
          id: event.id,
          repo,
          type: 'pr',
          title: pr?.title || 'Pull request',
          at,
          url: pr?.html_url || `https://github.com/${repo}`,
        });
        break;
      }
      case 'PullRequestReviewEvent':
      case 'PullRequestReviewCommentEvent': {
        summary.reviews++;
        
        const pr = event.payload?.pull_request;
        priorityActivities.push({
          id: event.id,
          repo,
          type: 'review',
          title: pr?.title || 'Reviewed PR',
          at,
          url: pr?.html_url || `https://github.com/${repo}`,
        });
        break;
      }
      case 'IssuesEvent': {
        const issue = event.payload?.issue;
        priorityActivities.push({
          id: event.id,
          repo,
          type: 'issue',
          title: issue?.title || 'Issue activity',
          at,
          url: issue?.html_url || `https://github.com/${repo}`,
        });
        break;
      }
      default: {
        otherActivities.push({
          id: event.id,
          repo,
          type: 'other',
          title: `${event.type.replace('Event', '')} activity`,
          at,
          url: `https://github.com/${repo}`,
        });
        break;
      }
    }
  }

  const activities = [...priorityActivities.slice(0, 3)];
  if (activities.length < 3) {
    activities.push(...otherActivities.slice(0, 3 - activities.length));
  }

  return {
    activities,
    summary,
    login,
  };
}
