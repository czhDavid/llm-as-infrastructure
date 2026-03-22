import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3vectors from 'aws-cdk-lib/aws-s3vectors';
import { Construct } from 'constructs';
import * as path from 'path';

const EMBEDDING_DIMENSIONS = 1024;

export class BedrockKnowledgeBaseDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for source documents
    const docsBucket = new s3.Bucket(this, 'DocsBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // S3 Vector Bucket and Index
    const vectorBucket = new s3vectors.CfnVectorBucket(this, 'VectorBucket', {
      vectorBucketName: `kb-vectors-${this.account}`,
    });
    vectorBucket.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const vectorIndex = new s3vectors.CfnIndex(this, 'VectorIndex', {
      vectorBucketName: vectorBucket.vectorBucketName!,
      indexName: 'kb-index-v2',
      dataType: 'float32',
      dimension: EMBEDDING_DIMENSIONS,
      distanceMetric: 'cosine',
      metadataConfiguration: {
        nonFilterableMetadataKeys: ['AMAZON_BEDROCK_TEXT_CHUNK', 'AMAZON_BEDROCK_METADATA'],
      },
    });
    vectorIndex.addDependency(vectorBucket);
    vectorIndex.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // IAM role for the Knowledge Base
    const kbRole = new iam.Role(this, 'KBRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': this.account,
          },
        },
      }),
    });

    kbRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [docsBucket.bucketArn, docsBucket.arnForObjects('*')],
      }),
    );

    kbRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v2:0`],
      }),
    );

    kbRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3vectors:QueryVectors',
          's3vectors:PutVectors',
          's3vectors:GetVectors',
          's3vectors:DeleteVectors',
          's3vectors:ListVectors',
        ],
        resources: [vectorIndex.attrIndexArn],
      }),
    );

    // Knowledge Base with S3 Vectors storage
    const kb = new bedrock.CfnKnowledgeBase(this, 'KnowledgeBase', {
      name: 'demo-knowledge-base-v2',
      roleArn: kbRole.roleArn,
      description: 'Demo knowledge base with S3 vector storage',
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
          embeddingModelConfiguration: {
            bedrockEmbeddingModelConfiguration: {
              dimensions: EMBEDDING_DIMENSIONS,
              embeddingDataType: 'FLOAT32',
            },
          },
        },
      },
      storageConfiguration: {
        type: 'S3_VECTORS',
        s3VectorsConfiguration: {
          indexArn: vectorIndex.attrIndexArn,
        },
      },
    });
    kb.node.addDependency(vectorIndex);
    kb.node.addDependency(kbRole);

    // S3 Data Source
    new bedrock.CfnDataSource(this, 'DataSource', {
      knowledgeBaseId: kb.attrKnowledgeBaseId,
      name: 'docs-data-source',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: docsBucket.bucketArn,
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: 'FIXED_SIZE',
          fixedSizeChunkingConfiguration: {
            maxTokens: 300,
            overlapPercentage: 20,
          },
        },
      },
    });

    // IAM role for the Agent
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
        ],
      }),
    );

    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:Retrieve'],
        resources: [kb.attrKnowledgeBaseArn],
      }),
    );

    // Agent with Knowledge Base attached
    const agent = new bedrock.CfnAgent(this, 'KBAgent', {
      agentName: 'demo-knowledge-base-agent',
      agentResourceRoleArn: agentRole.roleArn,
      foundationModel: 'eu.amazon.nova-micro-v1:0',
      instruction: [
        'You are a helpful assistant with access to a knowledge base.',
        'Use the knowledge base to answer user questions.',
        'If the knowledge base does not contain relevant information, say so.',
        'Always cite the source document when answering from the knowledge base.',
      ].join('\n'),
      description: 'Demo agent with knowledge base integration',
      knowledgeBases: [
        {
          knowledgeBaseId: kb.attrKnowledgeBaseId,
          description: 'Contains uploaded documents for Q&A',
          knowledgeBaseState: 'ENABLED',
        },
      ],
      autoPrepare: true,
      idleSessionTtlInSeconds: 600,
    });

    // Agent alias
    const agentAlias = new bedrock.CfnAgentAlias(this, 'KBAgentAlias', {
      agentAliasName: 'live',
      agentId: agent.attrAgentId,
    });
    agentAlias.addDependency(agent);

    // Lambda to invoke the agent
    const knowledgeBaseDemoFn = new nodejs.NodejsFunction(this, 'KnowledgeBaseDemoFunction', {
      entry: path.join(__dirname, '../lambda/bedrock-knowledge-base-demo/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        AGENT_ID: agent.attrAgentId,
        AGENT_ALIAS_ID: agentAlias.attrAgentAliasId,
      },
    });

    knowledgeBaseDemoFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeAgent'],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:agent-alias/${agent.attrAgentId}/*`,
        ],
      }),
    );

    // Outputs
    new cdk.CfnOutput(this, 'DocsBucketName', {
      value: docsBucket.bucketName,
      description:
        'Upload documents to this bucket, then sync the data source in the Bedrock console',
    });
  }
}
