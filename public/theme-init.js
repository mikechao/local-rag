(() => {
	try {
		const key = "theme"
		const stored = localStorage.getItem(key)
		const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches
		const theme = stored === "light" || stored === "dark" ? stored : prefers ? "dark" : "light"
		const root = document.documentElement
		root.classList.remove("dark")
		if (theme === "dark") root.classList.add("dark")
		root.dataset.theme = theme
	} catch (err) {
		console.error("theme init failed", err)
	}
})()
