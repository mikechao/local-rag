import { Separator } from "@/components/ui/separator"

interface PageContainerProps {
  label: string
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  actions?: React.ReactNode
}

export function PageContainer({
  label,
  title,
  description,
  children,
  actions,
}: PageContainerProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold tracking-wide text-main">{label}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-heading">{title}</h1>
            {description && (
              <div className="text-foreground/80">
                {description}
              </div>
            )}
          </div>
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
      <Separator />
      {children}
    </div>
  )
}
