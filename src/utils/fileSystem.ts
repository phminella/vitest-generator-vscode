import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

interface InitialTestFilePathInput {
  workspaceRoot: string;
  sourceFilePath: string;
  relativeSourcePath: string;
  testDir: string;
  testBaseName: string;
}

export function getWorkspaceRoot(uri: vscode.Uri): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

  if (workspaceFolder) {
    return workspaceFolder.uri.fsPath;
  }

  if (vscode.workspace.workspaceFolders?.[0]) {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }

  return path.dirname(uri.fsPath);
}

export function getInitialTestFilePath(input: InitialTestFilePathInput): string {
  const testRoot = path.isAbsolute(input.testDir)
    ? path.normalize(input.testDir)
    : path.resolve(input.workspaceRoot, input.testDir);
  const mirroredParts = getMirroredDirectoryParts(input.relativeSourcePath);
  const targetDirectory = path.join(testRoot, ...mirroredParts);

  return path.join(targetDirectory, `${input.testBaseName}.test.ts`);
}

export function computeRelativeImportPath(testFilePath: string, sourceFilePath: string): string {
  const fromDirectory = path.dirname(testFilePath);
  const sourceWithoutExtension = stripSourceExtension(sourceFilePath);
  let relativeImport = normalizeToPosix(path.relative(fromDirectory, sourceWithoutExtension));

  if (!relativeImport.startsWith('.')) {
    relativeImport = `./${relativeImport}`;
  }

  return relativeImport;
}

export async function writeNewFileWithSuffix(initialFilePath: string, content: string): Promise<string> {
  const parsed = path.parse(initialFilePath);

  await fs.mkdir(parsed.dir, { recursive: true });

  for (let index = 0; index < 1000; index += 1) {
    const filePath = index === 0
      ? initialFilePath
      : path.join(parsed.dir, `${parsed.name}.${index}${parsed.ext}`);

    try {
      await fs.writeFile(filePath, content, { flag: 'wx' });
      return filePath;
    } catch (error) {
      if (isNodeError(error) && error.code === 'EEXIST') {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Could not find an available file name for ${initialFilePath}.`);
}

export function sanitizeFileName(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim();
  return sanitized || 'generated';
}

export function normalizeToPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function getMirroredDirectoryParts(relativeSourcePath: string): string[] {
  const parts = normalizeToPosix(relativeSourcePath)
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..');
  const directoryParts = parts.slice(0, -1);

  return directoryParts[0] === 'src' ? directoryParts.slice(1) : directoryParts;
}

function stripSourceExtension(filePath: string): string {
  return filePath.replace(/\.(?:[cm]?[jt]sx?)$/i, '');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
