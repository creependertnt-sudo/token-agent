export function inferMemoryUsage(input: {
  injectedCount: number;
  toolNames: string[];
  categories?: string[];
}): {
  memoryInjectedCount: number;
  memoryUsedCount: number;
  memoryCategory: string | null;
} {
  const used = input.toolNames.includes("query_memory") ? 1 : 0;
  const memoryCategory = input.categories?.[0] ?? null;
  return {
    memoryInjectedCount: input.injectedCount,
    memoryUsedCount: used,
    memoryCategory,
  };
}
