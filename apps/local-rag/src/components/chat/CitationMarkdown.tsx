"use client";

import { memo, type ReactNode, type ComponentProps } from "react";
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
function parseCitationsInText(
  text: string,
  retrievalResults: RetrievalResult[],
): ReactNode {
  // Match citation markers like [1], [2], etc.
  const citationRegex = /\[(\d+)\]/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let hasCitations = false;

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
      hasCitations = true;
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
    } else {
      hasCitations = true;
      // Citation from earlier in conversation - show grayed out badge with explanation
      parts.push(
        <InlineCitation key={`citation-${match.index}`}>
          <InlineCitationCard>
            <InlineCitationDocTrigger
              citationNumber={citationNumber}
              docId=""
              docType=""
              pageNumber={undefined}
              className="opacity-50"
            />
            <InlineCitationCardBody>
              <div className="p-3 text-sm text-muted-foreground">
                Sourced from earlier in conversation
              </div>
            </InlineCitationCardBody>
          </InlineCitationCard>
        </InlineCitation>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after the last citation
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If no citations were found, return original text
  if (!hasCitations) {
    return text;
  }

  return <>{parts}</>;
}

/**
 * Creates custom components for Streamdown that handle citation markers.
 * This approach ensures citations appear inline within the markdown structure.
 */
function createCitationComponents(
  retrievalResults: RetrievalResult[],
): ComponentProps<typeof Streamdown>["components"] {
  return {
    // Override text node directly
    text: ({ children }) => {
      if (typeof children === "string") {
        return <>{parseCitationsInText(children, retrievalResults)}</>;
      }
      return <>{children}</>;
    },
    // Override paragraph to handle citations in text
    p: ({ children, ...props }) => {
      const processedChildren = processChildren(children, retrievalResults);
      return <p {...props}>{processedChildren}</p>;
    },
    // Override list items
    li: ({ children, ...props }) => {
      const processedChildren = processChildren(children, retrievalResults);
      return <li {...props}>{processedChildren}</li>;
    },
    // Override strong/bold
    strong: ({ children, ...props }) => {
      const processedChildren = processChildren(children, retrievalResults);
      return <strong {...props}>{processedChildren}</strong>;
    },
    // Override emphasis/italic
    em: ({ children, ...props }) => {
      const processedChildren = processChildren(children, retrievalResults);
      return <em {...props}>{processedChildren}</em>;
    },
    // Override headings
    h1: ({ children, ...props }) => {
      const processedChildren = processChildren(children, retrievalResults);
      return <h1 {...props}>{processedChildren}</h1>;
    },
    h2: ({ children, ...props }) => {
      const processedChildren = processChildren(children, retrievalResults);
      return <h2 {...props}>{processedChildren}</h2>;
    },
    h3: ({ children, ...props }) => {
      const processedChildren = processChildren(children, retrievalResults);
      return <h3 {...props}>{processedChildren}</h3>;
    },
    // Override blockquote
    blockquote: ({ children, ...props }) => {
      const processedChildren = processChildren(children, retrievalResults);
      return <blockquote {...props}>{processedChildren}</blockquote>;
    },
  };
}

/**
 * Process children nodes to replace citation markers with hover cards.
 */
function processChildren(
  children: ReactNode,
  retrievalResults: RetrievalResult[],
): ReactNode {
  if (typeof children === "string") {
    return parseCitationsInText(children, retrievalResults);
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === "string") {
        const result = parseCitationsInText(child, retrievalResults);
        // If result is the same string, return as-is; otherwise wrap with key
        if (result === child) return child;
        return <span key={index}>{result}</span>;
      }
      return child;
    });
  }

  return children;
}

/**
 * A markdown renderer that supports inline citations.
 * Uses custom Streamdown components to replace [n] markers
 * with hover cards showing the corresponding retrieval result.
 */
export const CitationMarkdown = memo(
  ({ children, retrievalResults, className }: CitationMarkdownProps) => {
    // Always create citation components to handle both valid citations
    // and citations from earlier in conversation
    const components = createCitationComponents(retrievalResults);

    return (
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className,
        )}
        components={components}
      >
        {children}
      </Streamdown>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.retrievalResults === nextProps.retrievalResults,
);

CitationMarkdown.displayName = "CitationMarkdown";
