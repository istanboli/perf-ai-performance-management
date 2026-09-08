import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/projects")({ component: ProjectsLayout });

function ProjectsLayout() {
  return <Outlet />;
}
