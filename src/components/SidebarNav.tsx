import { Link, useRouterState } from "@tanstack/react-router"
import { Bot, BookText, MessageSquareQuote, Moon, PanelLeftIcon, Sun } from "lucide-react"
import type React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "./ui/button"
import { useTheme } from "@/providers/theme"

type NavItem = {
  label: string
  to: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}

const navItems: NavItem[] = [
  { label: "Chat", to: "/chat", icon: MessageSquareQuote },
  { label: "Documents", to: "/documents", icon: BookText },
  { label: "Models", to: "/models", icon: Bot },
]

export function SidebarNav() {
  const { location } = useRouterState()
  const { toggleSidebar, isMobile, setOpenMobile } = useSidebar()
  const { theme, toggleTheme } = useTheme()

  const handleToggleTheme = () => {
    toggleTheme()
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar side="left" collapsible="icon">
      <SidebarRail />
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between pr-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:pr-0 group-data-[collapsible=icon]:pb-1">
            <SidebarGroupLabel className="group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:m-0">
              Navigation
            </SidebarGroupLabel>
            <SidebarGroupAction
              aria-label="Toggle sidebar"
              onClick={toggleSidebar}
              className="static ml-auto size-8 items-center justify-center text-foreground/70 hover:text-main-foreground group-data-[collapsible=icon]:mr-0 group-data-[collapsible=icon]:mt-1"
            >
              <PanelLeftIcon />
            </SidebarGroupAction>
          </div>
          <SidebarGroupContent className="pt-1">
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  location.pathname === item.to ||
                  (item.to !== "/" && location.pathname.startsWith(`${item.to}/`))

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <Link to={item.to} preload="intent" aria-current={isActive ? "page" : undefined}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="mt-auto border-t-2 border-border px-2 py-3">
        <Button
          variant="neutral"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleToggleTheme}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
