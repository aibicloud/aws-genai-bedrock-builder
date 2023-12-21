#!/usr/bin/env node
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';
import { execSync } from 'child_process';
import { NodejsBuild } from "deploy-time-build";

export interface StaticSiteProps extends StackProps {
  domainName: string;
  siteSubDomain: string;
}

// function buildApp() {
//   execSync('npm install', {
//     cwd: "./src/frontend/",
//     stdio: 'inherit' 
//   });
//   execSync('npm run build', {
//     cwd: "./src/frontend/",
//     stdio: 'inherit' 
//   });
// }

/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class CDKCloudFrontWebsiteStack extends Stack {
  // constructor(parent: Stack, name: string, props: StaticSiteProps) {
  // super(parent, name);
  constructor(scope: Construct, name: string, props: StaticSiteProps) {
    super(scope, name, props)

    // buildApp();

    // const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainName });
    const siteDomain = props.siteSubDomain + '.' + props.domainName;
    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, 'cloudfront-OAI', {
      comment: `OAI for ${name}`
    });

    // new CfnOutput(this, 'Site', { value: 'https://' + siteDomain });

    // Content bucket
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: siteDomain,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

      /**
       * The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
       * the new bucket, and it will remain in your account until manually deleted. By setting the policy to
       * DESTROY, cdk destroy will attempt to delete the bucket, but will error if the bucket is not empty.
       */
      removalPolicy: RemovalPolicy.DESTROY, // NOT recommended for production code

      /**
       * For sample purposes only, if you create an S3 bucket then populate it, stack destruction fails.  This
       * setting will enable full cleanup of the demo.
       */
      autoDeleteObjects: true, // NOT recommended for production code
    });

    // Grant access to cloudfront
    siteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [siteBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
    }));
    new CfnOutput(this, 'Bucket', { value: siteBucket.bucketName });

    // TLS certificate
    // const certificate = new acm.Certificate(this, 'SiteCertificate', {
    //   domainName: siteDomain,
    //   validation: acm.CertificateValidation.fromDns(zone),
    // });

    // new CfnOutput(this, 'Certificate', { value: certificate.certificateArn });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      // certificate: certificate,
      defaultRootObject: "chatmodel.html",
      // domainNames: [siteDomain],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 403,
          responsePagePath: '/error.html',
          ttl: Duration.minutes(30),
        }
      ],
      defaultBehavior: {
        origin: new cloudfront_origins.S3Origin(siteBucket, { originAccessIdentity: cloudfrontOAI }),
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      }
    })

    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });

    new CfnOutput(this, 'Site', { value: distribution.distributionDomainName });

    // Route53 alias record for the CloudFront distribution
    // new route53.ARecord(this, 'SiteAliasRecord', {
    //   recordName: siteDomain,
    //   target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    //   zone
    // });

    // Deploy site contents to S3 bucket
    new s3deploy.BucketDeployment(this, 'DeployWithInvalidation', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../src/frontend/lib'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });


    // new NodejsBuild(this, "ReactBuild", {
    //   assets: [
    //     {
    //       path: "./src/frontend",
    //       exclude: ["node_modules", "dist"],
    //       commands: ["npm ci"],
    //     },
    //   ],
    //   buildCommands: ["npm run build"],
    //   buildEnvironment: {
    //     LAMBDA_AGENT_INVOKE_HOST: props.lambdaFunctionUrls.agentInvokeHost,
    //     LAMBDA_KB_INGEST_HOST: props.lambdaFunctionUrls.kbIngestHost,
    //     LAMBDA_KB_HOST_HOST: props.lambdaFunctionUrls.kbListHost,
    //     LAMBDA_KB_INVOKE_HOST: props.lambdaFunctionUrls.kbInvokeHost,
    //     LAMBDA_MODEL_INVOKE_HOST: props.lambdaFunctionUrls.modelInvokeHost,
    //     LAMBDA_S3_PRESIGN_HOST: props.lambdaFunctionUrls.s3PresignHost,
    //     LAMBDA_S3_QUERY_HOST: props.lambdaFunctionUrls.s3QueryHost,
    //   },
    //   destinationBucket: siteBucket,
    //   distribution,
    //   outputSourceDirectory: "lib",
    // });


    
  }
}
