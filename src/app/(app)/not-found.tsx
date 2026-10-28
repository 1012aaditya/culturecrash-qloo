import { EmptyState } from "@/components/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24">
      <EmptyState title="Not found, or not shared with you" body="This item doesn’t exist in your current workspace, or your role doesn’t give you access. If it belongs to another workspace, switch workspace from your profile menu." action={{ href: "/projects", label: "Back to projects" }} />
    </div>
  );
}
