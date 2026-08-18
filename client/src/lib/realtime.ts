export const REALTIME_REFRESH_INTERVAL_MS = 5_000;

export const realtimeQueryDefaults = {
  staleTime: 0,
  refetchInterval: REALTIME_REFRESH_INTERVAL_MS,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: true,
} as const;
