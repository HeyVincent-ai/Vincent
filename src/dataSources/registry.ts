export interface EndpointConfig {
  description: string;
  costUsd: number;
}

export interface DataSourceConfig {
  id: string;
  displayName: string;
  description: string;
  status: 'active' | 'coming_soon';
  endpoints: Record<string, EndpointConfig>;
}

const DATA_SOURCES: DataSourceConfig[] = [
  {
    id: 'twitter',
    displayName: 'Twitter / X.com',
    description: 'Search tweets, get user profiles, and retrieve recent tweets via the X API v2.',
    status: 'active',
    endpoints: {
      search: { description: 'Search recent tweets', costUsd: 0.01 },
      'get-tweet': { description: 'Get tweet by ID', costUsd: 0.005 },
      'get-user': { description: 'Get user profile by username', costUsd: 0.005 },
      'user-tweets': { description: "Get a user's recent tweets", costUsd: 0.01 },
    },
  },
  {
    id: 'brave',
    displayName: 'Brave Search',
    description: 'Web and news search powered by Brave Search.',
    status: 'active',
    endpoints: {
      web: { description: 'Web search', costUsd: 0.005 },
      news: { description: 'News search', costUsd: 0.005 },
    },
  },
];

const dataSourceMap = new Map(DATA_SOURCES.map((ds) => [ds.id, ds]));

export function getDataSource(id: string): DataSourceConfig | undefined {
  return dataSourceMap.get(id);
}

export function getAllDataSources(): DataSourceConfig[] {
  return DATA_SOURCES;
}

export function getEndpointCost(dataSourceId: string, endpoint: string): number | undefined {
  const ds = dataSourceMap.get(dataSourceId);
  if (!ds) return undefined;
  return ds.endpoints[endpoint]?.costUsd;
}
