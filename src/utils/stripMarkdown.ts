export function stripMarkdownFences(value: string): string {
  const trimmed = value.trim();
  const fullFenceMatch = trimmed.match(/^```(?:[A-Za-z0-9_-]+)?\s*[\r\n]+([\s\S]*?)[\r\n]+```$/);

  if (fullFenceMatch?.[1]) {
    return fullFenceMatch[1].trim();
  }

  const firstFenceMatch = trimmed.match(/```(?:[A-Za-z0-9_-]+)?\s*[\r\n]+([\s\S]*?)[\r\n]+```/);

  if (firstFenceMatch?.[1]) {
    return firstFenceMatch[1].trim();
  }

  return trimmed;
}
