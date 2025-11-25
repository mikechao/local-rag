import React from "react";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/SidebarNav";
import { useDbReady } from "@/hooks/use-db-ready";
import { ThemeProvider } from "@/providers/theme";
import { Toaster } from "@/components/ui/sonner";
import { DocumentUploadProvider } from "@/providers/document-upload";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Local RAG",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	const { status, error } = useDbReady();
	const [hydrated, setHydrated] = React.useState(false);
	const clientTheme =
		typeof document !== "undefined" ? document.documentElement.dataset.theme : undefined;

	React.useEffect(() => {
		setHydrated(true);
	}, []);

	const dbErrorBanner =
		status === "error" && error ? (
			<div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
				Database failed to initialize. Reload or clear storage and try again.
			</div>
		) : null;

	return (
		<html lang="en" data-theme={clientTheme} suppressHydrationWarning>
			<head>
				<script src="/theme-init.js" />
				<HeadContent />
			</head>
			<body className="bg-background text-foreground">
				<ThemeProvider>
					<DocumentUploadProvider>
						{hydrated ? (
							<>
								<SidebarProvider>
									<div className="flex min-h-svh w-full">
										<SidebarNav />
										<div className="flex min-h-svh w-full flex-col">
											<SidebarInset className="w-full">
												<div className="min-h-svh bg-background px-4 py-10 md:px-8">
													{dbErrorBanner}
													{children}
												</div>
											</SidebarInset>
										</div>
									</div>
								</SidebarProvider>
								<Toaster />
							</>
						) : null}
					</DocumentUploadProvider>
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
