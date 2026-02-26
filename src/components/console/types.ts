export type StatsPeriod = "24h" | "7d" | "30d";

export interface ConsoleStatsDataPoint {
  time: string;
  playerCount: number;
  maxPlayers: number;
  isOnline: boolean;
}

export interface ConsoleStatsSummary {
  avgPlayers: number;
  peakPlayers: number;
  peakTime: string;
  uptimePercent: number;
  totalChecks: number;
  onlineChecks: number;
}

export interface ConsoleHourlyAveragePoint {
  hour: string;
  avgPlayers: number;
  sampleCount: number;
}

export interface ConsoleStatsResponse {
  period: StatsPeriod;
  dataPoints: ConsoleStatsDataPoint[];
  summary: ConsoleStatsSummary;
  hourlyAverages: ConsoleHourlyAveragePoint[];
}
