import { X } from "lucide-react"
import { useCallback, useRef, useState, useEffect } from "react"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { saveDocument } from "@/lib/doc-storage"

type UploadStatus = "idle" | "uploading" | "error" | "success"

export function useDocumentUpload() {
	const [status, setStatus] = useState<UploadStatus>("idle")
	const [progress, setProgress] = useState(0)
	const [currentFile, setCurrentFile] = useState<File | null>(null)
	const abortRef = useRef<AbortController | null>(null)
	const toastIdRef = useRef<string | number | undefined>(undefined)
	const errorRef = useRef<string | null>(null)

	const renderToast = useCallback(() => {
		if (!currentFile) return
		const id = toast.custom(
			() => (
				<div className="w-full max-w-sm rounded-base border border-border bg-background px-3 py-3 shadow-md">
					<div className="flex items-center justify-between gap-2 text-sm font-semibold">
						<span className="truncate" title={currentFile.name}>
							{currentFile.name}
						</span>
						{status === "success" || status === "error" ? (
							<Button
								variant="neutral"
								size="icon"
								className="h-7 w-7"
								onClick={() => toast.dismiss(toastIdRef.current)}
							>
								<X className="h-4 w-4" />
							</Button>
						) : null}
					</div>
					<div className="mt-2 space-y-2">
						<Progress value={progress} />
						{status === "uploading" ? (
							<div className="flex items-center justify-between text-xs text-foreground/70">
								<span>{progress}%</span>
								<Button
									variant="neutral"
									size="sm"
									onClick={() => abortRef.current?.abort()}
								>
									Cancel
								</Button>
							</div>
						) : status === "success" ? (
							<div className="flex items-center justify-between text-xs text-foreground/70">
								<span className="flex items-center gap-1">Upload complete</span>
								<Button
									variant="neutral"
									size="sm"
									onClick={() => toast.dismiss(toastIdRef.current)}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						) : status === "error" ? (
							<div className="flex items-center justify-between text-xs text-destructive">
								<span>{errorRef.current ?? "Upload failed"}</span>
								<Button
									variant="neutral"
									size="sm"
									onClick={() => toast.dismiss(toastIdRef.current)}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						) : null}
					</div>
				</div>
			),
			{ id: toastIdRef.current },
		)
		toastIdRef.current = id
	}, [currentFile, progress, status])

	useEffect(() => {
		renderToast()
	}, [renderToast])

	const upload = useCallback(async (file: File) => {
		setStatus("uploading")
		setProgress(0)
		setCurrentFile(file)
		const controller = new AbortController()
		abortRef.current = controller
		errorRef.current = null
		renderToast()

		try {
			await saveDocument({
				file,
				signal: controller.signal,
				onChunkProgress: (written, total) => {
					setProgress(Math.round((written / total) * 100))
				},
			})
			setProgress(100)
			setStatus("success")
		} catch (error) {
			if ((error as DOMException).name === "AbortError") {
				toast.dismiss(toastIdRef.current)
				return
			}
			errorRef.current = error instanceof Error ? error.message : String(error)
			setStatus("error")
		} finally {
			abortRef.current = null
		}
	}, [renderToast])

	return {
		upload,
		status,
		progress,
		currentFile,
		cancel: () => abortRef.current?.abort(),
	}
}
