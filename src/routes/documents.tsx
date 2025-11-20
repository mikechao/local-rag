import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { embed } from 'ai';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  getModel
} from "@/lib/embeddingModel";

export const Route = createFileRoute("/documents")({
	component: DocumentsPage,
});

const model = getModel();

function DocumentsPage() {
	const [embedOutput, setEmbedOutput] = useState(
		"Embeddings playground will live here soon. This textarea is fixed for now.",
	);
	const [isRunning, setIsRunning] = useState(false);

	const testEmbed = useCallback(async() => {
		setIsRunning(true);
		setEmbedOutput("Embedding...\n");
		try {
			const before = performance.now();
			const { embedding, usage } = await embed({
	      		model,
	      		value: "Cash rules everything around me, C.R.E.A.M. get the money. Dollar dollar bill y'all.",
	    	});
			const after = performance.now();
			const head = embedding.slice(0, 8).map((n) => n.toFixed(4)).join(", ");
			const usageLine = usage
				? `token usage: ${usage.tokens}`
				: "usage: (not returned)";

			setEmbedOutput(`Time: ${(after - before).toFixed(2)} ms\n${usageLine}\nlength: ${embedding.length}\nhead: [${head}]`);
		} catch (err) {
			setEmbedOutput(`Error running embed: ${String(err)}`);
		} finally {
			setIsRunning(false);
		}
	}, []);

	return (
		<div className="mx-auto max-w-5xl space-y-6">
			<div className="space-y-2">
				<p className="text-sm font-semibold tracking-wide text-main">
					Documents
				</p>
				<h1 className="text-3xl font-heading">Documents coming soon</h1>
				<p className="text-foreground/80">
					We&apos;re building document management. Check back soon, or jump to
					the Models tab to set up embeddings.
				</p>
			</div>

			<div className="space-y-3 rounded-[var(--radius-base)] border border-dashed border-border bg-muted/40 p-4">
				<p className="text-sm font-semibold text-foreground">
					Test embedding input (read-only)
				</p>
			<Textarea
				readOnly
				value={embedOutput}
			/>
			<Button type="button" onClick={testEmbed} disabled={isRunning}>
				Embed test
			</Button>
		</div>
		</div>
	);
}
