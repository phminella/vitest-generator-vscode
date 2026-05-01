import * as path from "node:path";
import * as vscode from "vscode";
import {
  DEFAULT_MODELS,
  ProviderName,
  createProvider,
  isProviderName,
} from "../providers";
import {
  computeRelativeImportPath,
  getInitialTestFilePath,
  getWorkspaceRoot,
  normalizeToPosix,
  sanitizeFileName,
  writeNewFileWithSuffix,
} from "../utils/fileSystem";
import {
  detectSymbolName,
  detectTypesInSelection,
  extractImportsFromSource,
  isReactLikeSelection,
  isSupportedLanguage,
} from "../utils/parser";
import { stripMarkdownFences } from "../utils/stripMarkdown";

const SYSTEM_PROMPT = `You are an expert TypeScript test engineer. You write production-quality Vitest tests.

Rules:
- Output ONLY valid TypeScript test code. No explanations, no markdown, no comments outside the code.
- Always import from 'vitest': describe, it, expect, vi
- Always include the correct import for the module under test (the import path will be provided)
- Write tests for: happy path, edge cases, error cases
- Use vi.mock() for external dependencies
- If the code is a React component, use @testing-library/react
- Handle async functions with async/await
- Never write trivial tests
- NEVER use .toHaveLength() with any number above 10.
- getByText() and getByRole() return a single DOM element — NEVER call .toBeGreaterThan() on them. Only use .toBeInTheDocument() or other DOM matchers.
- getAllByText() and getAllByRole() return an array — if you need to assert count, use .length first: expect(screen.getAllByText('x').length).toBeGreaterThan(0). NEVER call .toBeGreaterThan() directly on the array itself.
- NEVER write a test that passes an empty string to userEvent.type(). If testing empty input behavior, assert the initial render state without typing anything.
- NEVER assert isPending or loading text synchronously after a fireEvent or userEvent call. The intermediate state is not reliably catchable in jsdom. Remove any synchronous loading assertions entirely.
- NEVER import or use fireEvent from @testing-library/react. Always use userEvent from @testing-library/user-event. Every fireEvent.change(input, ...) must become await userEvent.type(input, ...).
- Every test must have a clear, realistic purpose. Never write a test whose input or assertion is logically meaningless (e.g. typing empty strings, asserting text that was never rendered, checking states that cannot occur).
- ALWAYS add these two comment lines at the very top of every generated test file, before any imports:
// Requires: environment: 'jsdom' in vitest.config.ts
// and: import '@testing-library/jest-dom' in your vitest setup file
- ALWAYS scan the selected code for functions that are not exported. For each one found, add a // Note: [functionName] was not tested because it is not exported comment at the bottom of the generated file.`;
const LLM_TIMEOUT_MS = 45_000;
export interface GenerationResult {
  testFilePath: string;
}

interface GeneratorSettings {
  testDir: string;
  provider: ProviderName;
  apiKey: string;
  model: string;
}

interface GenerationContext {
  selectedCode: string;
  relativeSourcePath: string;
  sourceFilePath: string;
  testFilePath: string;
  importPath: string;
  detectedName: string | undefined;
  detectedImports: string;
  detectedTypes: string;
  isReact: boolean;
}

export class MissingApiKeyError extends Error {}
export class UnsupportedLanguageError extends Error {}
export class LlmRequestError extends Error {}

export class FileWriteError extends Error {
  constructor(
    message: string,
    readonly filePath: string,
  ) {
    super(message);
  }
}

export async function generateVitestTestFromSelection(
  editor: vscode.TextEditor,
): Promise<GenerationResult> {
  const document = editor.document;

  if (!isSupportedLanguage(document.languageId)) {
    throw new UnsupportedLanguageError(
      "Generate Vitest Test supports JavaScript, TypeScript, JavaScript React, and TypeScript React files.",
    );
  }

  const selectedCode = document.getText(editor.selection).trim();

  if (!selectedCode) {
    throw new Error("Select code before running Generate Vitest Test.");
  }

  const settings = getSettings();

  if (!settings.apiKey) {
    throw new MissingApiKeyError();
  }

  const context = buildGenerationContext(
    editor,
    settings.testDir,
    selectedCode,
  );
  const provider = createProvider(settings.provider, settings.apiKey);
  const userPrompt = buildUserPrompt(context);

  let rawTestCode: string;

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `LLM request timed out after ${LLM_TIMEOUT_MS / 1000}s. Check your API key, network, or try a faster model.`,
            ),
          ),
        LLM_TIMEOUT_MS,
      ),
    );

    rawTestCode = await Promise.race([
      provider.generateTest({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        model: settings.model,
      }),
      timeoutPromise,
    ]);
  } catch (error) {
    throw new LlmRequestError(getErrorMessage(error));
  }

  const testCode = ensureModuleImportPath(
    stripMarkdownFences(rawTestCode),
    context.importPath,
    context.sourceFilePath,
    context.detectedName,
    context.selectedCode,
  );

  if (!testCode.trim()) {
    throw new LlmRequestError(
      "The selected provider returned an empty test file.",
    );
  }

  try {
    const testFilePath = await writeNewFileWithSuffix(
      context.testFilePath,
      testCode.endsWith("\n") ? testCode : `${testCode}\n`,
    );
    return { testFilePath };
  } catch (error) {
    throw new FileWriteError(getErrorMessage(error), context.testFilePath);
  }
}

function getSettings(): GeneratorSettings {
  const config = vscode.workspace.getConfiguration("vitestGenerator");
  const providerValue = config.get<string>("provider", "openai");
  const provider = isProviderName(providerValue) ? providerValue : "openai";
  const modelOverride = config.get<string>("model", "").trim();

  return {
    testDir: config.get<string>("testDir", "./test").trim() || "./test",
    provider,
    apiKey: config.get<string>("apiKey", "").trim(),
    model: modelOverride || DEFAULT_MODELS[provider],
  };
}

function buildGenerationContext(
  editor: vscode.TextEditor,
  testDir: string,
  selectedCode: string,
): GenerationContext {
  const document = editor.document;
  const sourceFilePath = document.uri.fsPath;
  const workspaceRoot = getWorkspaceRoot(document.uri);
  const relativeSourcePath = normalizeToPosix(
    path.relative(workspaceRoot, sourceFilePath),
  );
  const detectedName = detectSymbolName(selectedCode);
  const testBaseName = sanitizeFileName(detectedName ?? "generated");
  const testFilePath = getInitialTestFilePath({
    workspaceRoot,
    sourceFilePath,
    relativeSourcePath,
    testDir,
    testBaseName,
  });

  return {
    selectedCode,
    relativeSourcePath,
    sourceFilePath,
    testFilePath,
    importPath: computeRelativeImportPath(testFilePath, sourceFilePath),
    detectedName,
    detectedImports: extractImportsFromSource(document.getText()),
    detectedTypes: detectTypesInSelection(selectedCode),
    isReact: isReactLikeSelection(document.languageId, selectedCode),
  };
}

function buildUserPrompt(context: GenerationContext): string {
  return `Source file: ${context.relativeSourcePath}
Import it in the test as: ${context.importPath}
Detected function/class/component name: ${context.detectedName ?? "None detected"}
React or hook selection: ${context.isReact ? "yes" : "no"}
TypeScript types present in the selection:
${context.detectedTypes || "None detected"}

Selected code:
${context.selectedCode}

Detected imports from source file:
${context.detectedImports || "None detected"}`;
}

function ensureModuleImportPath(
  testCode: string,
  importPath: string,
  sourceFilePath: string,
  detectedName: string | undefined,
  selectedCode: string,
): string {
  if (hasImportFromPath(testCode, importPath)) {
    return testCode;
  }

  const sourceStem = path.basename(sourceFilePath).replace(/\.[^.]+$/, "");
  const importFromModulePattern = new RegExp(
    `(import\\s+[\\s\\S]*?\\s+from\\s+['"])([^'"]*${escapeRegExp(sourceStem)}[^'"]*)(['"];?)`,
    "m",
  );

  if (importFromModulePattern.test(testCode)) {
    return testCode.replace(importFromModulePattern, `$1${importPath}$3`);
  }

  const importStatement = !detectedName
    ? `import * as moduleUnderTest from '${importPath}';`
    : isDefaultExport(selectedCode)
      ? `import ${detectedName} from '${importPath}';`
      : `import { ${detectedName} } from '${importPath}';`;

  return `${importStatement}\n${testCode}`;
}

function hasImportFromPath(testCode: string, importPath: string): boolean {
  const importPathPattern = new RegExp(
    `from\\s+['"]${escapeRegExp(importPath)}['"]`,
  );
  return importPathPattern.test(testCode);
}

function isDefaultExport(selectedCode: string): boolean {
  return /\bexport\s+default\b/.test(selectedCode);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
