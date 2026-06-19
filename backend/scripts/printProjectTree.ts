import prisma from '../src/config/prisma.js';
import path from 'path';

function buildTree(folders: any[]) {
  const map = new Map<string, any>();
  for (const folder of folders) {
    map.set(folder.id, { ...folder, children: [], files: folder.files });
  }
  const roots: any[] = [];
  for (const folder of folders) {
    const node = map.get(folder.id);
    if (folder.parentId) {
      const parent = map.get(folder.parentId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

async function main() {
  const rootPath = path.resolve('C:/Users/rahul.sharma/Desktop/7. IGBC GH Lodha Panache, Pune - PC - First submission to IGBC').replace(/[\\/]+$/, '');

  const project = await prisma.project.findFirst({ where: { rootPath: { equals: rootPath, mode: 'insensitive' } } });
  if (!project) {
    console.error('Project not found for rootPath:', rootPath);
    process.exit(1);
  }

  const folders = await prisma.folder.findMany({
    where: { projectId: project.id },
    include: { files: true }
  });

  const tree = buildTree(folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    path: folder.path,
    relativePath: folder.relativePath,
    parentId: folder.parentId,
    files: folder.files.map(file => ({
      id: file.id,
      name: file.name,
      path: file.path,
      relativePath: file.relativePath,
      extension: file.extension,
      size: file.size,
      modifiedAt: file.modifiedAt
    }))
  })));

  console.log(JSON.stringify({ project: { id: project.id, name: project.name, rootPath: project.rootPath }, tree }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
