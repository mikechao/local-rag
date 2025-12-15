"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Carousel,
	type CarouselApi,
	CarouselContent,
	CarouselItem,
} from "@/components/ui/carousel";
import type { RetrievalResult } from "@/lib/retrieval";

export type RetrievalResultsCarouselProps = {
	results: RetrievalResult[];
};

function formatSimilarity(similarity: number): string {
	if (!Number.isFinite(similarity)) return "–";
	const pct = Math.max(0, Math.min(1, similarity)) * 100;
	return `${pct.toFixed(1)}%`;
}

export function RetrievalResultsCarousel({
	results,
}: RetrievalResultsCarouselProps) {
	const [api, setApi] = useState<CarouselApi | null>(null);
	const [canScrollPrev, setCanScrollPrev] = useState(false);
	const [canScrollNext, setCanScrollNext] = useState(false);

	useEffect(() => {
		if (!api) return;

		const update = () => {
			setCanScrollPrev(api.canScrollPrev());
			setCanScrollNext(api.canScrollNext());
		};

		update();
		api.on("select", update);
		api.on("reInit", update);
		return () => {
			api.off("select", update);
			api.off("reInit", update);
		};
	}, [api]);

	if (results.length === 0) return null;

	return (
		<div className="relative flex w-full max-w-full flex-col items-center overflow-hidden">
			<div className="flex w-full max-w-full items-center gap-2">
				{results.length > 1 && (
					<Button
						aria-label="Previous"
						className="shrink-0"
						disabled={!canScrollPrev}
						onClick={() => api?.scrollPrev()}
						size="icon"
						type="button"
						variant="outline"
					>
						<ArrowLeft />
					</Button>
				)}
				<div className="min-w-0 flex-1">
					<Carousel
						className="w-full max-w-full"
						opts={{ align: "start", dragFree: true }}
						setApi={setApi}
					>
						<CarouselContent>
							{results.map((result, index) => (
								<CarouselItem
									// biome-ignore lint/suspicious/noArrayIndexKey: retrieval results have no stable id
									key={index}
									className="basis-[85%] sm:basis-[85%] md:basis-[42.5%] lg:basis-[28.333%]"
								>
									<Card className="w-full max-w-full gap-4 py-4">
										<CardContent className="px-4">
											<div className="max-h-48 overflow-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-base border-2 border-border bg-secondary px-3 py-2 text-xs leading-relaxed">
												{result.text}
											</div>
											<div className="mt-2 flex flex-col gap-1 text-muted-foreground text-[11px]">
												<span>
													{result.chunkIds.length} chunk
													{result.chunkIds.length === 1 ? "" : "s"}
												</span>
												<div className="flex flex-wrap items-center gap-2">
													<Badge variant="neutral">{result.docType}</Badge>
													<span>p. {result.pageNumber}</span>
													<span>sim {formatSimilarity(result.similarity)}</span>
												</div>
											</div>
										</CardContent>
									</Card>
								</CarouselItem>
							))}
						</CarouselContent>
					</Carousel>
				</div>
				{results.length > 1 && (
					<Button
						aria-label="Next"
						className="shrink-0"
						disabled={!canScrollNext}
						onClick={() => api?.scrollNext()}
						size="icon"
						type="button"
						variant="outline"
					>
						<ArrowRight />
					</Button>
				)}
			</div>
		</div>
	);
}
