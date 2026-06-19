import path from 'path';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import prisma from '../config/prisma.js';
import { scanAbsoluteFolder, ScannedFolder, ScannedFile } from '../services/fileSystemService.js';

const mapProject = (project: any) => ({
  ...project,
  members: project.members.map((member: any) => member.user)
});

export const getAllProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId as string;

    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            status: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatarUrl: true,
                status: true
              }
            }
          }
        }
      }
    });

    res.json({
      message: 'Projects retrieved successfully',
      data: projects.map(mapProject)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve projects' });
  }
};

export const getProjectById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            status: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatarUrl: true,
                status: true
              }
            }
          }
        }
      }
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({
      message: 'Project retrieved successfully',
      data: mapProject(project)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve project' });
  }
};

export const getPublicProjects = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        owner: {
          select: { id: true, name: true }
        },
        members: {
          include: { user: { select: { id: true, name: true } } }
        },
        _count: {
          select: {
            folders: true,
            files: true
          }
        }
      }
    });

    res.json({
      message: 'Public projects retrieved',
      data: projects.map((project: any) => ({
        ...mapProject(project),
        folderCount: project._count.folders,
        fileCount: project._count.files,
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve public projects' });
  }
};

export const moveProjectToFinalSubmission = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.update({
      where: { id },
      data: { checklistStage: 'FINAL_SUBMISSION' },
      include: {
        owner: {
          select: { id: true, name: true }
        },
        members: {
          include: { user: { select: { id: true, name: true } } }
        },
        _count: {
          select: {
            folders: true,
            files: true
          }
        }
      }
    });

    res.json({
      message: 'Project moved to final submission',
      data: {
        ...mapProject(project),
        folderCount: project._count.folders,
        fileCount: project._count.files,
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to move project to final submission' });
  }
};


export const getPublicProjectTree = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const folders = await prisma.folder.findMany({
      where: { projectId: id },
      include: { files: true }
    });

    const map = new Map<string, any>();
    for (const f of folders) {
      map.set(f.id, { id: f.id, name: f.name, path: f.path, relativePath: f.relativePath, children: [], files: f.files.map((file: any) => ({ id: file.id, name: file.name, path: file.path, relativePath: file.relativePath, extension: file.extension, size: file.size })) });
    }

    let roots: any[] = [];
    for (const f of folders) {
      const node = map.get(f.id);
      if (f.parentId) {
        const parentNode = map.get(f.parentId);
        if (parentNode) parentNode.children.push(node);
        else roots.push(node);
      } else {
        roots.push(node);
      }
    }

    res.json({ message: 'Public project tree retrieved', data: roots });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load public project tree' });
  }
};

const importFolderTree = async (tree: ScannedFolder, projectId: string, parentId: string | null = null): Promise<void> => {
  const folder = await prisma.folder.create({
    data: {
      name: tree.name,
      path: tree.path,
      relativePath: tree.relativePath || '',
      project: { connect: { id: projectId } },
      parent: parentId ? { connect: { id: parentId } } : undefined,
    },
  });

  for (const child of tree.children) {
    if ((child as ScannedFolder).children) {
      await importFolderTree(child as ScannedFolder, projectId, folder.id);
    } else {
      const fileNode = child as ScannedFile;
      await prisma.file.create({
        data: {
          name: fileNode.name,
          path: fileNode.path,
          relativePath: fileNode.relativePath,
          extension: fileNode.extension || undefined,
          size: fileNode.size,
          modifiedAt: new Date(fileNode.modifiedAt),
          project: { connect: { id: projectId } },
          folder: { connect: { id: folder.id } },
        },
      });
    }
  }
};

export const importPublicProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { absolutePath } = req.body as { absolutePath?: string };

    if (!absolutePath) {
      res.status(400).json({ error: 'absolutePath is required' });
      return;
    }

    const normalizePath = (p: string) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
    const normalizedPath = normalizePath(absolutePath);

    const existingProjects = await prisma.project.findMany({
      where: { rootPath: { not: null } },
      select: { id: true, rootPath: true }
    });

    const existingProject = existingProjects.find((project: any) => normalizePath(project.rootPath as string) === normalizedPath);
    if (existingProject) {
      res.status(200).json({ message: 'Project already imported', data: { projectId: existingProject.id } });
      return;
    }

    const tree: ScannedFolder = await scanAbsoluteFolder(normalizedPath);
    const project = await prisma.project.create({
      data: {
        name: tree.name,
        rootPath: normalizedPath,
        startDate: new Date(),
      },
    });

    await importFolderTree(tree, project.id, null);

    res.status(201).json({ message: 'Public project imported', data: { projectId: project.id } });
  } catch (error: any) {
    console.error('importPublicProject error', error);
    res.status(500).json({ error: 'Failed to import public project', details: error?.message });
  }
};

export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, startDate, endDate, members, status, category } = req.body;

    if (!name || !startDate) {
      res.status(400).json({ error: 'Name and start date are required' });
      return;
    }

    const normalizedMembers = Array.isArray(members) ? members : [];
    const memberIds = Array.from(new Set<string>([...normalizedMembers, req.userId as string]));

    const project = await prisma.project.create({
      data: {
        name,
        description,
        category,
        status: status || 'active',
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
        ownerId: req.userId as string,
        members: {
          create: memberIds.map((userId) => ({ user: { connect: { id: userId } } }))
        }
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            status: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatarUrl: true,
                status: true
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      message: 'Project created successfully',
      data: mapProject(project)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
};

export const updateProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, status, endDate, startDate, members, category } = req.body;

    const existingProject = await prisma.project.findUnique({ where: { id } });
    if (!existingProject) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (existingProject.ownerId !== req.userId) {
      res.status(403).json({ error: 'Not authorized to update this project' });
      return;
    }

    const data: any = {};
    if (name) data.name = name;
    if (description) data.description = description;
    if (status) data.status = status;
    if (category) data.category = category;
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);
    if (members) {
      const memberIds = Array.from(new Set<string>([...members, req.userId as string]));
      data.members = {
        deleteMany: {},
        create: memberIds.map((userId: string) => ({ user: { connect: { id: userId } } }))
      };
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            status: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatarUrl: true,
                status: true
              }
            }
          }
        }
      }
    });

    res.json({
      message: 'Project updated successfully',
      data: mapProject(updatedProject)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
};

export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (project.ownerId !== req.userId) {
      res.status(403).json({ error: 'Not authorized to delete this project' });
      return;
    }

    await prisma.project.delete({ where: { id } });

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
};

export const importProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { absolutePath } = req.body as { absolutePath?: string };

    if (!absolutePath) {
      res.status(400).json({ error: 'absolutePath is required' });
      return;
    }

    const normalizePath = (p: string) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
    const normalizedPath = normalizePath(absolutePath);

    const existingProjects = await prisma.project.findMany({
      where: { rootPath: { not: null } },
      select: { id: true, rootPath: true }
    });

    const existingProject = existingProjects.find((project: any) => normalizePath(project.rootPath as string) === normalizedPath);

    if (existingProject) {
      res.status(200).json({
        message: 'Project already imported',
        data: { projectId: existingProject.id }
      });
      return;
    }

    // Scan the folder tree
    const tree: ScannedFolder = await scanAbsoluteFolder(normalizedPath);

    // Create project record
    let project;
    try {
      project = await prisma.project.create({
        data: {
          name: tree.name,
          rootPath: normalizedPath,
          startDate: new Date(),
          ownerId: req.userId as string
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('rootPath')) {
        const duplicateProject = await prisma.project.findMany({
          where: { rootPath: { not: null } },
          select: { id: true, rootPath: true }
        }).then((projects: any) => projects.find((project: any) => normalizePath(project.rootPath as string) === normalizedPath));

        if (duplicateProject) {
          res.status(200).json({
            message: 'Project already imported',
            data: { projectId: duplicateProject.id }
          });
          return;
        }
      }
      throw error;
    }

    // Recursive persistence
    const persistFolder = async (node: ScannedFolder, parentId: string | null) => {
      const folder = await prisma.folder.create({
        data: {
          name: node.name,
          path: node.path,
          relativePath: node.relativePath || '',
          project: { connect: { id: project.id } },
          parent: parentId ? { connect: { id: parentId } } : undefined
        }
      });

      for (const child of node.children) {
        // Distinguish folders vs files by checking for 'children' property
        if ((child as ScannedFolder).children) {
          await persistFolder(child as ScannedFolder, folder.id);
        } else {
          const fileNode = child as ScannedFile;
          await prisma.file.create({
            data: {
              name: fileNode.name,
              path: fileNode.path,
              relativePath: fileNode.relativePath,
              extension: fileNode.extension || undefined,
              size: fileNode.size,
              modifiedAt: new Date(fileNode.modifiedAt),
              project: { connect: { id: project.id } },
              folder: { connect: { id: folder.id } }
            }
          });
        }
      }
    };

    await persistFolder(tree, null);

    res.status(201).json({ message: 'Project imported', data: { projectId: project.id } });
  } catch (error: any) {
    console.error('importProject error', error);
    res.status(500).json({ error: 'Failed to import project', details: error?.message });
  }
};

export const getProjectTree = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const folders = await prisma.folder.findMany({
      where: { projectId: id },
      include: { files: true }
    });

    // Build map of folders
    const map = new Map<string, any>();
    for (const f of folders) {
      map.set(f.id, { id: f.id, name: f.name, path: f.path, relativePath: f.relativePath, children: [], files: f.files.map((file: any) => ({ id: file.id, name: file.name, path: file.path, relativePath: file.relativePath, extension: file.extension, size: file.size })) });
    }

    let roots: any[] = [];
    for (const f of folders) {
      const node = map.get(f.id);
      if (f.parentId) {
        const parentNode = map.get(f.parentId);
        if (parentNode) parentNode.children.push(node);
        else roots.push(node);
      } else {
        roots.push(node);
      }
    }

    res.json({ message: 'Project tree retrieved', data: roots });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load project tree' });
  }
};
