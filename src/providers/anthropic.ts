import Anthropic from '@anthropic-ai/sdk';
import type { GenerateTestRequest, LlmProvider } from './index';

export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateTest(request: GenerateTestRequest): Promise<string> {
    const message = await this.client.messages.create({
      model: request.model,
      max_tokens: 4096,
      temperature: 0.2,
      system: request.systemPrompt,
      messages: [
        {
          role: 'user',
          content: request.userPrompt
        }
      ]
    });

    const content = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n');

    if (!content) {
      throw new Error('Anthropic returned an empty response.');
    }

    return content;
  }
}
