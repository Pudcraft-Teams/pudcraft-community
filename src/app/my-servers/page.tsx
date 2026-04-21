import { redirect } from "next/navigation";

/**
 * Legacy entrypoint: /my-servers.
 * Migrated to /console; kept for smooth backwards-compatible redirects.
 */
export default function MyServersPage() {
  redirect("/console");
}
