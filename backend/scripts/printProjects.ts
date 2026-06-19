import prisma from '../src/config/prisma.js';

async function main() {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      rootPath: true,
      createdAt: true,
      updatedAt: true
    }
  });
  console.log(JSON.stringify(projects, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
