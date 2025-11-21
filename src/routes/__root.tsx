import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/SidebarNav";
import { ThemeProvider } from "@/providers/theme";

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
	const themeScript = `(() => { try { const key = 'theme'; const stored = localStorage.getItem(key); const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches; const theme = stored === 'light' || stored === 'dark' ? stored : (prefers ? 'dark' : 'light'); const root = document.documentElement; root.classList.remove('dark'); if (theme === 'dark') root.classList.add('dark'); root.dataset.theme = theme; } catch (_) {} })();`;

	return (
		<html lang="en">
			<head>
				<script
					suppressHydrationWarning
					dangerouslySetInnerHTML={{ __html: themeScript }}
				/>
				<HeadContent />
			</head>
			<body className="bg-background text-foreground">
				<ThemeProvider>
					<SidebarProvider>
						<div className="flex min-h-svh w-full">
							<SidebarNav />
							<div className="flex min-h-svh w-full flex-col">
								<SidebarInset className="w-full">
									<div className="min-h-svh bg-background px-4 py-10 md:px-8">
										{children}
									</div>
								</SidebarInset>
							</div>
						</div>
					</SidebarProvider>
				</ThemeProvider>
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
