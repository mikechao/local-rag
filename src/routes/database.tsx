import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Repl } from "@electric-sql/pglite-repl"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useDbReady } from "@/hooks/use-db-ready"
import { getClient } from "@/lib/db"
import { useTheme } from "@/providers/theme"
import { Badge } from "@/components/ui/badge"

export const Route = createFileRoute("/database")({
	component: DatabasePage,
})

function DatabasePage() {
	const { status, error } = useDbReady()
	const [client, setClient] = useState<Awaited<ReturnType<typeof getClient>> | null>(null)
	const { theme } = useTheme()

	useEffect(() => {
		if (status !== "ready") return
		let cancelled = false
		void getClient().then((pg) => {
			if (!cancelled) setClient(pg)
		})
		return () => {
			cancelled = true
		}
	}, [status])

	if (status === "loading") {
		return <div className="text-sm text-muted-foreground">Starting database…</div>
	}

	if (status === "error") {
		return (
			<div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
				Failed to initialize database. {String(error)}
			</div>
		)
	}

	if (!client) {
		return <div className="text-sm text-muted-foreground">Connecting…</div>
	}

	return (
		<div className="mx-auto max-w-5xl space-y-6">
			<Card>
				<CardHeader>
					<div className="flex items-center gap-3">
						<CardTitle>Interactive SQL Console</CardTitle>
						<Badge variant={status === "ready" ? "default" : status === "loading" ? "neutral" : "destructive"} className="flex items-center gap-1">
							<span className="inline-block h-2 w-2 rounded-full bg-current" />
							{status === "ready" ? "DB ready" : status === "loading" ? "Starting…" : "Error"}
						</Badge>
					</div>
					<p className="text-sm text-foreground/70">
						PGlite runs Postgres in WebAssembly, right in your browser. Query tables, inspect schemas, and
						experiment safely—no server required. Try commands like <code className="rounded bg-muted px-1 py-0.5 text-xs">\dt</code> to list
						tables.
					</p>
				</CardHeader>
				<CardContent className="h-[70vh] min-h-[400px]">
					<Repl pg={client} theme={theme} border />
				</CardContent>
			</Card>
		</div>
	)
}
