import { auth } from '@/lib/auth';

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
    const session = await auth();
    
    if (!session || !(session as any).accessToken) {
      return { ready: false };
    }

    const account = (session as any).account;
    if (account && account.provider === 'github') {
      return {
        ready: true,
        displayName: (session as any).githubLogin || session.user?.name || undefined,
      };
    }

    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${(session as any).accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      return { ready: false };
    }

    const userData = await response.json();
    return {
      ready: true,
      displayName: userData.login,
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
  const session = await auth();
  
  if (!session || !(session as any).accessToken) {
    throw new Error('Not authenticated');
  }

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${(session as any).accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!userResponse.ok) {
    throw new Error('Failed to fetch user info');
  }

  const userData = await userResponse.json();
  const login = userData.login;

  const eventsResponse = await fetch(
    `https://api.github.com/users/${login}/events?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${(session as any).accessToken}`,
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

  const activities: GithubActivity[] = [];

  for (const event of recentEvents) {
    const repo = event.repo?.name || 'unknown';
    const at = event.created_at;
    let activity: GithubActivity | null = null;

    switch (event.type) {
      case 'PushEvent': {
        const commitCount = event.payload?.commits?.length || 0;
        summary.commits += commitCount;
        
        if (activities.length < 3) {
          const message = event.payload?.commits?.[0]?.message || 'Pushed commits';
          activity = {
            id: event.id,
            repo,
            type: 'commit',
            title: message.split('\n')[0],
            at,
            url: `https://github.com/${repo}`,
          };
        }
        break;
      }
      case 'PullRequestEvent': {
        summary.pullRequests++;
        
        if (activities.length < 3) {
          const pr = event.payload?.pull_request;
          activity = {
            id: event.id,
            repo,
            type: 'pr',
            title: pr?.title || 'Pull request',
            at,
            url: pr?.html_url || `https://github.com/${repo}`,
          };
        }
        break;
      }
      case 'PullRequestReviewEvent':
      case 'PullRequestReviewCommentEvent': {
        summary.reviews++;
        
        if (activities.length < 3) {
          const pr = event.payload?.pull_request;
          activity = {
            id: event.id,
            repo,
            type: 'review',
            title: pr?.title || 'Reviewed PR',
            at,
            url: pr?.html_url || `https://github.com/${repo}`,
          };
        }
        break;
      }
      case 'IssuesEvent': {
        if (activities.length < 3) {
          const issue = event.payload?.issue;
          activity = {
            id: event.id,
            repo,
            type: 'issue',
            title: issue?.title || 'Issue activity',
            at,
            url: issue?.html_url || `https://github.com/${repo}`,
          };
        }
        break;
      }
      default: {
        if (activities.length < 3) {
          activity = {
            id: event.id,
            repo,
            type: 'other',
            title: `${event.type.replace('Event', '')} activity`,
            at,
            url: `https://github.com/${repo}`,
          };
        }
        break;
      }
    }

    if (activity && activities.length < 3) {
      activities.push(activity);
    }
  }

  return {
    activities,
    summary,
    login,
  };
}
