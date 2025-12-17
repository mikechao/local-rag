import { PageContainer } from "@/components/PageContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <PageContainer
      label="Settings"
      title="Application Settings"
      description="Configure application preferences and settings."
    >
      <span>Settings page content goes here.</span>
    </PageContainer>
  );
}
