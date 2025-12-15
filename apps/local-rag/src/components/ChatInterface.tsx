import { useChat } from "@ai-sdk/react";
import { BuiltInAIChatTransport } from "@/lib/built-in-ai-chat-transport";
import { QwenChatTransport } from "@/lib/qwen-chat-transport";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
	MessageAttachments,
	MessageAttachment,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputTextarea,
	PromptInputFooter,
	PromptInputTools,
	PromptInputActionMenu,
	PromptInputActionMenuTrigger,
	PromptInputActionMenuContent,
	PromptInputActionAddAttachments,
	PromptInputSubmit,
	PromptInputAttachments,
	PromptInputAttachment,
} from "@/components/ai-elements/prompt-input";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AlertCircle, Paperclip, MicIcon, Loader2Icon } from "lucide-react";
import { CopyMessage } from "@/components/CopyMessage";
import { SpeakMessage } from "@/components/SpeakMessage";
import { LocalModelSelector } from "@/components/LocalModelSelector";
import { VoiceInput } from "@/components/VoiceInput";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { hasCachedWhisperWeights } from "@/lib/models/whisperModel";
import {
	generateSpeechStream,
	TextStream,
	isSpeechModelReadyFlag,
} from "@/lib/models/speechModel";
import { useSpeechPlayer } from "@/hooks/use-speech-player";
import { warmupEmbeddingModel } from "@/lib/embedding-worker";
import { Volume2, VolumeX } from "lucide-react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { LocalRAGMessage, type RetrievalStatus } from "@/lib/local-rag-message";
import { RetrievalResultsCarousel } from "@/components/RetrievalResultsCarousel";
import type { RetrievalResult } from "@/lib/retrieval";

export function ChatInterface() {
	const [isModelAvailable] = useState<boolean | null>(true);
	const [selectedModel, setSelectedModel] = useState<string>("gemini-nano");
	const [isWhisperAvailable, setIsWhisperAvailable] = useState(false);
	const [isSpeechAvailable, setIsSpeechAvailable] = useState(false);
	const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
	const [autoSpeak, setAutoSpeak] = useState(false);
	const [retrievalStatus, setRetrievalStatus] =
		useState<RetrievalStatus | null>(null);
	const [sourcesOpenByMessageId, setSourcesOpenByMessageId] = useState<
		Record<string, boolean>
	>({});

	const lastMessageIdRef = useRef<string | null>(null);
	const lastMessageLengthRef = useRef(0);
	const textStreamRef = useRef<TextStream | null>(null);
	const { playStream, stop } = useSpeechPlayer();

	useEffect(() => {
		const checkModels = async () => {
			const isWhisperCached = await hasCachedWhisperWeights();
			setIsWhisperAvailable(isWhisperCached);
			const isSpeechReady = isSpeechModelReadyFlag();
			setIsSpeechAvailable(isSpeechReady);
		};
		checkModels();
		// Pre-warm embedding model for faster RAG retrieval
		warmupEmbeddingModel().catch(console.error);
	}, []);

	// Choose a transport based on the selected local model
	const chatTransport = useMemo(() => {
		if (selectedModel === "qwen3-0.6b") return new QwenChatTransport();
		return new BuiltInAIChatTransport();
	}, [selectedModel]);

	// Warm up when the transport supports it (BuiltInAIChatTransport only)
	useEffect(() => {
		if (chatTransport instanceof BuiltInAIChatTransport) {
			chatTransport.warmup().catch(console.error);
		}
	}, [chatTransport]);

	const [input, setInput] = useState("");

	const chatId = `local-chat-${selectedModel}`;

	const { messages, sendMessage, error, status } = useChat<LocalRAGMessage>({
		transport: chatTransport,
		id: chatId,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		onData: (dataPart) => {
			if (dataPart.type === "data-retrievalStatus") {
				setRetrievalStatus(dataPart.data);
			}
		},
	});

	if (status === "ready") {
		console.log("messages", JSON.stringify(messages, null, 2));
	}

	useEffect(() => {
		if (!autoSpeak) {
			if (textStreamRef.current) {
				textStreamRef.current.close();
				textStreamRef.current = null;
				stop();
			}
			return;
		}

		const lastMessage = messages[messages.length - 1];
		if (!lastMessage || lastMessage.role !== "assistant") return;

		// If we just turned on auto-speak and the message is already done, don't speak it
		if (status === "ready" && lastMessage.id !== lastMessageIdRef.current) {
			lastMessageIdRef.current = lastMessage.id;
			const fullText = getMessageText(lastMessage);
			lastMessageLengthRef.current = fullText.length;
			return;
		}

		// New message started
		if (lastMessage.id !== lastMessageIdRef.current) {
			lastMessageIdRef.current = lastMessage.id;
			lastMessageLengthRef.current = 0;

			// Stop previous if any
			if (textStreamRef.current) {
				textStreamRef.current.close();
			}
			stop();

			// Start new stream
			const stream = new TextStream();
			textStreamRef.current = stream;

			// Start playing (fire and forget, handled by hook)
			const audioGenerator = generateSpeechStream(stream);
			playStream(audioGenerator);
		}

		// Calculate delta
		const fullText = getMessageText(lastMessage);

		const newLength = fullText.length;

		// Handle case where text shrinks (shouldn't now, but keep guard)
		if (newLength < lastMessageLengthRef.current) {
			lastMessageLengthRef.current = newLength;
		}

		const delta = fullText.slice(lastMessageLengthRef.current);

		if (delta) {
			textStreamRef.current?.push(delta);
			lastMessageLengthRef.current = newLength;
		}

		if (status === "ready" && lastMessage.id === lastMessageIdRef.current) {
			textStreamRef.current?.close();
			textStreamRef.current = null;
		}
	}, [messages, status, autoSpeak, playStream, stop]);

	const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInput(e.target.value);
	};

	const getMessageText = (message: any) => {
		if (message.content) return message.content;
		if (message.parts) {
			return message.parts
				.filter((part: any) => part.type === "text")
				.map((part: any) => part.text)
				.join("");
		}
		return "";
	};

	const getCopyableText = (message: any) => {
		if (message.parts) {
			return message.parts
				.filter((part: any) => part.type === "text")
				.map((part: any) => part.text?.trim())
				.filter(Boolean)
				.join("\n\n");
		}

		return getMessageText(message);
	};

	const getAttachments = (message: any) => {
		if (!message.parts) return [];
		return message.parts
			.filter((part: any) => part.type === "file" || part.type === "image")
			.map((part: any) => {
				if (part.type === "file") {
					return {
						...part,
						url:
							part.url ||
							(part.data
								? `data:${part.mimeType || part.mediaType};base64,${part.data}`
								: ""),
						mediaType: part.mimeType || part.mediaType,
						filename: part.filename || "Image",
					};
				}
				if (part.type === "image") {
					return {
						...part,
						url:
							part.url ||
							(part.image ? `data:${part.mimeType};base64,${part.image}` : ""),
						mediaType: part.mimeType || "image/jpeg",
						filename: "Image",
					};
				}
				return part;
			});
	};

	const renderRetrievalStatus = (statusPart: RetrievalStatus) => {
		const phase = statusPart.phase;
		const message = statusPart.message;
		const tookMs = phase === "done" ? statusPart.tookMs : undefined;
		const resultsCount = phase === "done" ? statusPart.resultsCount : undefined;

		const isLoading = phase === "deciding" || phase === "retrieving";
		let label = "Retrieval";
		if (phase === "deciding") label = "Retrieval: deciding";
		if (phase === "retrieving") label = "Retrieval: searching";
		if (phase === "skipped") label = "Retrieval: skipped";
		if (phase === "done") label = "Retrieval: done";
		if (phase === "error") label = "Retrieval: error";

		const details =
			phase === "done"
				? `${resultsCount ?? 0} source${(resultsCount ?? 0) === 1 ? "" : "s"}${typeof tookMs === "number" ? ` • ${tookMs}ms` : ""}`
				: undefined;

		return (
			<div className="flex items-center gap-2 text-muted-foreground text-xs">
				{isLoading && <Loader2Icon className="size-3.5 animate-spin" />}
				<span className="font-medium">{label}</span>
				{details && <span>{details}</span>}
				{message && <span className="truncate">{message}</span>}
			</div>
		);
	};

	if (isModelAvailable === false) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center">
				<div className="rounded-full bg-destructive/10 p-4 text-destructive">
					<AlertCircle className="size-8" />
				</div>
				<h2 className="text-xl font-semibold">Model Not Available</h2>
				<p className="max-w-md text-muted-foreground">
					The local AI model is not downloaded or available in your browser.
					Please visit the Models page to download the Gemini Nano model.
				</p>
				<Button asChild>
					<Link to="/models">Go to Models Page</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex h-[calc(100vh-14rem)] flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
			<Conversation className="flex-1">
				<ConversationContent>
					{messages.map((message) => {
						const attachments = getAttachments(message);
						const copyableText = getCopyableText(message);
						const isLastMessage =
							message.id === messages[messages.length - 1]?.id;
						const showRetrievalStatusInThisMessage =
							Boolean(retrievalStatus) &&
							status !== "ready" &&
							message.role === "assistant" &&
							isLastMessage;
						const isLastAssistantMessage =
							isLastMessage && message.role === "assistant";
						const retrievalResultsPart = message.parts?.find?.(
							(part: any) => part.type === "data-retrievalResults",
						) as { data?: RetrievalResult[] } | undefined;
						const retrievalResults = retrievalResultsPart?.data;
						const sourcesAreOpen =
							Boolean(retrievalResults?.length) &&
							Boolean(sourcesOpenByMessageId[message.id]);
						const showRetrievalResultsCarousel =
							message.role === "assistant" &&
							Boolean(retrievalResults?.length) &&
							(!isLastAssistantMessage || status === "ready") &&
							sourcesAreOpen;
						return (
							<Message key={message.id} from={message.role}>
								<MessageContent
									className={
										showRetrievalResultsCarousel
											? "w-full max-w-full min-w-0"
											: undefined
									}
								>
									{message.parts ? (
										message.parts.map((part, index) => {
											if (part.type === "data-retrievalResults") return null;
											if (part.type === "text") {
												return (
													<MessageResponse key={index}>
														{part.text}
													</MessageResponse>
												);
											}
											if (part.type === "reasoning") {
												return (
													<Reasoning
														key={index}
														isStreaming={
															status === "streaming" &&
															index === message.parts.length - 1 &&
															message.id === messages[messages.length - 1].id
														}
													>
														<ReasoningTrigger />
														<ReasoningContent>{part.text}</ReasoningContent>
													</Reasoning>
												);
											}
											return null;
										})
									) : (
										<MessageResponse>{getMessageText(message)}</MessageResponse>
									)}
									{attachments.length > 0 && (
										<MessageAttachments className="mt-2">
											{attachments.map((attachment: any, index: number) => (
												<MessageAttachment data={attachment} key={index} />
											))}
										</MessageAttachments>
									)}
									{message.role === "assistant" &&
										showRetrievalResultsCarousel &&
										retrievalResults && (
											<div className="mt-3">
												<RetrievalResultsCarousel results={retrievalResults} />
											</div>
										)}
									{showRetrievalStatusInThisMessage && retrievalStatus && (
										<div className="mt-2">
											{renderRetrievalStatus(retrievalStatus)}
										</div>
									)}
									{message.role === "assistant" &&
										copyableText &&
										status === "ready" && (
											<div className="flex items-center gap-2 ml-auto">
												{retrievalResults?.length ? (
													<Button
														variant="noShadow"
														size="sm"
														className="h-8 px-2"
														type="button"
														onClick={() =>
															setSourcesOpenByMessageId((prev) => ({
																...prev,
																[message.id]: !prev[message.id],
															}))
														}
													>
														{sourcesOpenByMessageId[message.id]
															? "Hide Sources"
															: "Show sources"}
													</Button>
												) : null}
												<SpeakMessage text={copyableText} />
												<CopyMessage
													messageId={message.id}
													copyableText={copyableText}
													copiedMessageId={copiedMessageId}
													setCopiedMessageId={setCopiedMessageId}
													className=""
												/>
											</div>
										)}
								</MessageContent>
							</Message>
						);
					})}
					{retrievalStatus &&
						status !== "ready" &&
						messages[messages.length - 1]?.role !== "assistant" && (
							<Message from="assistant">
								<MessageContent>
									<div className="mt-2">
										{renderRetrievalStatus(retrievalStatus)}
									</div>
								</MessageContent>
							</Message>
						)}
					{error && (
						<div className="mx-4 my-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
							Error: {error.message}
						</div>
					)}
					{messages.length === 0 && !error && (
						<ConversationEmptyState
							title="Start a conversation"
							description="Chat with the local AI model"
						/>
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<div className="border-t bg-background p-4">
				<PromptInput
					accept="image/*"
					onSubmit={(message) => {
						setRetrievalStatus(null);
						const trimmedText = message.text.trim();
						const fileParts = message.files.map((file) => ({
							type: "file" as const,
							url: file.url,
							mediaType: file.mediaType,
							filename: file.filename,
						}));

						const parts = [
							...(trimmedText ? [{ type: "text", text: trimmedText }] : []),
							...fileParts,
						];

						if (parts.length === 0) return; // avoid sending empty messages

						sendMessage(
							{
								role: "user",
								// @ts-ignore - parts is the v5 way
								parts: parts,
							},
							{
								body: { modelId: selectedModel },
							},
						);
						setInput("");
					}}
				>
					<PromptInputAttachments>
						{(attachment) => <PromptInputAttachment data={attachment} />}
					</PromptInputAttachments>
					<PromptInputTextarea value={input} onChange={handleInputChange} />
					<PromptInputFooter>
						<VoiceInput
							onTranscription={(text) =>
								setInput((prev) => prev + (prev ? " " : "") + text)
							}
						>
							{({ startRecording }) => (
								<>
									<PromptInputTools>
										<PromptInputActionMenu>
											<PromptInputActionMenuTrigger variant={"noShadow"}>
												<Paperclip className="size-4" />
											</PromptInputActionMenuTrigger>
											<PromptInputActionMenuContent>
												<PromptInputActionAddAttachments label="Attach Photos" />
											</PromptInputActionMenuContent>
										</PromptInputActionMenu>
										<LocalModelSelector
											value={selectedModel}
											onValueChange={setSelectedModel}
										/>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="noShadow"
														size="sm"
														className="h-8 gap-2 px-2"
														onClick={() => setAutoSpeak(!autoSpeak)}
														disabled={!isSpeechAvailable}
														type="button"
													>
														{autoSpeak ? (
															<Volume2 className="size-4" />
														) : (
															<VolumeX className="size-4 text-muted-foreground" />
														)}
														<span className="hidden sm:inline">
															{autoSpeak ? "Auto-Speak On" : "Auto-Speak Off"}
														</span>
													</Button>
												</TooltipTrigger>
												<TooltipContent>
													<p>
														{!isSpeechAvailable
															? "Download Speech model to enable auto-speak"
															: autoSpeak
																? "Disable Auto-Speak"
																: "Enable Auto-Speak"}
													</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</PromptInputTools>
									<div className="flex items-center gap-1">
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<span tabIndex={-1}>
														<Button
															variant="noShadow"
															size="icon"
															className="size-8"
															onClick={startRecording}
															disabled={!isWhisperAvailable}
															type="button"
														>
															<MicIcon className="size-4" />
															<span className="sr-only">Voice Input</span>
														</Button>
													</span>
												</TooltipTrigger>
												{!isWhisperAvailable && (
													<TooltipContent>
														<p>Download Whisper model to enable voice input</p>
													</TooltipContent>
												)}
											</Tooltip>
										</TooltipProvider>
										<PromptInputSubmit variant={"noShadow"} />
									</div>
								</>
							)}
						</VoiceInput>
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}
