const SUPPORTED_LANGUAGES = new Set([
  'javascript',
  'typescript',
  'javascriptreact',
  'typescriptreact'
]);

export function isSupportedLanguage(languageId: string): boolean {
  return SUPPORTED_LANGUAGES.has(languageId);
}

export function detectSymbolName(selectedCode: string): string | undefined {
  const patterns = [
    /\bexport\s+default\s+async\s+function\s+([A-Za-z_$][\w$]*)\b/,
    /\bexport\s+default\s+function\s+([A-Za-z_$][\w$]*)\b/,
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/,
    /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/,
    /\bexport\s+default\s+class\s+([A-Za-z_$][\w$]*)\b/,
    /\bexport\s+class\s+([A-Za-z_$][\w$]*)\b/,
    /\bclass\s+([A-Za-z_$][\w$]*)\b/,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|[A-Za-z_$][\w$]*\s*=>|\([^)]*\)\s*=>)/,
    /\bexport\s+default\s+([A-Za-z_$][\w$]*)\b/
  ];

  for (const pattern of patterns) {
    const match = selectedCode.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

export function extractImportsFromSource(sourceCode: string): string {
  const importPattern = /(?:^|\n)\s*import\s+(?:(?:type\s+)?[\s\S]*?\s+from\s+)?['"][^'"]+['"];?/g;
  const imports: string[] = [];
  let cursor = 0;

  for (const match of sourceCode.matchAll(importPattern)) {
    const matchIndex = match.index ?? 0;
    const before = sourceCode.slice(cursor, matchIndex);

    if (!containsOnlyWhitespaceOrComments(before)) {
      break;
    }

    imports.push(match[0].trim());
    cursor = matchIndex + match[0].length;
  }

  return imports.join('\n');
}

export function detectTypesInSelection(selectedCode: string): string {
  const declarations = [
    ...matchDeclarations(selectedCode, /\b(?:export\s+)?interface\s+[A-Za-z_$][\w$]*(?:\s+extends\s+[^{]+)?\s*{[\s\S]*?^\s*}/gm),
    ...matchDeclarations(selectedCode, /\b(?:export\s+)?type\s+[A-Za-z_$][\w$]*(?:<[^>]+>)?\s*=\s*[\s\S]*?;/g),
    ...matchDeclarations(selectedCode, /\b(?:export\s+)?enum\s+[A-Za-z_$][\w$]*\s*{[\s\S]*?^\s*}/gm)
  ];

  return declarations.join('\n\n');
}

export function isReactLikeSelection(languageId: string, selectedCode: string): boolean {
  if (languageId === 'javascriptreact' || languageId === 'typescriptreact') {
    return true;
  }

  return /<[A-Z][A-Za-z0-9.]*[\s>/]/.test(selectedCode)
    || /\bReact\./.test(selectedCode)
    || /\buse[A-Z][A-Za-z0-9_]*\s*\(/.test(selectedCode);
}

function matchDeclarations(source: string, pattern: RegExp): string[] {
  return Array.from(source.matchAll(pattern), (match) => match[0].trim());
}

function containsOnlyWhitespaceOrComments(value: string): boolean {
  const withoutBlockComments = value.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, '');
  return withoutLineComments.trim() === '';
}
