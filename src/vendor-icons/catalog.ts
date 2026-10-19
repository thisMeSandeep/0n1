/*
 * Vendor icons (a component's own icon, chosen in the inspector): a few AWS,
 * Azure and Google Cloud icons for each kind of component, so a design can
 * look like the cloud it's meant for. The 0n1 icon stays the default.
 *
 * The files live in public/vendor-icons/, copied from the vendors' official
 * icon packs by scripts/copy-vendor-icons.ts. They belong to their vendors
 * and aren't covered by 0n1's licence: see public/vendor-icons/NOTICE.md.
 */

export type Vendor = "aws" | "azure" | "gcp";

export const VENDORS: readonly { id: Vendor; label: string }[] = [
  { id: "aws", label: "AWS" },
  { id: "azure", label: "Azure" },
  { id: "gcp", label: "Google Cloud" },
];

export type VendorIcon = {
  /** Stored on the component, e.g. "aws/rds". Never rename one. */
  id: string;
  vendor: Vendor;
  /** The product's name, e.g. "Amazon RDS". */
  label: string;
  /** Some icons are drawn for light or dark backgrounds: the dark one, if so. */
  dark?: true;
};

const icon = (id: `${Vendor}/${string}`, label: string, dark?: true): VendorIcon => ({
  id,
  vendor: id.split("/")[0] as Vendor,
  label,
  ...(dark ? { dark } : {}),
});

const ICONS = {
  // AWS
  awsUsers: icon("aws/users", "Users", true),
  awsClient: icon("aws/client", "Client", true),
  awsMobile: icon("aws/mobile-client", "Mobile client", true),
  awsElb: icon("aws/elastic-load-balancing", "Elastic Load Balancing"),
  awsApiGateway: icon("aws/api-gateway", "Amazon API Gateway"),
  awsCloudFront: icon("aws/cloudfront", "Amazon CloudFront"),
  awsRoute53: icon("aws/route-53", "Amazon Route 53"),
  awsWaf: icon("aws/waf", "AWS WAF"),
  awsAppMesh: icon("aws/app-mesh", "AWS App Mesh"),
  awsEc2: icon("aws/ec2", "Amazon EC2"),
  awsEcs: icon("aws/ecs", "Amazon ECS"),
  awsEks: icon("aws/eks", "Amazon EKS"),
  awsFargate: icon("aws/fargate", "AWS Fargate"),
  awsLambda: icon("aws/lambda", "AWS Lambda"),
  awsAppRunner: icon("aws/app-runner", "AWS App Runner"),
  awsBatch: icon("aws/batch", "AWS Batch"),
  awsRds: icon("aws/rds", "Amazon RDS"),
  awsAurora: icon("aws/aurora", "Amazon Aurora"),
  awsDynamoDb: icon("aws/dynamodb", "Amazon DynamoDB"),
  awsElastiCache: icon("aws/elasticache", "Amazon ElastiCache"),
  awsMemoryDb: icon("aws/memorydb", "Amazon MemoryDB"),
  awsOpenSearch: icon("aws/opensearch", "Amazon OpenSearch Service"),
  awsS3: icon("aws/s3", "Amazon S3"),
  awsSqs: icon("aws/sqs", "Amazon SQS"),
  awsMq: icon("aws/mq", "Amazon MQ"),
  awsSns: icon("aws/sns", "Amazon SNS"),
  awsEventBridge: icon("aws/eventbridge", "Amazon EventBridge"),
  awsKinesis: icon("aws/kinesis-data-streams", "Amazon Kinesis Data Streams"),
  // Azure
  azureUsers: icon("azure/users", "Users"),
  azureLoadBalancer: icon("azure/load-balancer", "Azure Load Balancer"),
  azureAppGateway: icon("azure/application-gateway", "Azure Application Gateway"),
  azureApiManagement: icon("azure/api-management", "Azure API Management"),
  azureFrontDoor: icon("azure/front-door", "Azure Front Door and CDN"),
  azureDns: icon("azure/dns", "Azure DNS"),
  azureWaf: icon("azure/waf", "Azure Web Application Firewall"),
  azureVm: icon("azure/virtual-machine", "Azure Virtual Machines"),
  azureAppService: icon("azure/app-service", "Azure App Service"),
  azureContainerInstances: icon("azure/container-instances", "Azure Container Instances"),
  azureAks: icon("azure/kubernetes-service", "Azure Kubernetes Service"),
  azureFunctions: icon("azure/functions", "Azure Functions"),
  azureBatch: icon("azure/batch", "Azure Batch"),
  azureSqlDatabase: icon("azure/sql-database", "Azure SQL Database"),
  azurePostgres: icon("azure/postgresql", "Azure Database for PostgreSQL"),
  azureMySql: icon("azure/mysql", "Azure Database for MySQL"),
  azureCosmosDb: icon("azure/cosmos-db", "Azure Cosmos DB"),
  azureElasticPools: icon("azure/sql-elastic-pools", "Azure SQL Elastic Pools"),
  azureRedis: icon("azure/cache-for-redis", "Azure Cache for Redis"),
  azureSearch: icon("azure/ai-search", "Azure AI Search"),
  azureStorage: icon("azure/storage-account", "Azure Storage"),
  azureBlob: icon("azure/blob-storage", "Azure Blob Storage"),
  azureServiceBus: icon("azure/service-bus", "Azure Service Bus"),
  azureStorageQueue: icon("azure/storage-queue", "Azure Queue Storage"),
  azureEventGrid: icon("azure/event-grid", "Azure Event Grid"),
  azureEventHubs: icon("azure/event-hubs", "Azure Event Hubs"),
  // Google Cloud: its pack has one icon per category of product.
  gcpWebMobile: icon("gcp/web-mobile", "Web & Mobile"),
  gcpNetworking: icon("gcp/networking", "Networking"),
  gcpSecurity: icon("gcp/security-identity", "Security & Identity"),
  gcpCompute: icon("gcp/compute", "Compute"),
  gcpContainers: icon("gcp/containers", "Containers"),
  gcpServerless: icon("gcp/serverless-computing", "Serverless Computing"),
  gcpDatabases: icon("gcp/databases", "Databases"),
  gcpDataAnalytics: icon("gcp/data-analytics", "Data Analytics"),
  gcpStorage: icon("gcp/storage", "Storage"),
  gcpIntegration: icon("gcp/integration-services", "Integration Services"),
} as const;

const i = ICONS;

/** The icons each kind of component can wear, by component type, in picker order. */
export const ICONS_FOR_TYPE: Readonly<Record<string, readonly VendorIcon[]>> = {
  client: [i.awsUsers, i.awsClient, i.awsMobile, i.azureUsers, i.gcpWebMobile],
  "load-balancer": [i.awsElb, i.azureLoadBalancer, i.azureAppGateway, i.gcpNetworking],
  "api-gateway": [i.awsApiGateway, i.azureApiManagement, i.gcpNetworking],
  cdn: [i.awsCloudFront, i.azureFrontDoor, i.gcpNetworking],
  dns: [i.awsRoute53, i.azureDns, i.gcpNetworking],
  "rate-limiter": [i.awsWaf, i.awsApiGateway, i.azureWaf, i.azureApiManagement, i.gcpSecurity],
  "circuit-breaker": [i.awsAppMesh, i.azureApiManagement, i.gcpNetworking],
  service: [
    i.awsEc2,
    i.awsEcs,
    i.awsEks,
    i.awsFargate,
    i.awsLambda,
    i.awsAppRunner,
    i.azureVm,
    i.azureAppService,
    i.azureContainerInstances,
    i.azureAks,
    i.azureFunctions,
    i.gcpCompute,
    i.gcpContainers,
    i.gcpServerless,
  ],
  worker: [
    i.awsLambda,
    i.awsBatch,
    i.awsEcs,
    i.awsFargate,
    i.awsEc2,
    i.azureFunctions,
    i.azureBatch,
    i.azureContainerInstances,
    i.gcpServerless,
    i.gcpCompute,
    i.gcpContainers,
  ],
  database: [
    i.awsRds,
    i.awsAurora,
    i.awsDynamoDb,
    i.azureSqlDatabase,
    i.azurePostgres,
    i.azureMySql,
    i.azureCosmosDb,
    i.gcpDatabases,
  ],
  "sharded-database": [
    i.awsDynamoDb,
    i.awsAurora,
    i.azureCosmosDb,
    i.azureElasticPools,
    i.gcpDatabases,
  ],
  "read-replica": [i.awsRds, i.awsAurora, i.azureSqlDatabase, i.azurePostgres, i.gcpDatabases],
  cache: [i.awsElastiCache, i.awsMemoryDb, i.azureRedis, i.gcpDatabases],
  "search-index": [i.awsOpenSearch, i.azureSearch, i.gcpDataAnalytics],
  "object-storage": [i.awsS3, i.azureStorage, i.azureBlob, i.gcpStorage],
  queue: [i.awsSqs, i.awsMq, i.azureServiceBus, i.azureStorageQueue, i.gcpIntegration],
  pubsub: [
    i.awsSns,
    i.awsEventBridge,
    i.awsKinesis,
    i.azureEventGrid,
    i.azureEventHubs,
    i.azureServiceBus,
    i.gcpIntegration,
  ],
};

/** Every vendor icon, once each. */
export const VENDOR_ICONS: readonly VendorIcon[] = Object.values(ICONS);

const byId = new Map(VENDOR_ICONS.map((v) => [v.id, v]));

/** A stored icon id's icon, if it still exists. */
export function findVendorIcon(id: string | undefined): VendorIcon | undefined {
  return id === undefined ? undefined : byId.get(id);
}

/** An icon's full name, saying whose it is: "Amazon RDS", "AWS Users", "Google Cloud Compute". */
export function vendorIconLabel(icon: VendorIcon): string {
  const vendor = VENDORS.find((v) => v.id === icon.vendor)?.label ?? "";
  return /^(Amazon|AWS|Azure|Google)\b/.test(icon.label) ? icon.label : `${vendor} ${icon.label}`;
}

/** Where an icon's file is, for the theme it's shown in. */
export function vendorIconUrl(icon: VendorIcon, theme: "light" | "dark"): string {
  return `/vendor-icons/${icon.id}${icon.dark && theme === "dark" ? "-dark" : ""}.svg`;
}
