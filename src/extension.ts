import * as vscode from 'vscode';
import {
  FileWriteError,
  LlmRequestError,
  MissingApiKeyError,
  UnsupportedLanguageError,
  generateVitestTestFromSelection
} from './services/testGenerator';

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('vitestGenerator.generateVitestTest', async () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showErrorMessage('Open a JavaScript or TypeScript file and select code to generate a Vitest test.');
      return;
    }

    if (editor.selection.isEmpty) {
      vscode.window.showErrorMessage('Select code before running Generate Vitest Test.');
      return;
    }

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Generating Vitest test...',
          cancellable: false
        },
        () => generateVitestTestFromSelection(editor)
      );

      const openAction = 'Open File';
      const action = await vscode.window.showInformationMessage(
        `Vitest test generated: ${vscode.workspace.asRelativePath(result.testFilePath)}`,
        openAction
      );

      if (action === openAction) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(result.testFilePath));
        await vscode.window.showTextDocument(document);
      }
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        vscode.window.showErrorMessage('vitestGenerator.apiKey is not set. Please add it to your settings.');
        return;
      }

      if (error instanceof UnsupportedLanguageError) {
        vscode.window.showErrorMessage(error.message);
        return;
      }

      if (error instanceof LlmRequestError) {
        vscode.window.showErrorMessage(error.message);
        return;
      }

      if (error instanceof FileWriteError) {
        vscode.window.showErrorMessage(`Failed to write ${error.filePath}: ${error.message}`);
        return;
      }

      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  });

  context.subscriptions.push(command);
}

export function deactivate(): void {}
