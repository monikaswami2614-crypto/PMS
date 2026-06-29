import path from 'path';
import { promises as fs } from 'fs';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import prisma from '../config/prisma.js';
import { scanAbsoluteFolder, ScannedFolder, ScannedFile } from '../services/fileSystemService.js';
import { SERVER_CONFIG } from '../config/constants.js';
import { logActivity } from '../services/activityLogService.js';
import { createProjectAddedNotification } from '../services/notificationService.js';

const mapProject = (project: any) => ({
  ...project,
  members: project.members.map((member: any) => member.user)
});

const certificationFolders = [
  '0. General Submittal',
  '1. Supporting',
  '2. Sustainable Architecture and Design',
  '3. Water Conservation',
  '4. Energy Efficiency',
  '5. Building Material and Resources',
  '6. Indoor Environmental Quality',
  '7. Innovation and Development',
];

const getProjectTypeRootName = (projectType: string): string => (
  projectType === 'NB' ? 'NB Project' : 'Green Homes'
);

const sanitizeFolderName = (name: string): string => name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ');

const findOrCreateProjectTypeRoot = async (scanRootPath: string, projectType: string): Promise<string> => {
  const preferredName = getProjectTypeRootName(projectType);
  const candidates = projectType === 'NB'
    ? ['NB Project', 'NB Projects', 'NB']
    : ['Green Homes', 'green homes', 'GREEN HOMES', 'Green_Homes'];

  await fs.mkdir(scanRootPath, { recursive: true });

  for (const candidate of candidates) {
    const candidatePath = path.join(scanRootPath, candidate);
    try {
      const stats = await fs.stat(candidatePath);
      if (stats.isDirectory()) return candidatePath;
    } catch {
      // Try the next known root folder name.
    }
  }

  const rootPath = path.join(scanRootPath, preferredName);
  await fs.mkdir(rootPath, { recursive: true });
  return rootPath;
};

const createCertificationStructureOnDisk = async (projectRootPath: string): Promise<string[]> => {
  const foldersToCreate: string[] = [];

  for (const phase of ['Pre Certification', 'Final Certification']) {
    const submissionPath = path.join(projectRootPath, phase, '1 Submission');
    foldersToCreate.push(path.join(projectRootPath, phase), submissionPath);

    for (const folder of certificationFolders) {
      foldersToCreate.push(path.join(submissionPath, folder));
    }
  }

  for (const folderPath of foldersToCreate) {
    await fs.mkdir(folderPath, { recursive: true });
  }

  return foldersToCreate;
};

const deleteProjectDatabaseRecords = async (projectId: string): Promise<void> => {
  await prisma.validationLog.deleteMany({ where: { projectId } });
  await prisma.projectChecklistStatus.deleteMany({ where: { projectId } });
  await prisma.certificationValidationResult.deleteMany({ where: { projectId } });
  await prisma.projectCertificationStatus.deleteMany({ where: { projectId } });
  await prisma.file.deleteMany({ where: { projectId } });
  await prisma.task.deleteMany({ where: { projectId } });
  await prisma.projectMember.deleteMany({ where: { projectId } });

  const folders = await prisma.folder.findMany({
    where: { projectId },
    select: { id: true, relativePath: true },
  });

  const foldersDeepestFirst = folders.sort((a, b) => {
    const depthA = a.relativePath ? a.relativePath.split('/').length : 0;
    const depthB = b.relativePath ? b.relativePath.split('/').length : 0;
    return depthB - depthA;
  });

  for (const folder of foldersDeepestFirst) {
    await prisma.folder.delete({ where: { id: folder.id } });
  }

  await prisma.project.delete({ where: { id: projectId } });
};

const deleteProjectFolderOnDisk = async (projectRootPath?: string | null): Promise<void> => {
  if (!projectRootPath || !SERVER_CONFIG.scanRootPath) return;

  const scanRootPath = path.resolve(SERVER_CONFIG.scanRootPath);
  const resolvedProjectPath = path.resolve(projectRootPath);
  const relativeProjectPath = path.relative(scanRootPath, resolvedProjectPath);

  if (relativeProjectPath.startsWith('..') || path.isAbsolute(relativeProjectPath) || relativeProjectPath === '') {
    throw new Error('Project path is outside the configured scan root');
  }

  await fs.rm(resolvedProjectPath, { recursive: true, force: true });
};

const persistBlankProjectFolders = async (projectId: string, projectRootPath: string): Promise<void> => {
  const rootFolder = await prisma.folder.create({
    data: {
      name: path.basename(projectRootPath),
      path: projectRootPath,
      relativePath: '',
      project: { connect: { id: projectId } },
    },
  });

  for (const phase of ['Pre Certification', 'Final Certification']) {
    const phasePath = path.join(projectRootPath, phase);
    const phaseFolder = await prisma.folder.create({
      data: {
        name: phase,
        path: phasePath,
        relativePath: path.relative(projectRootPath, phasePath).split(path.sep).join('/'),
        project: { connect: { id: projectId } },
        parent: { connect: { id: rootFolder.id } },
      },
    });

    const submissionPath = path.join(phasePath, '1 Submission');
    const submissionFolder = await prisma.folder.create({
      data: {
        name: '1 Submission',
        path: submissionPath,
        relativePath: path.relative(projectRootPath, submissionPath).split(path.sep).join('/'),
        project: { connect: { id: projectId } },
        parent: { connect: { id: phaseFolder.id } },
      },
    });

    for (const folder of certificationFolders) {
      const folderPath = path.join(submissionPath, folder);
      await prisma.folder.create({
        data: {
          name: folder,
          path: folderPath,
          relativePath: path.relative(projectRootPath, folderPath).split(path.sep).join('/'),
          project: { connect: { id: projectId } },
          parent: { connect: { id: submissionFolder.id } },
        },
      });
    }
  }
};

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

    await logActivity({
      actionType: 'Project moved to final certification',
      moduleName: 'PROJECT',
      projectId: project.id,
      projectName: project.name,
      description: `Project "${project.name}" moved to final submission.`,
      newValue: { checklistStage: project.checklistStage },
      request: req,
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

export const moveProjectToReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const project = await prisma.project.update({
      where: { id },
      data: { checklistStage: 'REVIEW' },
    });

    await logActivity({
      actionType: 'Project moved to review',
      moduleName: 'PROJECT',
      projectId: project.id,
      projectName: project.name,
      description: `Project "${project.name}" moved back to review.`,
      newValue: { checklistStage: project.checklistStage },
      request: req,
    });

    res.json({
      message: 'Project moved back to review',
      data: mapProject(project),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to move project back to review' });
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
      map.set(f.id, { id: f.id, name: f.name, path: f.path, relativePath: f.relativePath, children: [], files: f.files.map((file: any) => ({ id: file.id, name: file.name, path: file.path, relativePath: file.relativePath, extension: file.extension, size: file.size, modifiedAt: file.modifiedAt, createdAt: file.createdAt, updatedAt: file.updatedAt })) });
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
    await createProjectAddedNotification(project.id, project.name);

    res.status(201).json({ message: 'Public project imported', data: { projectId: project.id } });
  } catch (error: any) {
    console.error('importPublicProject error', error);
    res.status(500).json({ error: 'Failed to import public project', details: error?.message });
  }
};

export const createBlankPublicProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectType, projectName } = req.body as { projectType?: string; projectName?: string };

    if (!projectType || !['NB', 'GH'].includes(projectType)) {
      res.status(400).json({ error: 'Project Type must be NB or GH' });
      return;
    }

    const cleanProjectName = sanitizeFolderName(projectName || '');
    if (!cleanProjectName) {
      res.status(400).json({ error: 'Project Name is required' });
      return;
    }

    if (!SERVER_CONFIG.scanRootPath) {
      res.status(500).json({ error: 'SCAN_ROOT_PATH is not configured in backend .env' });
      return;
    }

    const scanRootPath = path.resolve(SERVER_CONFIG.scanRootPath);
    const projectTypeRootPath = await findOrCreateProjectTypeRoot(scanRootPath, projectType);
    const projectRootPath = path.join(projectTypeRootPath, cleanProjectName);
    const normalizedProjectRootPath = path.resolve(projectRootPath);

    const relativeProjectPath = path.relative(scanRootPath, normalizedProjectRootPath);
    if (relativeProjectPath.startsWith('..') || path.isAbsolute(relativeProjectPath)) {
      res.status(400).json({ error: 'Project path is outside the configured scan root' });
      return;
    }

    const existingProjectFolder = await fs.stat(normalizedProjectRootPath).catch(() => null);
    if (existingProjectFolder) {
      res.status(409).json({ error: 'A project folder with this name already exists' });
      return;
    }

    const existingProject = await prisma.project.findFirst({
      where: {
        OR: [
          { name: cleanProjectName },
          { rootPath: normalizedProjectRootPath },
        ],
      },
      select: { id: true },
    });

    if (existingProject) {
      res.status(409).json({ error: 'A project with this name or path already exists' });
      return;
    }

    await fs.mkdir(normalizedProjectRootPath, { recursive: true });
    await createCertificationStructureOnDisk(normalizedProjectRootPath);

    const category = projectType === 'NB' ? 'NB Project' : 'Green Homes';
    const project = await prisma.project.create({
      data: {
        name: cleanProjectName,
        description: '',
        category,
        rootPath: normalizedProjectRootPath,
        status: 'active',
        startDate: new Date(),
      },
    });

    try {
    await persistBlankProjectFolders(project.id, normalizedProjectRootPath);
    } catch (error) {
      await prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
      throw error;
    }

    const createdProject = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        owner: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
        _count: { select: { folders: true, files: true } },
      },
    });

    await logActivity({
      actionType: 'New blank project created',
      moduleName: 'PROJECT',
      projectId: project.id,
      projectName: cleanProjectName,
      description: `Blank ${projectType} project "${cleanProjectName}" created.`,
      newValue: {
        projectType,
        projectName: cleanProjectName,
        rootPath: normalizedProjectRootPath,
      },
      metadata: { folderCount: createdProject?._count.folders ?? 0 },
      request: req,
    });
    await createProjectAddedNotification(project.id, cleanProjectName);

    res.status(201).json({
      message: 'Blank project created successfully',
      data: createdProject ? {
        ...mapProject(createdProject),
        folderCount: createdProject._count.folders,
        fileCount: createdProject._count.files,
      } : { projectId: project.id },
    });
  } catch (error: any) {
    console.error('createBlankPublicProject error', error);
    res.status(500).json({ error: 'Failed to create blank project', details: error?.message });
  }
};

export const deletePublicProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true, rootPath: true },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await logActivity({
      actionType: 'Project deleted',
      moduleName: 'PROJECT',
      projectId: project.id,
      projectName: project.name,
      description: `Project "${project.name}" deleted.`,
      oldValue: project,
      request: req,
    });

    await deleteProjectFolderOnDisk(project.rootPath);
    await deleteProjectDatabaseRecords(project.id);

    res.json({ message: 'Project deleted successfully', data: { projectId: project.id } });
  } catch (error: any) {
    console.error('deletePublicProject error', error);
    res.status(500).json({ error: 'Failed to delete project', details: error?.message });
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
    await createProjectAddedNotification(project.id, project.name);
    await logActivity({
      user: { id: req.userId },
      actionType: 'Project created',
      moduleName: 'PROJECT',
      projectId: project.id,
      projectName: project.name,
      description: `Project "${project.name}" created.`,
      newValue: {
        name: project.name,
        description: project.description,
        category: project.category,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
      },
      request: req,
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
    await logActivity({
      user: { id: req.userId },
      actionType: 'Project updated',
      moduleName: 'PROJECT',
      projectId: updatedProject.id,
      projectName: updatedProject.name,
      description: `Project "${updatedProject.name}" details updated.`,
      oldValue: {
        name: existingProject.name,
        description: existingProject.description,
        category: existingProject.category,
        status: existingProject.status,
        startDate: existingProject.startDate,
        endDate: existingProject.endDate,
      },
      newValue: {
        name: updatedProject.name,
        description: updatedProject.description,
        category: updatedProject.category,
        status: updatedProject.status,
        startDate: updatedProject.startDate,
        endDate: updatedProject.endDate,
      },
      request: req,
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

    await logActivity({
      user: { id: req.userId },
      actionType: 'Project deleted',
      moduleName: 'PROJECT',
      projectId: project.id,
      projectName: project.name,
      description: `Project "${project.name}" deleted.`,
      oldValue: {
        name: project.name,
        description: project.description,
        category: project.category,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
      },
      request: req,
    });
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
    await createProjectAddedNotification(project.id, project.name);

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
