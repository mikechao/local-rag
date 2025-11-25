import { useCallback, useEffect, useMemo, useState } from "react";
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
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "../ui/drawer";

type Availability = "available" | "downloadable" | "downloading" | "unavailable";

type Status =
	| "checking"
	| "unsupported"
	| "unavailable"
	| "idle"
	| "downloading"
	| "ready"
	| "error";

type TransformersJSDownloadCardProps = {
	title: string;
	modelId: string;
	descriptionPrefix: string;
	descriptionSuffix?: string;
	links?: Array<{ href: string; label: string }>;
	clearCacheDescription: string;
	unavailableMessage?: string;
	unsupportedMessage?: string;
	onDownload: (opts: { onProgress: (progress: number) => void }) => Promise<void>;
	clearCache: () => Promise<void>;
	hasCached: () => Promise<boolean>;
	isReadyFlag: () => boolean;
	getAvailability: () => Promise<Availability>;
	supportCheck?: () => boolean;
};

export function TransformersJSDownloadCard({
	title,
	modelId,
	descriptionPrefix,
	descriptionSuffix = "",
	links,
	clearCacheDescription,
	unavailableMessage = "Model not available to download in this environment. Please try another device or browser.",
	unsupportedMessage = "Transformers.js not supported in this browser. Try a WebGPU/WebAssembly-enabled browser.",
	onDownload,
	clearCache,
	hasCached,
	isReadyFlag,
	getAvailability,
	supportCheck = doesBrowserSupportTransformersJS,
}: TransformersJSDownloadCardProps) {
	const [status, setStatus] = useState<Status>("checking");
	const [progress, setProgress] = useState<number | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isClient, setIsClient] = useState(false);
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	const refreshStatus = useCallback(async () => {
		if (!supportCheck()) {
			setStatus("unsupported");
			return;
		}
		try {
			const cached = await hasCached();
			const readyFlag = isReadyFlag();
			const avail = await getAvailability();
			if (avail === "available" || readyFlag || cached) setStatus("ready");
			else if (avail === "downloadable") setStatus("idle");
			else setStatus("unavailable");
		} catch (err) {
			setErrorMessage(String(err));
			setStatus("error");
		}
	}, [getAvailability, hasCached, isReadyFlag, supportCheck]);

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
			await onDownload({
				onProgress: (p) => setProgress(p),
			});
			setStatus("ready");
		} catch (err) {
			setErrorMessage(String(err));
			setStatus("error");
		}
	}, [onDownload, status]);

	const handleClearCache = useCallback(async () => {
		setStatus("checking");
		setProgress(null);
		setErrorMessage(null);
		await clearCache();
		if (isClient) {
			await refreshStatus();
		}
	}, [clearCache, isClient, refreshStatus]);

	const confirmClearCache = useCallback(async () => {
		await handleClearCache();
		setIsConfirmOpen(false);
	}, [handleClearCache]);

	const buttonLabel = useMemo(() => {
		if (status === "checking") return "Checking...";
		if (status === "unsupported") return "Not supported";
		if (status === "unavailable") return "Unavailable";
		if (status === "downloading") return "Downloading...";
		if (status === "ready") return "Ready (cached)";
		if (status === "error") return "Retry download";
		return "Download model";
	}, [status]);

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
					<CardTitle className="text-2xl">{title}</CardTitle>
					<CardDescription className="text-foreground/80">
						{descriptionPrefix}{" "}
						<code className="inline-block bg-background border border-border px-1.5 py-0.5 rounded-base">
							{modelId}
						</code>{" "}
						{descriptionSuffix}
					</CardDescription>
					{links && links.length > 0 && (
						<div className="flex flex-wrap items-center gap-4 text-sm">
							{links.map(({ href, label }) => (
								<a
									key={href}
									href={href}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 text-main underline underline-offset-4"
								>
									{label} <ExternalLink size={16} strokeWidth={1.75} />
								</a>
							))}
						</div>
					)}
				</div>
			</CardHeader>

			{showStatusMessage && (
				<CardContent className="flex flex-col gap-3 py-4">
					{status === "unsupported" && (
						<div className="rounded-base border-2 border-border bg-background px-3 py-2 text-sm">
							{unsupportedMessage}
						</div>
					)}

					{status === "unavailable" && (
						<div className="rounded-base border-2 border-border bg-background px-3 py-2 text-sm">
							{unavailableMessage}
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
								{clearCacheDescription}
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
