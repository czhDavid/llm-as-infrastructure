import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({});

interface Event {
  prompt: string;
}

export const handler = async (event: Event) => {
  const { prompt } = event;

  if (!prompt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required parameter: prompt' }),
    };
  }

  const command = new ConverseCommand({
    modelId: 'eu.amazon.nova-micro-v1:0',
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 256,
      temperature: 0.7,
    },
  });

  const response = await client.send(command);
  const answer = response.output?.message?.content?.[0]?.text;

  return {
    statusCode: 200,
    body: JSON.stringify({ prompt, answer }),
  };
};
