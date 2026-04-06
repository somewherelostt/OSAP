/**
 * Robustly extracts and parses JSON from a string, handling markdown code blocks,
 * leading/trailing text, and other common LLM output artifacts.
 */
export function extractJSON<T = any>(content: string): T {
  // 1. Try direct parse first (cleanest case)
  try {
    return JSON.parse(content.trim());
  } catch (e) {
    // Continue if direct parse fails
  }

  // 2. Try to find JSON markdown blocks: ```json { ... } ``` or ``` { ... } ```
  const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (markdownMatch && markdownMatch[1]) {
    try {
      return JSON.parse(markdownMatch[1].trim());
    } catch (e) {
      // Continue if markdown content is still not valid JSON
    }
  }

  // 3. Fallback: Find the first '{' and last '}' to extract the main JSON object
  const startIdx = content.indexOf('{');
  const endIdx = content.lastIndexOf('}');

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const rawJson = content.substring(startIdx, endIdx + 1);
    try {
      return JSON.parse(rawJson.trim());
    } catch (e) {
      throw new Error(`Failed to parse extracted JSON: ${e instanceof Error ? e.message : 'Unknown error'}. Content: ${rawJson.substring(0, 50)}...`);
    }
  }

  throw new Error(`No valid JSON object found in content: ${content.substring(0, 100)}...`);
}
