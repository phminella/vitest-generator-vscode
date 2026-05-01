import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OpenAiProvider } from './openai';

export type ProviderName = 'openai' | 'anthropic' | 'gemini';

export interface GenerateTestRequest {
  systemPrompt: string;
  userPrompt: string;
  model: string;
}

export interface LlmProvider {
  generateTest(request: GenerateTestRequest): Promise<string>;
}

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5',
  gemini: 'gemini-2.0-flash'
};

export function createProvider(provider: ProviderName, apiKey: string): LlmProvider {
  switch (provider) {
    case 'openai':
      return new OpenAiProvider(apiKey);
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'gemini':
      return new GeminiProvider(apiKey);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported LLM provider: ${exhaustive}`);
    }
  }
}

export function isProviderName(value: unknown): value is ProviderName {
  return value === 'openai' || value === 'anthropic' || value === 'gemini';
}
