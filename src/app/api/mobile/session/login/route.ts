import { handleMobileLoginPost } from "@/lib/mobile/sessionFacade";

export async function POST(request: Request) {
  return handleMobileLoginPost(request);
}
