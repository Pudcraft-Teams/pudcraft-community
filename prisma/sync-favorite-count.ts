import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const servers = await prisma.server.findMany({
    select: {
      id: true,
      _count: {
        select: {
          favorites: true,
        },
      },
    },
  });

  await Promise.all(
    servers.map((server) =>
      prisma.server.update({
        where: { id: server.id },
        data: {
          favoriteCount: server._count.favorites,
        },
      }),
    ),
  );

  console.log(`Synced favorite counts for ${servers.length} servers`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
