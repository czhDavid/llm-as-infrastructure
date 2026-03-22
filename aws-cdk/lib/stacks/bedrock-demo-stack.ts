import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class BedrockDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bedrockDemoFn = new nodejs.NodejsFunction(this, 'BedrockDemoFunction', {
      entry: path.join(__dirname, '../lambda/bedrock-demo/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    bedrockDemoFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          'arn:aws:bedrock:*::foundation-model/amazon.nova-micro-v1:0',
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/eu.amazon.nova-micro-v1:0`,
        ],
      }),
    );
  }
}
