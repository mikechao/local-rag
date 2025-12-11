/**
 * JsonFenceDetector - Detects and extracts JSON objects/arrays from streaming text.
 *
 * This module handles the complex task of detecting balanced JSON structures
 * in a stream, accounting for nested brackets, string literals, and escape sequences.
 */

export interface JsonStreamResult {
  /** Newly identified JSON content to emit immediately */
  delta: string;
  /** Whether the JSON object has fully closed */
  complete: boolean;
  /** If true, we are still scanning for the start of JSON (first '{' or '[') */
  waitingForStart: boolean;
  /** True if JSON extraction failed (e.g., malformed, max buffer exceeded before start) */
  failed: boolean;
  /** Optional error message if extraction failed */
  errorMessage?: string;
}

enum DetectorState {
  FINDING_START,
  TRACKING_DEPTH,
  COMPLETED,
  FAILED,
}

export class JsonFenceDetector {
  private buffer: string = "";
  private state: DetectorState = DetectorState.FINDING_START;
  private depth: number = 0;
  private inString: boolean = false;
  private isEscaped: boolean = false;
  private rootChar: "{" | "[" | null = null;
  private currentJsonStart: number = -1; // Index in the *stream* where current JSON candidate started

  private readonly MAX_PREFIX_LENGTH = 500; // Max chars to buffer before JSON start

  /**
   * Adds a chunk of text to the internal buffer.
   * @param chunk The text chunk to add.
   */
  addChunk(chunk: string): void {
    this.buffer += chunk;
  }

  /**
   * Processes the buffer to detect and extract JSON content.
   * @returns A JsonStreamResult object detailing the progress.
   */
  process(): JsonStreamResult {
    if (this.state === DetectorState.COMPLETED || this.state === DetectorState.FAILED) {
      // If already completed or failed, there's no new delta for JSON itself.
      return {
        delta: "",
        complete: this.state === DetectorState.COMPLETED,
        waitingForStart: false,
        failed: this.state === DetectorState.FAILED,
        errorMessage: this.state === DetectorState.FAILED ? "JSON extraction failed due to malformed content or exceeding buffer limit." : undefined,
      };
    }

    let emittedDelta = "";
    let i = 0; // Pointer for current position in buffer

    while (i < this.buffer.length) {
      const char = this.buffer[i];

      if (this.state === DetectorState.FINDING_START) {
        if (char === "{" || char === "[") {
          // Found JSON start
          this.state = DetectorState.TRACKING_DEPTH;
          this.rootChar = char;
          this.depth = 1;
          this.currentJsonStart = i; // Mark start relative to current buffer
          emittedDelta += char;
        } else {
          // Emit non-JSON prefix
          emittedDelta += char;
          // If we exceed MAX_PREFIX_LENGTH while still looking for start, fail
          // Check this AFTER adding the char, so emittedDelta contains the full prefix that caused the overflow
          if (emittedDelta.length > this.MAX_PREFIX_LENGTH) {
            this.state = DetectorState.FAILED;
            this.buffer = this.buffer.substring(i + 1); // Discard processed part
            return {
               delta: emittedDelta, // Emit the full accumulated prefix
               complete: false,
               waitingForStart: false,
               failed: true,
               errorMessage: "Exceeded max prefix length without finding JSON start.",
            };
          }
        }
      } else if (this.state === DetectorState.TRACKING_DEPTH) {
        if (this.isEscaped) {
          this.isEscaped = false;
          emittedDelta += char;
        } else if (char === '\\') {
          this.isEscaped = true;
          emittedDelta += char;
        } else if (char === '"') {
          this.inString = !this.inString;
          emittedDelta += char;
        } else if (!this.inString) {
          if (char === "{" || char === "[") {
            this.depth++;
            emittedDelta += char;
          } else if (char === "}" || char === "]") {
            this.depth--;
            emittedDelta += char;

            if (this.depth === 0) {
              // Found a complete, balanced JSON payload
              if (
                (this.rootChar === "{" && char !== "}") ||
                (this.rootChar === "[" && char !== "]")
              ) {
                // Malformed: mismatch root char. Fail.
                this.state = DetectorState.FAILED;
                this.buffer = this.buffer.substring(i + 1);
                return {
                    delta: emittedDelta, // Emit up to the point of failure
                    complete: false,
                    waitingForStart: false,
                    failed: true,
                    errorMessage: "JSON parsing failed due to mismatched root bracket.",
                };
              }

              // Successfully completed a JSON object/array
              this.state = DetectorState.COMPLETED;
              this.buffer = this.buffer.substring(i + 1); // Keep remaining text in buffer
              return {
                delta: emittedDelta,
                complete: true,
                waitingForStart: false,
                failed: false,
              };
            }
          } else {
            emittedDelta += char; // Non-structural character within JSON
          }
        } else {
          emittedDelta += char; // Inside a string
        }
      }
      i++;
    }

    // If we've processed the entire buffer but haven't completed JSON yet
    this.buffer = ""; // Clear buffer as it's either emitted or consumed
    return {
      delta: emittedDelta,
      complete: this.state === DetectorState.COMPLETED,
      waitingForStart: this.state === DetectorState.FINDING_START,
      failed: this.state === DetectorState.FAILED,
      errorMessage: this.state === DetectorState.FAILED ? (this.errorMessage || "JSON extraction failed.") : undefined,
    };
  }


  /**
   * Checks if the detector is currently in the process of finding the JSON start.
   */
  isWaitingForStart(): boolean {
    return this.state === DetectorState.FINDING_START;
  }

  /**
   * Checks if the detector has successfully completed JSON extraction.
   */
  isComplete(): boolean {
    return this.state === DetectorState.COMPLETED;
  }

  /**
   * Checks if the detector has encountered an error during JSON extraction.
   */
  isFailed(): boolean {
    return this.state === DetectorState.FAILED;
  }

  /**
   * Returns the current accumulated buffer content.
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Clears the internal buffer.
   */
  clearBuffer(): void {
    this.buffer = "";
  }
}
