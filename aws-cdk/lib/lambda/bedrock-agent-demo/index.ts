import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

const client = new BedrockAgentRuntimeClient({});

const AGENT_ID = process.env.AGENT_ID!;
const AGENT_ALIAS_ID = process.env.AGENT_ALIAS_ID!;

interface Event {
  prompt: string;
  sessionId?: string;
}

export const handler = async (event: Event) => {
  const { prompt, sessionId } = event;

  if (!prompt) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required parameter: prompt' }),
    };
  }

  const command = new InvokeAgentCommand({
    agentId: AGENT_ID,
    agentAliasId: AGENT_ALIAS_ID,
    sessionId: sessionId ?? `session-${Date.now()}`,
    inputText: prompt,
  });

  const response = await client.send(command);

  let answer = '';
  if (response.completion) {
    for await (const chunk of response.completion) {
      if (chunk.chunk?.bytes) {
        answer += new TextDecoder().decode(chunk.chunk.bytes);
      }
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ prompt, answer }),
  };
};
