import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  SharedV3Warning,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LoadSettingError,
  JSONValue,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
} from "@ai-sdk/provider"
import { convertToBuiltInAIMessages } from "./convert-to-built-in-ai-messages";

export type BuiltInAIChatModelId = "text";

export interface BuiltInAIChatSettings extends LanguageModelCreateOptions {
  /**
   * Expected input types for the session, for multimodal inputs.
   */
  expectedInputs?: Array<{
    type: "text" | "image" | "audio";
    languages?: string[];
  }>;
}

/**
 * Check if the browser supports the built-in AI API
 * @returns true if the browser supports the built-in AI API, false otherwise
 */
export function doesBrowserSupportBuiltInAI(): boolean {
  return typeof LanguageModel !== "undefined";
}

/**
 * Check if the Prompt API is available
 * @deprecated Use `doesBrowserSupportBuiltInAI()` instead for clearer naming
 * @returns true if the browser supports the built-in AI API, false otherwise
 */
export function isBuiltInAIModelAvailable(): boolean {
  return typeof LanguageModel !== "undefined";
}

type BuiltInAIConfig = {
  provider: string;
  modelId: BuiltInAIChatModelId;
  options: BuiltInAIChatSettings;
};

/**
 * Detect if the prompt contains multimodal content
 */
function hasMultimodalContent(prompt: LanguageModelV3Prompt): boolean {
  for (const message of prompt) {
    if (message.role === "user") {
      for (const part of message.content) {
        if (part.type === "file") {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Get expected inputs based on prompt content
 */
function getExpectedInputs(
  prompt: LanguageModelV3Prompt,
): Array<{ type: "text" | "image" | "audio" }> {
  const inputs = new Set<"text" | "image" | "audio">();
  // Don't add text by default - it's assumed by the Prompt API

  for (const message of prompt) {
    if (message.role === "user") {
      for (const part of message.content) {
        if (part.type === "file") {
          if (part.mediaType?.startsWith("image/")) {
            inputs.add("image");
          } else if (part.mediaType?.startsWith("audio/")) {
            inputs.add("audio");
          }
        }
      }
    }
  }

  return Array.from(inputs).map((type) => ({ type }));
}

export class BuiltInAIChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3";
  readonly modelId: BuiltInAIChatModelId;
  readonly provider = "browser-ai";

  private readonly config: BuiltInAIConfig;
  private session: LanguageModel | null = null;

  constructor(
    modelId: BuiltInAIChatModelId,
    options: BuiltInAIChatSettings = {},
  ) {
    this.modelId = modelId;
    this.config = {
      provider: this.provider,
      modelId,
      options,
    };
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    "image/*": [/^https?:\/\/.+$/],
    "audio/*": [/^https?:\/\/.+$/],
  };

  private async getSession(
    options?: LanguageModelCreateOptions,
    expectedInputs?: Array<{ type: "text" | "image" | "audio" }>,
    systemMessage?: string,
    onDownloadProgress?: (progress: number) => void,
  ): Promise<LanguageModel> {
    if (typeof LanguageModel === "undefined") {
      throw new LoadSettingError({
        message:
          "Prompt API is not available. This library requires Chrome or Edge browser with built-in AI capabilities.",
      });
    }

    if (this.session) return this.session;

    const availability = await LanguageModel.availability();

    if (availability === "unavailable") {
      throw new LoadSettingError({ message: "Built-in model not available" });
    }

    const mergedOptions = {
      ...this.config.options,
      ...options,
    };

    // Add system message to initialPrompts if provided
    if (systemMessage) {
      mergedOptions.initialPrompts = [
        { role: "system", content: systemMessage },
      ];
    }

    // Add expected inputs if provided
    if (expectedInputs && expectedInputs.length > 0) {
      mergedOptions.expectedInputs = expectedInputs;
    }

    // Add download progress monitoring if callback provided
    if (onDownloadProgress) {
      mergedOptions.monitor = (m: CreateMonitor) => {
        m.addEventListener("downloadprogress", (e: ProgressEvent) => {
          onDownloadProgress(e.loaded); // e.loaded is between 0 and 1
        });
      };
    }

    this.session = await LanguageModel.create(mergedOptions);

    return this.session;
  }

  private getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    tools,
  }: Parameters<LanguageModelV3["doGenerate"]>[0]) {
    const warnings: SharedV3Warning[] = [];

    // Add warnings for unsupported settings
    if (tools && tools.length > 0) {
      warnings.push({
        type: "unsupported",
        feature: "tools",
        details: "Tool calling is not yet supported by Prompt API",
      });
    }

    if (maxOutputTokens != null) {
      warnings.push({
        type: "unsupported",
        feature: "maxOutputTokens",
        details: "maxOutputTokens is not supported by Prompt API",
      });
    }

    if (stopSequences != null) {
      warnings.push({
        type: "unsupported",
        feature: "stopSequences",
        details: "stopSequences is not supported by Prompt API",
      });
    }

    if (topP != null) {
      warnings.push({
        type: "unsupported",
        feature: "topP",
        details: "topP is not supported by Prompt API",
      });
    }

    if (presencePenalty != null) {
      warnings.push({
        type: "unsupported",
        feature: "presencePenalty",
        details: "presencePenalty is not supported by Prompt API",
      });
    }

    if (frequencyPenalty != null) {
      warnings.push({
        type: "unsupported",
        feature: "frequencyPenalty",
        details: "frequencyPenalty is not supported by Prompt API",
      });
    }

    if (seed != null) {
      warnings.push({
        type: "unsupported",
        feature: "seed",
        details: "seed is not supported by Prompt API",
      });
    }

    // Check if this is a multimodal prompt
    const hasMultiModalInput = hasMultimodalContent(prompt);

    // Convert messages to the DOM API format
    const { systemMessage, messages } = convertToBuiltInAIMessages(prompt);

    // Handle response format for Prompt API
    const promptOptions: LanguageModelPromptOptions &
      LanguageModelCreateCoreOptions = {};
    if (responseFormat?.type === "json") {
      promptOptions.responseConstraint = responseFormat.schema as Record<
        string,
        JSONValue
      >;
    }

    // Map supported settings
    if (temperature !== undefined) {
      promptOptions.temperature = temperature;
    }

    if (topK !== undefined) {
      promptOptions.topK = topK;
    }

    return {
      systemMessage,
      messages,
      warnings,
      promptOptions,
      hasMultiModalInput,
      expectedInputs: hasMultiModalInput
        ? getExpectedInputs(prompt)
        : undefined,
    };
  }

  public destroy(): void {
    if (!this.session) return;
    this.session.destroy();
    this.session = null;
  }

  public getInputUsage(): number | undefined {
    return this.session?.inputUsage;
  }

  public getInputQuota(): number | undefined {
    return this.session?.inputQuota;
  }

  /**
   * Generates a complete text response using the browser's built-in Prompt API
   * @param options
   * @returns Promise resolving to the generated content with finish reason, usage stats, and any warnings
   * @throws {LoadSettingError} When the Prompt API is not available or model needs to be downloaded
   * @throws {UnsupportedFunctionalityError} When unsupported features like file input are used
   */
  public async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const converted = this.getArgs(options);
    const { systemMessage, messages, warnings, promptOptions, expectedInputs } =
      converted;

    const session = await this.getSession(
      undefined,
      expectedInputs,
      systemMessage,
    );

    const text = await session.prompt(messages, promptOptions);

    const content: LanguageModelV3Content[] = [
      {
        type: "text",
        text,
      },
    ];

    return {
      content,
      finishReason: { unified: 'stop', raw: 'stop'},
      usage: {
        inputTokens: {
          total: undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: undefined,
          text: undefined,
          reasoning: undefined,
        },
      },
      request: { body: { messages, options: promptOptions } },
      warnings,
    };
  }

  /**
   * Check the availability of the built-in AI model
   * @returns Promise resolving to "unavailable", "available", or "available-after-download"
   */
  public async availability(): Promise<Availability> {
    if (typeof LanguageModel === "undefined") {
      return "unavailable";
    }
    return LanguageModel.availability();
  }

  /**
   * Creates a session with download progress monitoring.
   *
   * @example
   * ```typescript
   * const session = await model.createSessionWithProgress(
   *   (progress) => {
   *     console.log(`Download progress: ${Math.round(progress * 100)}%`);
   *   }
   * );
   * ```
   *
   * @param onDownloadProgress Optional callback receiving progress values 0-1 during model download
   * @returns Promise resolving to a configured LanguageModel session
   * @throws {LoadSettingError} When the Prompt API is not available or model is unavailable
   */
  public async createSessionWithProgress(
    onDownloadProgress?: (progress: number) => void,
  ): Promise<LanguageModel> {
    return this.getSession(undefined, undefined, undefined, onDownloadProgress);
  }

  /**
   * Generates a streaming text response using the browser's built-in Prompt API
   * @param options
   * @returns Promise resolving to a readable stream of text chunks and request metadata
   * @throws {LoadSettingError} When the Prompt API is not available or model needs to be downloaded
   * @throws {UnsupportedFunctionalityError} When unsupported features like file input are used
   */
  public async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const converted = this.getArgs(options);
    const {
      systemMessage,
      messages,
      warnings,
      promptOptions,
      expectedInputs,
      hasMultiModalInput,
    } = converted;

    const session = await this.getSession(
      undefined,
      expectedInputs,
      systemMessage,
    );

    // Pass abort signal to the native streaming method
    const streamOptions = {
      ...promptOptions,
      signal: options.abortSignal,
    };

    const promptStream = session.promptStreaming(messages, streamOptions);

    let isFirstChunk = true;
    const textId = "text-0";

    const stream = promptStream.pipeThrough(
      new TransformStream<string, LanguageModelV3StreamPart>({
        start(controller) {
          // Send stream start event with warnings
          controller.enqueue({
            type: "stream-start",
            warnings,
          });

          // Handle abort signal
          if (options.abortSignal) {
            options.abortSignal.addEventListener("abort", () => {
              controller.terminate();
            });
          }
        },

        transform(chunk, controller) {
          if (isFirstChunk) {
            // Send text start event
            controller.enqueue({
              type: "text-start",
              id: textId,
            });
            isFirstChunk = false;
          }

          // Send text delta
          controller.enqueue({
            type: "text-delta",
            id: textId,
            delta: chunk,
          });
        },

        flush(controller) {
          // Send text end event
          controller.enqueue({
            type: "text-end",
            id: textId,
          });

          // Send finish event
          controller.enqueue({
            type: "finish",
            finishReason: { unified: 'stop', raw: 'stop'},
            usage: {
              inputTokens: {
                total: session.inputUsage,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: undefined,
                text: undefined,
                reasoning: undefined,
              },
            },
          });
        },
      }),
    );

    return {
      stream,
      request: { body: { messages, options: promptOptions } },
    };
  }
}
