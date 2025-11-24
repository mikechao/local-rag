import { X } from "lucide-react"
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { saveDocument } from "@/lib/doc-storage"

type UploadStatus = "idle" | "uploading" | "error" | "success"

interface DocumentUploadContextType {
	upload: (file: File) => Promise<void>
	status: UploadStatus
	progress: number
	currentFile: File | null
	cancel: () => void
}

const DocumentUploadContext = createContext<DocumentUploadContextType | null>(null)

export function DocumentUploadProvider({
	children,
}: { children: React.ReactNode }) {
	const [status, setStatus] = useState<UploadStatus>("idle")
	const [progress, setProgress] = useState(0)
	const [currentFile, setCurrentFile] = useState<File | null>(null)
	const abortRef = useRef<AbortController | null>(null)
	const toastIdRef = useRef<string | number | undefined>(undefined)
	const errorRef = useRef<string | null>(null)

	const renderToast = useCallback(() => {
		if (!currentFile || !toastIdRef.current) return
		toast.custom(
			(t) => (
				<div className="w-full">
					<div className="flex items-center justify-between gap-2 text-sm font-semibold">
						<span className="truncate" title={currentFile.name}>
							{currentFile.name}
						</span>
						{status === "success" || status === "error" ? (
							<Button
								variant="neutral"
								size="icon"
								className="h-7 w-7"
								onClick={() => toast.dismiss(t)}
							>
								<X className="h-4 w-4" />
							</Button>
						) : null}
					</div>
					<div className="mt-2 gap-2 flex flex-col w-full">
						<Progress value={progress} />
						{status === "uploading" ? (
							<div className="flex items-center justify-between w-full text-xs text-foreground/70">
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
							</div>
						) : status === "error" ? (
							<div className="flex items-center justify-between text-xs text-destructive">
								<span>{errorRef.current ?? "Upload failed"}</span>
								<Button
									variant="neutral"
									size="sm"
									onClick={() => toast.dismiss(t)}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						) : null}
					</div>
				</div>
			),
			{ id: toastIdRef.current, duration: Infinity, className: "!block" },
		)
	}, [currentFile, progress, status])

	useEffect(() => {
		renderToast()
	}, [renderToast])

	const upload = useCallback(async (file: File) => {
		const toastId = `upload-${Date.now()}`
		toastIdRef.current = toastId
		setStatus("uploading")
		setProgress(0)
		setCurrentFile(file)
		const controller = new AbortController()
		abortRef.current = controller
		errorRef.current = null

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
	}, [])

	return (
		<DocumentUploadContext.Provider
			value={{
				upload,
				status,
				progress,
				currentFile,
				cancel: () => abortRef.current?.abort(),
			}}
		>
			{children}
		</DocumentUploadContext.Provider>
	)
}

export function useDocumentUpload() {
	const context = useContext(DocumentUploadContext)
	if (!context) {
		throw new Error(
			"useDocumentUpload must be used within a DocumentUploadProvider",
		)
	}
	return context
}
