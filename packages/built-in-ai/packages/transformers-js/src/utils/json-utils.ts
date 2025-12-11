/**
 * Utility functions for JSON parsing and validation.
 */

/**
 * Extracts the first balanced and *valid* JSON object or array from a string.
 * Handles nested structures, strings, and escaped characters correctly.
 *
 * @param text The input string potentially containing JSON.
 * @returns The extracted JSON string, or null if no balanced and valid JSON is found.
 */
export function extractJsonPayload(text: string): string | null {
  let jsonStart = -1;
  let bracketStack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (jsonStart === -1) {
      // Look for the start of a new JSON object or array, skipping whitespace
      if (char === '{' || char === '[') {
        jsonStart = i;
        bracketStack.push(char);
        inString = false; // Reset for new JSON context
        escaped = false; // Reset for new JSON context
      }
      continue; // Keep scanning for a start character
    }

    // Process characters within a potential JSON block
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{' || char === '[') {
        bracketStack.push(char);
      } else if (char === '}' || char === ']') {
        const lastOpenBracket = bracketStack.pop();

        if (!lastOpenBracket ||
            (char === '}' && lastOpenBracket !== '{') ||
            (char === ']' && lastOpenBracket !== '[')) {
          // Malformed bracket sequence. Discard this block.
          // Reset state and continue search from the character AFTER jsonStart of this failed block.
          jsonStart = -1;
          bracketStack = [];
          inString = false;
          escaped = false;
          // The outer loop will increment 'i', effectively moving past the current char.
          // We need to move 'i' past the *start* of the discarded block if we want to
          // truly skip it and search for new JSON *after* it.
          // However, the `continue` already means the current char is skipped.
          // So this needs to be `i = jsonStart;` and let the loop do `i++` to move past it.
          // Or, just advance `jsonStart` to `i + 1` for the next scan.
          // A clean way is to reset jsonStart to -1 and advance 'i' to jsonStart (old value), and next loop iteration does ++i
          // This allows searching from next character
          // Simplified: just let `i` advance, but `jsonStart` must be reset correctly.
          continue;
        }

        if (bracketStack.length === 0) {
          const potentialJson = text.substring(jsonStart, i + 1);
          try {
            JSON.parse(potentialJson); // Final validation
            return potentialJson; // Return the first valid JSON found
          } catch (e) {
            // Valid bracket balance but not valid JSON syntax. Discard this block.
            // Reset state and continue search from the character AFTER this malformed block.
            jsonStart = -1;
            bracketStack = [];
            inString = false;
            escaped = false;
            // The current 'i' marks the end of the malformed block.
            // When the loop continues, 'i' will be incremented, and search
            // will resume from 'i+1', effectively skipping the malformed block.
            continue;
          }
        }
      }
    }
  }

  return null; // No complete, balanced and valid JSON payload found
}
