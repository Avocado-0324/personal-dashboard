import { cookies } from 'next/headers';
import { decryptToken } from '@/lib/crypto';

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

type GithubConnection = {
  token: string;
  login: string;
  id: number;
};

async function getGithubConnection(): Promise<GithubConnection | null> {
  try {
    const cookieStore = await cookies();
    const connectionCookie = cookieStore.get('pd_github_connection');
    
    if (!connectionCookie?.value) {
      return null;
    }

    const data = JSON.parse(connectionCookie.value);
    return data;
  } catch (error) {
    console.error('Error reading GitHub connection:', error);
    return null;
  }
}

export async function getGithubStatus(): Promise<GithubConnectorStatus> {
  try {
    const cookieStore = await cookies();
    const disconnectedCookie = cookieStore.get('pd_github_disconnected');
    
    if (disconnectedCookie?.value === '1') {
      return { ready: false };
    }

    const connection = await getGithubConnection();
    
    if (!connection) {
      return { ready: false };
    }

    return {
      ready: true,
      displayName: connection.login,
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

  const connection = await getGithubConnection();
  
  if (!connection) {
    throw new Error('Not authenticated');
  }

  let githubToken: string;
  try {
    githubToken = decryptToken(connection.token);
  } catch (error) {
    console.error('Failed to decrypt GitHub token:', error);
    throw new Error('Invalid token');
  }

  const eventsResponse = await fetch(
    `https://api.github.com/users/${connection.login}/events?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!eventsResponse.ok) {
    if (eventsResponse.status === 401) {
      const error = new Error('GitHub token expired or invalid');
      (error as any).code = 'GITHUB_UNAUTHORIZED';
      throw error;
    }
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
        
        const message = commitCount > 1 
          ? `推送了 ${commitCount} 个提交到 ${event.payload?.ref?.replace('refs/heads/', '') || 'main'}`
          : event.payload?.commits?.[0]?.message?.split('\n')[0] || '推送了提交';
        priorityActivities.push({
          id: event.id,
          repo,
          type: 'commit',
          title: message,
          at,
          url: `https://github.com/${repo}/commits/${event.payload?.head || ''}`,
        });
        break;
      }
      case 'PullRequestEvent': {
        summary.pullRequests++;
        
        const pr = event.payload?.pull_request;
        const action = event.payload?.action;
        let actionText = '';
        if (action === 'opened') actionText = '打开了 PR';
        else if (action === 'closed' && pr?.merged) actionText = '合并了 PR';
        else if (action === 'closed') actionText = '关闭了 PR';
        else actionText = 'PR';
        
        const title = actionText + (pr?.title ? `：${pr.title}` : '');
        priorityActivities.push({
          id: event.id,
          repo,
          type: 'pr',
          title,
          at,
          url: pr?.html_url || `https://github.com/${repo}`,
        });
        break;
      }
      case 'PullRequestReviewEvent':
      case 'PullRequestReviewCommentEvent': {
        summary.reviews++;
        
        const pr = event.payload?.pull_request;
        const title = pr?.title ? `审查了 PR：${pr.title}` : '审查了 PR';
        priorityActivities.push({
          id: event.id,
          repo,
          type: 'review',
          title,
          at,
          url: pr?.html_url || `https://github.com/${repo}`,
        });
        break;
      }
      case 'IssuesEvent': {
        const issue = event.payload?.issue;
        const action = event.payload?.action;
        let actionText = '';
        if (action === 'opened') actionText = '创建了 Issue';
        else if (action === 'closed') actionText = '关闭了 Issue';
        else actionText = 'Issue';
        
        const title = actionText + (issue?.title ? `：${issue.title}` : '');
        priorityActivities.push({
          id: event.id,
          repo,
          type: 'issue',
          title,
          at,
          url: issue?.html_url || `https://github.com/${repo}`,
        });
        break;
      }
      default: {
        let activityType = event.type.replace('Event', '');
        const typeMap: Record<string, string> = {
          'Create': '创建了分支或标签',
          'Delete': '删除了分支或标签',
          'Fork': 'Fork 了仓库',
          'Watch': '关注了仓库',
          'Star': '标星了仓库',
          'Release': '发布了版本',
          'IssueComment': '评论了 Issue',
          'CommitComment': '评论了提交',
        };
        const activityText = typeMap[activityType] || `${activityType} 活动`;
        
        otherActivities.push({
          id: event.id,
          repo,
          type: 'other',
          title: activityText,
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
    login: connection.login,
  };
}
