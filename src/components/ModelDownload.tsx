import { useCallback, useEffect, useState } from 'react'

import {
  doesBrowserSupportTransformersJS,
  transformersJS,
} from '@built-in-ai/transformers-js'

import { ExternalLink } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from './ui/button'

type Status =
  | 'checking'
  | 'unsupported'
  | 'unavailable'
  | 'idle'
  | 'downloading'
  | 'ready'
  | 'error'

type DownloadableEmbeddingModel = ReturnType<typeof transformersJS.textEmbedding> & {
  availability: () => Promise<'unavailable' | 'downloadable' | 'available'>
  createSessionWithProgress: (cb?: (p: { progress: number }) => void) => Promise<unknown>
}

export function ModelDownload() {
  const [status, setStatus] = useState<Status>('checking')
  const [progress, setProgress] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [modelVersion, setModelVersion] = useState(0)
  const [isClient, setIsClient] = useState(false)
  // Use ONNX-converted weights that include `onnx/model_quantized.onnx`
  // to avoid missing-file errors from the original repository.
  const MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX'
  const LOCAL_READY_KEY = 'embeddinggemma-onnx-ready'

  const [model, setModel] = useState<DownloadableEmbeddingModel>(() =>
    transformersJS.textEmbedding(MODEL_ID, {
      device: 'auto',
    }) as DownloadableEmbeddingModel,
  )

  useEffect(() => {
    setIsClient(true)
  }, [])

  const hasCachedModel = useCallback(async () => {
    if (typeof caches === 'undefined') return false
    const keys = await caches.keys()
    for (const key of keys) {
      if (!key.includes('transformers')) continue
      const cache = await caches.open(key)
      const requests = await cache.keys()
      if (requests.some((req) => req.url.includes(MODEL_ID))) return true
    }
    return false
  }, [MODEL_ID])

  // Recreate the model when cache is cleared (modelVersion increments).
  useEffect(() => {
    void modelVersion
    setModel(
      transformersJS.textEmbedding(MODEL_ID, {
        device: 'auto',
      }) as DownloadableEmbeddingModel,
    )
  }, [modelVersion])

  useEffect(() => {
    if (!isClient) return
    if (!doesBrowserSupportTransformersJS()) {
      setStatus('unsupported')
      return
    }

    let cancelled = false

    const checkAvailability = async () => {
      try {
        const avail = await model.availability()
        if (cancelled) return
        const hasLocalReadyFlag =
          typeof localStorage !== 'undefined' && localStorage.getItem(LOCAL_READY_KEY)
        const cacheHasModel = await hasCachedModel()

        if (avail === 'available' || hasLocalReadyFlag || cacheHasModel) setStatus('ready')
        else if (avail === 'downloadable') setStatus('idle')
        else setStatus('unavailable')
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(String(err))
          setStatus('error')
        }
      }
    }

    checkAvailability()

    return () => {
      cancelled = true
    }
  }, [hasCachedModel, isClient, model])

  // biome-ignore lint/correctness/useExhaustiveDependencies: hfToken is build-time static; status drives guard.
  const startDownload = useCallback(async () => {
    if (status === 'downloading' || status === 'ready' || status === 'unavailable') return
    setStatus('downloading')
    setProgress(0)
    setErrorMessage(null)

    try {
      await model.createSessionWithProgress(({ progress: p }) => {
        setProgress(p)
      })
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_READY_KEY, 'true')
      }
      setStatus('ready')
    } catch (err) {
      setErrorMessage(String(err))
      setStatus('error')
    }
  }, [model, status])

  const clearCache = useCallback(async () => {
    setStatus('checking')
    setProgress(null)
    setErrorMessage(null)
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_READY_KEY)
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.includes('transformers')).map((k) => caches.delete(k)))
    }
    setModelVersion((v) => v + 1)
  }, [])

  const buttonLabel = (() => {
    if (status === 'checking') return 'Checking...'
    if (status === 'unsupported') return 'Not supported'
    if (status === 'unavailable') return 'Unavailable'
    if (status === 'downloading') return 'Downloading...'
    if (status === 'ready') return 'Ready (cached)'
    if (status === 'error') return 'Retry download'
    return 'Download model'
  })()

  const disableButton =
    status === 'checking' ||
    status === 'unsupported' ||
    status === 'unavailable' ||
    status === 'downloading' ||
    status === 'ready'

  const percent = progress != null ? Math.round(progress * 100) : null

  const showStatusMessage =
    status === 'unsupported' || status === 'unavailable' || (status === 'error' && errorMessage)

  return (
    <Card className="w-full gap-0">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-2">
          <CardTitle className="text-2xl">Download embedding model</CardTitle>
          <CardDescription className="text-foreground/80">
            Get{' '}
            <code className="inline-block bg-background border border-border px-1.5 py-0.5 rounded-[var(--radius-base)]">
              {MODEL_ID}
            </code>{' '}
            ready for offline embeddings. Cached locally after first download.
          </CardDescription>
          <a
            href="https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-main underline underline-offset-4"
          >
            View on Hugging Face <ExternalLink size={16} strokeWidth={1.75} />
          </a>
          <a
            href="https://ai.google.dev/gemma/docs/embeddinggemma"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-main underline underline-offset-4"
          >
            Google Model Card <ExternalLink size={16} strokeWidth={1.75} />
          </a>
        </div>
      </CardHeader>

      {showStatusMessage && (
        <CardContent className="flex flex-col gap-3 py-4">
          {status === 'unsupported' && (
            <div className="rounded-[var(--radius-base)] border-2 border-border bg-background px-3 py-2 text-sm">
              Transformers.js not supported in this browser. Try a WebGPU/WebAssembly-enabled browser.
            </div>
          )}

          {status === 'unavailable' && (
            <div className="rounded-[var(--radius-base)] border-2 border-border bg-background px-3 py-2 text-sm">
              Model not available to download in this environment. Please try another device or browser.
            </div>
          )}

          {status === 'error' && errorMessage && (
            <div className="rounded-[var(--radius-base)] border-2 border-border bg-background px-3 py-2 text-sm">
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
            className="text-sm text-foreground/80 underline underline-offset-4 disabled:text-foreground/40"
            onClick={clearCache}
            disabled={status === 'downloading'}
          >
            Clear cached model
          </button>

          <span className="text-xs text-foreground/70">
            Device: auto; cached locally after first download.
          </span>
        </div>

        {(status === 'downloading' || percent !== null) && (
          <div className="w-full space-y-1">
            <div className="flex items-center justify-between text-sm text-foreground">
              <span>{status === 'downloading' ? 'Downloading model...' : 'Download complete'}</span>
              {percent !== null && <span>{percent}%</span>}
            </div>
            <Progress value={percent ?? 100} />
          </div>
        )}
      </CardFooter>
    </Card>
  )
}
