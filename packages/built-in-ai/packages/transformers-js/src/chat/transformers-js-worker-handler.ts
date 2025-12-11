import {
  AutoTokenizer,
  AutoModelForCausalLM,
  AutoProcessor,
  AutoModelForVision2Seq,
  TextStreamer,
  InterruptableStoppingCriteria,
  StoppingCriteriaList,
  load_image,
  type ProgressInfo,
} from "@huggingface/transformers";
import { decodeGeneratedText } from "./decode-utils";
import {
  buildJsonToolSystemPrompt,
  parseJsonFunctionCalls,
} from "../tool-calling";
import {
  prependSystemPromptToMessages,
  extractSystemPrompt,
} from "../utils/prompt-utils";
import { ToolCallFenceDetector } from "../streaming/tool-call-detector";
import { extractJsonPayload } from "../utils/json-utils";
import { JsonFenceDetector } from "../streaming/json-fence-detector";
import { summarizeSchema } from "../utils/schema-utils"; // Should also be imported here
import { z } from "zod";

import type {
  WorkerMessage,
  WorkerResponse,
  WorkerGlobalScope,
  ModelInstance,
  WorkerLoadOptions,
  GenerationOptions,
} from "./transformers-js-worker-types";

declare const self: WorkerGlobalScope;

class ModelManager {
  private static configs = new Map<string, WorkerLoadOptions>();
  private static instances = new Map<string, Promise<ModelInstance>>();

  static configure(key: string, options: WorkerLoadOptions) {
    this.configs.set(key, options);
  }

  static async getInstance(
    key: string,
    progressCallback?: (progress: ProgressInfo) => void,
  ): Promise<ModelInstance> {
    const cached = this.instances.get(key);
    if (cached) return cached;

    const config = this.configs.get(key);
    if (!config || !config.modelId) {
      throw new Error(`No configuration found for key: ${key}`);
    }

    const {
      modelId,
      dtype = "auto",
      device = "auto",
      use_external_data_format = false,
      isVisionModel = false,
    } = config;

    const instancePromise = isVisionModel
      ? this.createVisionModel(modelId, {
          dtype,
          device,
          use_external_data_format,
          progressCallback,
        })
      : this.createTextModel(modelId, {
          dtype,
          device,
          use_external_data_format,
          progressCallback,
        });

    this.instances.set(key, instancePromise);
    return instancePromise;
  }

  private static async createTextModel(
    modelId: string,
    options: any,
  ): Promise<ModelInstance> {
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(modelId, {
        progress_callback: options.progressCallback,
        legacy: true,
      }),
      AutoModelForCausalLM.from_pretrained(modelId, {
        dtype: options.dtype,
        device: options.device,
        use_external_data_format: options.use_external_data_format,
        progress_callback: options.progressCallback,
      }),
    ]);
    return [tokenizer, model];
  }

  private static async createVisionModel(
    modelId: string,
    options: any,
  ): Promise<ModelInstance> {
    const [processor, model] = await Promise.all([
      AutoProcessor.from_pretrained(modelId, {
        progress_callback: options.progressCallback,
      }),
      AutoModelForVision2Seq.from_pretrained(modelId, {
        dtype: options.dtype || "fp32",
        device: options.device || "webgpu",
        use_external_data_format: options.use_external_data_format,
        progress_callback: options.progressCallback,
      }),
    ]);
    return [processor, model];
  }

  static clearCache() {
    this.instances.clear();
  }
}

export class TransformersJSWorkerHandler {
  private stopping_criteria = new InterruptableStoppingCriteria();
  private isVisionModel = false;
  private currentModelKey = "default";

  async generate(
    messages: Array<{ role: string; content: any }>,
    generationOptions?: GenerationOptions,
    tools?: any[],
    jsonSchema?: string,
  ) {
    try {
      const modelInstance = await ModelManager.getInstance(
        this.currentModelKey,
      );
      await this.runGeneration(
        modelInstance,
        messages,
        generationOptions,
        tools,
        jsonSchema,
      );
    } catch (error) {
      this.sendError(error instanceof Error ? error.message : String(error));
    }
  }

  private async runGeneration(
    modelInstance: ModelInstance,
    messages: Array<{ role: string; content: any }>,
    userGenerationOptions?: GenerationOptions,
    tools?: any[],
    jsonSchema?: string,
  ) {
    const [processor, model] = modelInstance;
    const isVision = this.isVisionModel;

    // Extract system prompt from messages and build combined prompt with tool calling
    let {
      systemPrompt: originalSystemPrompt,
      messages: messagesWithoutSystem,
    } = extractSystemPrompt(messages);

    // If JSON schema is provided, prepend a system prompt for JSON output
    if (jsonSchema) {
      originalSystemPrompt =
        `Return ONLY valid JSON matching this schema: ${jsonSchema}. No prose.` +
        (originalSystemPrompt ? `\n${originalSystemPrompt}` : "");
    }

    const systemPrompt =
      tools && tools.length > 0
        ? buildJsonToolSystemPrompt(originalSystemPrompt, tools, {
            allowParallelToolCalls: false,
          })
        : originalSystemPrompt || "";

    // Prepend system prompt to messages if not empty
    const processedMessages = systemPrompt
      ? prependSystemPromptToMessages(messagesWithoutSystem, systemPrompt)
      : messagesWithoutSystem;

    // Prepare inputs based on model type
    let inputs: any;
    if (isVision) {
      // For vision models, use last message and extract images
      const lastMessages = processedMessages.slice(-1);
      const images = await Promise.all(
        lastMessages
          .map((x) => x.content)
          .flat(Infinity)
          .filter(
            (msg): msg is { type: string; image: string } =>
              typeof msg === "object" &&
              msg !== null &&
              "image" in msg &&
              msg.image !== undefined,
          )
          .map((msg) => load_image(msg.image)),
      );
      const text = processor.apply_chat_template(lastMessages as any, {
        add_generation_prompt: true,
      });
      inputs = await processor(text, images);
    } else {
      inputs = processor.apply_chat_template(processedMessages as any, {
        add_generation_prompt: true,
        return_dict: true,
      });
    }

    // Setup performance tracking and tool call detection
    let startTime: number | undefined;
    let numTokens = 0;
    
    const jsonFenceDetector = jsonSchema ? new JsonFenceDetector() : undefined;
    let jsonExtractedComplete = false;

    const toolCallFenceDetector = new ToolCallFenceDetector();
    let accumulatedText = "";
    let toolCallDetected = false;

    const token_callback = () => {
      startTime ??= performance.now();
      numTokens++;
    };
    const output_callback = (output: string) => {
      // Don't accumulate or send updates if JSON extraction is complete and we've stopped
      if (toolCallDetected || jsonExtractedComplete) return;

      accumulatedText += output;

      // Prioritize JSON parsing if schema is provided
      if (jsonFenceDetector && !jsonExtractedComplete) {
        jsonFenceDetector.addChunk(output);
        const jsonResult = jsonFenceDetector.process();
        if (jsonResult.delta) {
          this.sendUpdate(jsonResult.delta); // Send incremental JSON parts
        }
        if (jsonResult.complete || jsonResult.failed) {
          jsonExtractedComplete = true;
          // Worker sends 'update' messages. It doesn't control stopping criteria.
          // Stopping criteria is handled by the main thread.
        }
        if (jsonExtractedComplete) return; // Stop further processing by tool call detector
      }

      // Check for tool calls if tools are available AND JSON extraction is not active/complete
      if (tools && tools.length > 0 && !toolCallDetected && (!jsonFenceDetector || jsonExtractedComplete)) {
        toolCallFenceDetector.addChunk(output);
        const result = toolCallFenceDetector.detectStreamingFence();

        // If we detect a complete fence, check if it's a valid tool call
        if (result.completeFence) {
          const { toolCalls } = parseJsonFunctionCalls(result.completeFence);
          if (toolCalls.length > 0) {
            toolCallDetected = true;
            // The main thread is responsible for stopping criteria.
            // this.stopping_criteria.interrupt(); // This is handled by main thread
          }
        }
      }
      
      const tps = startTime
        ? (numTokens / (performance.now() - startTime)) * 1000
        : undefined;
      // Only send non-JSON/tool-call updates if no special processing is active
      if (!toolCallDetected && !jsonExtractedComplete) {
        this.sendUpdate(output, tps, numTokens);
      }
    };

    const streamer = new TextStreamer(
      isVision ? (processor as any).tokenizer : processor,
      {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: output_callback,
        token_callback_function: token_callback,
      },
    );

    const stoppingCriteriaList = new StoppingCriteriaList();
    stoppingCriteriaList.push(this.stopping_criteria);

    // Merge user generation options with defaults based on model type
    const defaultOptions = isVision
      ? {
          do_sample: false,
          repetition_penalty: 1.1,
          max_new_tokens: 1024,
        }
      : {
          do_sample: true,
          top_k: 3,
          temperature: 0.7,
          max_new_tokens: 512,
        };

    const generationOptions = {
      ...defaultOptions,
      ...userGenerationOptions, // User options override defaults
      streamer,
      stopping_criteria: stoppingCriteriaList,
      return_dict_in_generate: true,
    };

    this.sendMessage({ status: "start" });

    const allOptions = Object.assign({}, inputs, generationOptions);
    const generationOutput = await model.generate(allOptions);
    const sequences = (generationOutput as any).sequences || generationOutput;

    const decoded = decodeGeneratedText(
      processor,
      sequences,
      isVision,
      isVision ? 0 : inputs.input_ids.data.length,
    );

    let finalOutput = Array.isArray(decoded) ? decoded[0] : decoded;
    let finalToolCalls: any[] = [];
    let finalWarnings: any[] = [];

    // Prioritize JSON validation if jsonSchema is provided
    if (jsonSchema) {
      const extractedJson = extractJsonPayload(finalOutput);
      if (extractedJson) {
        try {
          // Verify it is valid JSON
          JSON.parse(extractedJson);
          finalOutput = extractedJson; // Valid JSON as final output
        } catch (jsonError: any) {
          // JSON parsing failed
          finalWarnings.push({
            type: "other",
            message: `JSON parsing failed in worker: ${jsonError.message}`,
          });
          // Fallback to original decoded text
        }
      } else {
        // No JSON extracted
        finalWarnings.push({
          type: "other",
          message: "Model did not return valid JSON in worker.",
        });
        // Fallback to original decoded text
      }
    } else if (tools && tools.length > 0) {
      // If no jsonSchema but tools are present, process tool calls
      const parsed = parseJsonFunctionCalls(finalOutput);
      finalToolCalls = parsed.toolCalls;
      if (parsed.textContent) {
        finalOutput = parsed.textContent;
      }
    }


    self.postMessage({
      status: "complete",
      output: finalOutput,
      toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      warnings: finalWarnings.length > 0 ? finalWarnings : undefined,
    });
  }

  async load(options?: WorkerLoadOptions) {
    try {
      ModelManager.clearCache();

      this.isVisionModel = options?.isVisionModel || false;

      // Set default model if none provided
      const modelId =
        options?.modelId ||
        (this.isVisionModel
          ? "HuggingFaceTB/SmolVLM-256M-Instruct"
          : "HuggingFaceTB/SmolLM2-360M-Instruct");

      ModelManager.configure(this.currentModelKey, {
        ...options,
        modelId,
      });

      this.sendMessage({ status: "loading", data: "Loading model..." });

      const throttledProgress = this.createThrottledProgressCallback();

      const modelInstance = await ModelManager.getInstance(
        this.currentModelKey,
        throttledProgress,
      );

      // Warm up model (text models only)
      if (!this.isVisionModel) {
        this.sendMessage({
          status: "loading",
          data: "Compiling shaders and warming up model...",
        });
        const [tokenizer, model] = modelInstance;
        const inputs = tokenizer("a");
        await model.generate({ ...inputs, max_new_tokens: 1 });
      } else {
        this.sendMessage({
          status: "loading",
          data: "Model loaded and ready...",
        });
      }

      this.sendMessage({ status: "ready" });
    } catch (error) {
      console.error("Error in worker load:", error);
      this.sendError(error instanceof Error ? error.message : String(error));
    }
  }

  interrupt() {
    this.stopping_criteria.interrupt();
  }

  reset() {
    this.stopping_criteria.reset();
    ModelManager.clearCache();
  }

  private sendMessage(message: {
    status: "loading" | "ready" | "start" | "complete";
    data?: string;
  }) {
    self.postMessage(message);
  }

  private sendUpdate(output: string, tps?: number, numTokens?: number) {
    self.postMessage({ status: "update", output, tps, numTokens });
  }

  private sendError(message: string) {
    self.postMessage({ status: "error", data: message });
  }

  private createThrottledProgressCallback() {
    const throttleMs = 100;
    let lastProgressTs = 0;

    return (progress: ProgressInfo) => {
      const now = performance?.now?.() ?? Date.now();
      if (progress.status === "progress") {
        if (now - lastProgressTs < throttleMs) return;
        lastProgressTs = now;
      }
      self.postMessage(progress);
    };
  }

  onmessage(e: MessageEvent<WorkerMessage>) {
    try {
      const { type, data } = e.data || ({} as WorkerMessage);
      switch (type) {
        case "load":
          this.load(data);
          break;
        case "generate":
          this.stopping_criteria.reset();
          this.generate(data, e.data.generationOptions, e.data.tools, e.data.jsonSchema);
          break;
        case "interrupt":
          this.interrupt();
          break;
        case "reset":
          this.reset();
          break;
        default:
          this.sendError(`Unknown message type: ${type}`);
          break;
      }
    } catch (error) {
      this.sendError(error instanceof Error ? error.message : String(error));
    }
  }
}
