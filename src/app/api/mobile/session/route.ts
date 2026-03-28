import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleMobileSessionGet } from "@/lib/mobile/sessionFacade";
import { getPublicUrl } from "@/lib/storage";

export async function GET() {
  return handleMobileSessionGet({
    authImpl: auth,
    loadUserById: async (userId) => {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          uid: true,
          name: true,
          email: true,
          image: true,
          role: true,
          isBanned: true,
        },
      });

      if (!user) {
        return null;
      }

      return {
        ...user,
        image: getPublicUrl(user.image),
      };
    },
  });
}
