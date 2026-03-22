import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({});

const GUARDRAIL_ID = process.env.GUARDRAIL_ID!;
const GUARDRAIL_VERSION = process.env.GUARDRAIL_VERSION!;

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
    guardrailConfig: {
      guardrailIdentifier: GUARDRAIL_ID,
      guardrailVersion: GUARDRAIL_VERSION,
    },
  });

  const response = await client.send(command);
  const answer = response.output?.message?.content?.[0]?.text;
  const stopReason = response.stopReason;

  return {
    statusCode: 200,
    body: JSON.stringify({
      prompt,
      answer,
      blockedByGuardrail: stopReason === 'guardrail_intervened',
    }),
  };
};
