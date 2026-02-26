import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function syncFavoriteCounts(): Promise<void> {
  const servers = await prisma.server.findMany({
    select: { id: true },
  });

  for (const server of servers) {
    const count = await prisma.favorite.count({
      where: { serverId: server.id },
    });

    await prisma.server.update({
      where: { id: server.id },
      data: { favoriteCount: count },
    });
  }

  console.log(`已同步 ${servers.length} 个服务器的收藏数`);
}

syncFavoriteCounts()
  .catch((error) => {
    console.error("同步收藏数失败", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
