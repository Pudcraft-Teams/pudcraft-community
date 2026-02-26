import { redirect } from "next/navigation";

/**
 * 兼容旧入口：/my-servers。
 * 已迁移到 /console，保留该路由用于平滑跳转。
 */
export default function MyServersPage() {
  redirect("/console");
}
