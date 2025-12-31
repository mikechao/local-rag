"use client";

import { memo, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import type { RetrievalResult } from "@/lib/retrieval";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationDocTrigger,
  InlineCitationCardBody,
  InlineCitationRetrievalSource,
} from "@/components/ai-elements/inline-citation";

export type CitationMarkdownProps = {
  children: string;
  retrievalResults: RetrievalResult[];
  className?: string;
};

/**
 * Parses text content and replaces citation markers [1], [2], etc. with
 * InlineCitation hover cards that display the corresponding retrieval result.
 */
function parseCitations(
  text: string,
  retrievalResults: RetrievalResult[],
): ReactNode[] {
  const parts: ReactNode[] = [];
  // Match citation markers like [1], [2], etc.
  const citationRegex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(text)) !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const citationNumber = Number.parseInt(match[1], 10);
    // Citations are 1-indexed, array is 0-indexed
    const resultIndex = citationNumber - 1;
    const result = retrievalResults[resultIndex];

    if (result) {
      // Valid citation - render as hover card
      parts.push(
        <InlineCitation key={`citation-${match.index}`}>
          <InlineCitationCard>
            <InlineCitationDocTrigger
              citationNumber={citationNumber}
              docId={result.docId}
              docType={result.docType}
              pageNumber={result.pageNumber}
            />
            <InlineCitationCardBody>
              <div className="p-3">
                <InlineCitationRetrievalSource
                  docId={result.docId}
                  docType={result.docType}
                  pageNumber={result.pageNumber}
                  headingPath={result.headingPath}
                  text={result.text}
                  similarity={result.similarity}
                  rerankScore={result.rerankScore}
                />
              </div>
            </InlineCitationCardBody>
          </InlineCitationCard>
        </InlineCitation>,
      );
    }
    // If no valid result, silently skip the marker (don't render anything)

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after the last citation
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/**
 * A markdown renderer that supports inline citations.
 * Wraps Streamdown and post-processes text to replace [n] markers
 * with hover cards showing the corresponding retrieval result.
 */
export const CitationMarkdown = memo(
  ({ children, retrievalResults, className }: CitationMarkdownProps) => {
    // If no retrieval results, just render with Streamdown
    if (!retrievalResults.length) {
      return (
        <Streamdown
          className={cn(
            "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
            className,
          )}
        >
          {children}
        </Streamdown>
      );
    }

    // Parse citations from the text and render with hover cards
    const parsedContent = parseCitations(children, retrievalResults);

    // Check if any citations were found
    const hasCitations = parsedContent.some(
      (part) => typeof part !== "string",
    );

    if (!hasCitations) {
      // No citations found, render normally
      return (
        <Streamdown
          className={cn(
            "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
            className,
          )}
        >
          {children}
        </Streamdown>
      );
    }

    // Render the content with citations
    // We need to handle this carefully - Streamdown expects a string,
    // but we have mixed ReactNode content. We'll render the markdown first,
    // then overlay the citations.
    return (
      <div
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className,
        )}
      >
        {parsedContent.map((part, index) => {
          if (typeof part === "string") {
            // Render string parts through Streamdown for markdown processing
            return (
              <Streamdown key={index} className="inline">
                {part}
              </Streamdown>
            );
          }
          // ReactNode parts are already citation components
          return part;
        })}
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.retrievalResults === nextProps.retrievalResults,
);

CitationMarkdown.displayName = "CitationMarkdown";
