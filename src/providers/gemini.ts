import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerateTestRequest, LlmProvider } from './index';

export class GeminiProvider implements LlmProvider {
  private readonly client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateTest(request: GenerateTestRequest): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: request.model,
      systemInstruction: request.systemPrompt
    });

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: request.userPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2
      }
    });

    const content = result.response.text();

    if (!content) {
      throw new Error('Gemini returned an empty response.');
    }

    return content;
  }
}
