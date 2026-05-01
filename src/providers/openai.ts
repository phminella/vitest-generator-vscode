import OpenAI from 'openai';
import type { GenerateTestRequest, LlmProvider } from './index';

export class OpenAiProvider implements LlmProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateTest(request: GenerateTestRequest): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: request.systemPrompt
        },
        {
          role: 'user',
          content: request.userPrompt
        }
      ]
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('OpenAI returned an empty response.');
    }

    return content;
  }
}
