import { useCallback, useEffect, useState } from "react";

import { doesBrowserSupportTransformersJS } from "@built-in-ai/transformers-js";

import { ExternalLink } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "../ui/button";
import {
	LOCAL_READY_KEY,
	clearQwenCache,
	ensureQwenModelReady,
	hasCachedQwenWeights,
	isQwenModelReadyFlag,
	MODEL_ID,
	getQwenModel,
} from "@/lib/qwenModel";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "../ui/drawer";

type Status =
	| "checking"
	| "unsupported"
	| "unavailable"
	| "idle"
	| "downloading"
	| "ready"
	| "error";

export function QwenDownload() {
	const [status, setStatus] = useState<Status>("checking");
	const [progress, setProgress] = useState<number | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isClient, setIsClient] = useState(false);
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	const refreshStatus = useCallback(async () => {
		if (!doesBrowserSupportTransformersJS()) {
			setStatus("unsupported");
			return;
		}
		try {
			const cached = await hasCachedQwenWeights();
			const readyFlag = isQwenModelReadyFlag();
			const model = getQwenModel();
			const avail = await model.availability();
			if (avail === "available" || readyFlag || cached) setStatus("ready");
			else if (avail === "downloadable") setStatus("idle");
			else setStatus("unavailable");
		} catch (err) {
			setErrorMessage(String(err));
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		if (!isClient) return;
		void refreshStatus();
	}, [isClient, refreshStatus]);

	const startDownload = useCallback(async () => {
		if (
			status === "downloading" ||
			status === "ready" ||
			status === "unavailable"
		)
			return;
		setStatus("downloading");
		setProgress(0);
		setErrorMessage(null);

		try {
			await ensureQwenModelReady({
				onProgress: ({ progress: p }) => setProgress(p),
			});
			if (typeof localStorage !== "undefined") {
				localStorage.setItem(LOCAL_READY_KEY, "true");
			}
			setStatus("ready");
		} catch (err) {
			setErrorMessage(String(err));
			setStatus("error");
		}
	}, [status]);

	const clearCache = useCallback(async () => {
		setStatus("checking");
		setProgress(null);
		setErrorMessage(null);
		await clearQwenCache();
		if (isClient) {
			await refreshStatus();
		}
	}, [isClient, refreshStatus]);

	const confirmClearCache = useCallback(async () => {
		await clearCache();
		setIsConfirmOpen(false);
	}, [clearCache]);

	const buttonLabel = (() => {
		if (status === "checking") return "Checking...";
		if (status === "unsupported") return "Not supported";
		if (status === "unavailable") return "Unavailable";
		if (status === "downloading") return "Downloading...";
		if (status === "ready") return "Ready (cached)";
		if (status === "error") return "Retry download";
		return "Download model";
	})();

	const disableButton =
		status === "checking" ||
		status === "unsupported" ||
		status === "unavailable" ||
		status === "downloading" ||
		status === "ready";

	const percent = progress != null ? Math.round(progress * 100) : null;

	const showStatusMessage =
		status === "unsupported" ||
		status === "unavailable" ||
		(status === "error" && errorMessage);

	return (
		<Card className="w-full gap-0">
			<CardHeader className="border-b border-border">
				<div className="flex flex-col gap-2">
					<CardTitle className="text-2xl">Qwen3-0.6B</CardTitle>
					<CardDescription className="text-foreground/80">
						Download{" "}
						<code className="inline-block bg-background border border-border px-1.5 py-0.5 rounded-base">
							{MODEL_ID}
						</code>{" "}
						for local chat. Cached locally after first download.
					</CardDescription>
					<div className="flex flex-wrap items-center gap-4 text-sm">
						<a
							href="https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX"
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 text-main underline underline-offset-4"
						>
							View on Hugging Face <ExternalLink size={16} strokeWidth={1.75} />
						</a>
					</div>
				</div>
			</CardHeader>

			{showStatusMessage && (
				<CardContent className="flex flex-col gap-3 py-4">
					{status === "unsupported" && (
						<div className="rounded-base border-2 border-border bg-background px-3 py-2 text-sm">
							Transformers.js not supported in this browser. Try a
							WebGPU/WebAssembly-enabled browser.
						</div>
					)}

					{status === "unavailable" && (
						<div className="rounded-base border-2 border-border bg-background px-3 py-2 text-sm">
							Model not available to download in this environment. Please try
							another device or browser.
						</div>
					)}

					{status === "error" && errorMessage && (
						<div className="rounded-base border-2 border-border bg-background px-3 py-2 text-sm">
							{errorMessage}
						</div>
					)}
				</CardContent>
			)}

			<CardFooter className="flex w-full flex-col items-start gap-3 border-t border-border py-4">
				<div className="flex w-full flex-wrap items-center gap-3">
					<Button onClick={startDownload} disabled={disableButton}>
						{buttonLabel}
					</Button>

					<button
						type="button"
						className="text-sm text-foreground/80 underline underline-offset-4 disabled:text-foreground/40 hover:cursor-pointer"
						onClick={() => setIsConfirmOpen(true)}
						disabled={status === "downloading"}
					>
						Clear cached model
					</button>
				</div>

				<Drawer open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
					<DrawerContent>
						<DrawerHeader className="items-center text-center sm:text-center">
							<DrawerTitle>Are you sure?</DrawerTitle>
							<DrawerDescription className="text-sm text-foreground/80 text-center sm:text-center">
								Clearing the cache will require re-downloading the model for chat.
							</DrawerDescription>
						</DrawerHeader>
						<DrawerFooter className="flex-row justify-center gap-3">
							<Button onClick={confirmClearCache}>Yes</Button>
							<DrawerClose asChild>
								<Button variant="neutral">No</Button>
							</DrawerClose>
						</DrawerFooter>
					</DrawerContent>
				</Drawer>

				{(status === "downloading" || percent !== null) && (
					<div className="w-full space-y-1">
						<div className="flex items-center justify-between text-sm text-foreground">
							<span>
								{status === "downloading"
									? "Downloading model..."
									: "Download complete"}
							</span>
							{percent !== null && <span>{percent}%</span>}
						</div>
						<Progress value={percent ?? 100} />
					</div>
				)}
			</CardFooter>
		</Card>
	);
}
