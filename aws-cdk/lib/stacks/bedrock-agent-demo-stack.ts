import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';
import * as path from 'path';

export class BedrockAgentDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Allowlist-only guardrail: deny anything not related to the tech meetup
    const guardrail = new bedrock.CfnGuardrail(this, 'AgentGuardrail', {
      name: 'agent-allowlist-guardrail',
      description: 'Only allows topics related to the Alma Career AI tech meetup',
      blockedInputMessaging:
        'Sorry, I can only answer questions about the Alma Career AI tech meetup.',
      blockedOutputsMessaging:
        'Sorry, I can only discuss topics related to the Alma Career AI tech meetup.',

      contentPolicyConfig: {
        filtersConfig: [
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },

      wordPolicyConfig: {
        managedWordListsConfig: [{ type: 'PROFANITY' }],
      },

      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'OffTopic',
            definition:
              'Any topic that is not directly related to the Alma Career AI tech meetup, its organizers, presenters, or the presentation topic.',
            examples: [
              'What is the capital of France?',
              'Tell me a joke.',
              'How do I cook pasta?',
            ],
            type: 'DENY',
          },
        ],
      },
    });

    const guardrailVersion = new bedrock.CfnGuardrailVersion(this, 'AgentGuardrailVersion', {
      guardrailIdentifier: guardrail.attrGuardrailId,
      description: 'Initial version',
    });

    // IAM role for the Bedrock Agent
    const agentRole = new iam.Role(this, 'AgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
          ArnLike: {
            'aws:SourceArn': `arn:aws:bedrock:${this.region}:${this.account}:agent/*`,
          },
        },
      }),
    });

    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0`,
          `arn:aws:bedrock:*:${this.account}:inference-profile/eu.amazon.nova-micro-v1:0`,
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-micro-v1:0`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/eu.amazon.nova-micro-v1:0`,
        ],
      }),
    );

    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:ApplyGuardrail', 'bedrock:GetGuardrail'],
        resources: [guardrail.attrGuardrailArn],
      }),
    );

    // Bedrock Agent with allowlist guardrail
    const agent = new bedrock.CfnAgent(this, 'DemoAgent', {
      agentName: 'demo-guarded-agent',
      agentResourceRoleArn: agentRole.roleArn,
      foundationModel: 'eu.amazon.nova-micro-v1:0',
      instruction: [
        'You are the official assistant for the Alma Career AI tech meetup.',
        '',
        'About this meetup:',
        '- It is an artificial intelligence tech meetup organized by Alma Career.',
        '- The organizer goes by the nickname Chemix. His real name is Jan.',
        '- The current presenter is David.',
        '- The presentation topic is: "Why you should move your LLM integration to AWS CDK".',
        '',
        'You may only answer questions about this meetup, its organizers, the presenter,',
        'the presentation topic, and related AWS CDK / LLM integration concepts as they',
        'relate to the talk. For anything else, politely decline and explain that you can',
        'only discuss the meetup.',
      ].join('\n'),
      description: 'Demo agent for the Alma Career AI tech meetup',
      guardrailConfiguration: {
        guardrailIdentifier: guardrail.attrGuardrailId,
        guardrailVersion: guardrailVersion.attrVersion,
      },
      autoPrepare: true,
      idleSessionTtlInSeconds: 600,
    });

    // Agent alias (required for invocation)
    const agentAlias = new bedrock.CfnAgentAlias(this, 'DemoAgentAlias', {
      agentAliasName: 'live',
      agentId: agent.attrAgentId,
    });
    agentAlias.addDependency(agent);

    // Lambda to invoke the agent
    const agentDemoFn = new nodejs.NodejsFunction(this, 'AgentDemoFunction', {
      entry: path.join(__dirname, '../lambda/bedrock-agent-demo/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        AGENT_ID: agent.attrAgentId,
        AGENT_ALIAS_ID: agentAlias.attrAgentAliasId,
      },
    });

    agentDemoFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeAgent'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:agent-alias/${agent.attrAgentId}/*`,
        ],
      }),
    );
  }
}
