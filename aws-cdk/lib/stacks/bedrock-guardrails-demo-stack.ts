import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';
import * as path from 'path';

export class BedrockGuardrailsDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Bedrock Guardrail
    const guardrail = new bedrock.CfnGuardrail(this, 'DemoGuardrail', {
      name: 'demo-guardrail',
      description: 'Blocks profanity, insults, hate speech, and political topics',
      blockedInputMessaging:
        'Your request was blocked by our content policy. Please rephrase without profanity or political topics.',
      blockedOutputsMessaging:
        'The response was blocked by our content policy as it contained restricted content.',

      // Content filters for harmful content
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
          { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },

      // Managed profanity word list
      wordPolicyConfig: {
        managedWordListsConfig: [{ type: 'PROFANITY' }],
      },

      // Deny political topics
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'Politics',
            definition:
              'Any discussion about political parties, politicians, elections, voting, political ideologies, government policies, or political opinions.',
            examples: [
              'Who should I vote for in the next election?',
              'What do you think about the president?',
              'Is socialism better than capitalism?',
              'What are your political views?',
              'Tell me about the Republican or Democratic party.',
            ],
            type: 'DENY',
          },
        ],
      },
    });

    // Guardrail version (required for the Converse API)
    const guardrailVersion = new bedrock.CfnGuardrailVersion(this, 'DemoGuardrailVersion', {
      guardrailIdentifier: guardrail.attrGuardrailId,
      description: 'Initial version',
    });

    // Lambda function
    const guardrailsDemoFn = new nodejs.NodejsFunction(this, 'GuardrailsDemoFunction', {
      entry: path.join(__dirname, '../lambda/bedrock-guardrails-demo/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        GUARDRAIL_ID: guardrail.attrGuardrailId,
        GUARDRAIL_VERSION: guardrailVersion.attrVersion,
      },
    });

    guardrailsDemoFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          'arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0',
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/eu.amazon.nova-micro-v1:0`,
        ],
      }),
    );

    guardrailsDemoFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:ApplyGuardrail'],
        resources: [guardrail.attrGuardrailArn],
      }),
    );
  }
}
