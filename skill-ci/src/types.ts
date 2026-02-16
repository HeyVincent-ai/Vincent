export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface SkillTestResult {
  success: boolean;
  toolCalls: ToolCallRecord[];
  finalText: string;
  error?: string;
  steps: number;
}
