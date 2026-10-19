/*
 * Copies the vendor icons 0n1 uses (src/vendor-icons/catalog.ts) from the
 * vendors' official packs into public/vendor-icons/. The packs are big and
 * stay out of the repo: put them in vendor-icon-packs/ (git-ignored), then
 *   bun scripts/copy-vendor-icons.ts
 *
 * Packs: AWS Architecture Icons, Azure Architecture Icons, and Google
 * Cloud's category icons. Files are copied unchanged (Microsoft's terms
 * don't allow editing theirs).
 */
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { VENDOR_ICONS } from "../src/vendor-icons/catalog.ts";

const ROOT = join(import.meta.dir, "..");
const PACKS = join(ROOT, "vendor-icon-packs");
const OUT = join(ROOT, "public", "vendor-icons");

const awsService = (category: string, name: string) =>
  `aws/Architecture-Service-Icons_07312026/Arch_${category}/48/Arch_${name}_48.svg`;
const awsGeneral = (name: string, theme: "Light" | "Dark") =>
  `aws/Resource-Icons_07312026/Res_General-Icons/Res_48_${theme}/Res_${name}_48_${theme}.svg`;
const azure = (path: string) => `azure/Icons/${path}`;
const gcp = (category: string, file: string) => `google-category/${category}/SVG/${file}`;

/** Each icon id's file in the packs; a pair for icons drawn for light and dark backgrounds. */
const SOURCES: Record<string, string | { light: string; dark: string }> = {
  "aws/users": { light: awsGeneral("Users", "Light"), dark: awsGeneral("Users", "Dark") },
  "aws/client": { light: awsGeneral("Client", "Light"), dark: awsGeneral("Client", "Dark") },
  "aws/mobile-client": {
    light: awsGeneral("Mobile-client", "Light"),
    dark: awsGeneral("Mobile-client", "Dark"),
  },
  "aws/elastic-load-balancing": awsService("Networking-Content-Delivery", "Elastic-Load-Balancing"),
  "aws/api-gateway": awsService("Networking-Content-Delivery", "Amazon-API-Gateway"),
  "aws/cloudfront": awsService("Networking-Content-Delivery", "Amazon-CloudFront"),
  "aws/route-53": awsService("Networking-Content-Delivery", "Amazon-Route-53"),
  "aws/waf": awsService("Security-Identity", "AWS-WAF"),
  "aws/app-mesh": awsService("Networking-Content-Delivery", "AWS-App-Mesh"),
  "aws/ec2": awsService("Compute", "Amazon-EC2"),
  "aws/ecs": awsService("Containers", "Amazon-Elastic-Container-Service"),
  "aws/eks": awsService("Containers", "Amazon-Elastic-Kubernetes-Service"),
  "aws/fargate": awsService("Containers", "AWS-Fargate"),
  "aws/lambda": awsService("Compute", "AWS-Lambda"),
  "aws/app-runner": awsService("Compute", "AWS-App-Runner"),
  "aws/batch": awsService("Compute", "AWS-Batch"),
  "aws/rds": awsService("Databases", "Amazon-RDS"),
  "aws/aurora": awsService("Databases", "Amazon-Aurora"),
  "aws/dynamodb": awsService("Databases", "Amazon-DynamoDB"),
  "aws/elasticache": awsService("Databases", "Amazon-ElastiCache"),
  "aws/memorydb": awsService("Databases", "Amazon-MemoryDB"),
  "aws/opensearch": awsService("Analytics", "Amazon-OpenSearch-Service"),
  "aws/s3": awsService("Storage", "Amazon-Simple-Storage-Service"),
  "aws/sqs": awsService("Application-Integration", "Amazon-Simple-Queue-Service"),
  "aws/mq": awsService("Application-Integration", "Amazon-MQ"),
  "aws/sns": awsService("Application-Integration", "Amazon-Simple-Notification-Service"),
  "aws/eventbridge": awsService("Application-Integration", "Amazon-EventBridge"),
  "aws/kinesis-data-streams": awsService("Analytics", "Amazon-Kinesis-Data-Streams"),

  "azure/users": azure("identity/10230-icon-service-Users.svg"),
  "azure/load-balancer": azure("networking/10062-icon-service-Load-Balancers.svg"),
  "azure/application-gateway": azure("networking/10076-icon-service-Application-Gateways.svg"),
  "azure/api-management": azure("devops/10042-icon-service-API-Management-Services.svg"),
  "azure/front-door": azure("networking/10073-icon-service-Front-Door-and-CDN-Profiles.svg"),
  "azure/dns": azure("networking/10064-icon-service-DNS-Zones.svg"),
  "azure/waf": azure("networking/10362-icon-service-Web-Application-Firewall-Policies(WAF).svg"),
  "azure/virtual-machine": azure("compute/10021-icon-service-Virtual-Machine.svg"),
  "azure/app-service": azure("compute/10035-icon-service-App-Services.svg"),
  "azure/container-instances": azure("compute/10104-icon-service-Container-Instances.svg"),
  "azure/kubernetes-service": azure("compute/10023-icon-service-Kubernetes-Services.svg"),
  "azure/functions": azure("compute/10029-icon-service-Function-Apps.svg"),
  "azure/batch": azure("compute/10031-icon-service-Batch-Accounts.svg"),
  "azure/sql-database": azure("databases/10130-icon-service-SQL-Database.svg"),
  "azure/postgresql": azure("databases/10131-icon-service-Azure-Database-PostgreSQL-Server.svg"),
  "azure/mysql": azure("databases/10122-icon-service-Azure-Database-MySQL-Server.svg"),
  "azure/cosmos-db": azure("databases/10121-icon-service-Azure-Cosmos-DB.svg"),
  "azure/sql-elastic-pools": azure("databases/10134-icon-service-SQL-Elastic-Pools.svg"),
  "azure/cache-for-redis": azure("databases/10137-icon-service-Cache-Redis.svg"),
  "azure/ai-search": azure("app services/10044-icon-service-Cognitive-Search.svg"),
  "azure/storage-account": azure("storage/10086-icon-service-Storage-Accounts.svg"),
  "azure/blob-storage": azure("general/10780-icon-service-Blob-Block.svg"),
  "azure/service-bus": azure("integration/10836-icon-service-Azure-Service-Bus.svg"),
  "azure/storage-queue": azure("general/10840-icon-service-Storage-Queue.svg"),
  "azure/event-grid": azure("integration/10206-icon-service-Event-Grid-Topics.svg"),
  "azure/event-hubs": azure("analytics/00039-icon-service-Event-Hubs.svg"),

  "gcp/web-mobile": gcp("Web & Mobile", "WebMobile-512-color.svg"),
  "gcp/networking": gcp("Networking", "Networking-512-color-rgb.svg"),
  "gcp/security-identity": gcp("Security Identity", "SecurityIdentity-512-color.svg"),
  "gcp/compute": gcp("Compute", "Compute-512-color.svg"),
  "gcp/containers": gcp("Containers", "Containers-512-color.svg"),
  "gcp/serverless-computing": gcp("Serverless Computing", "ServerlessComputing-512-color.svg"),
  "gcp/databases": gcp("Databases", "Databases-512-color.svg"),
  "gcp/data-analytics": gcp("Data Analytics", "DataAnalytics-512-color.svg"),
  "gcp/storage": gcp("Storage", "Storage-512-color.svg"),
  "gcp/integration-services": gcp("Integration Services", "IntegrationServices-512-color.svg"),
};

const missing = VENDOR_ICONS.filter((icon) => !(icon.id in SOURCES)).map((icon) => icon.id);
const unused = Object.keys(SOURCES).filter((id) => !VENDOR_ICONS.some((icon) => icon.id === id));
if (missing.length + unused.length > 0) {
  throw new Error(`Sources and catalog differ. Missing: ${missing}. Unused: ${unused}.`);
}

await rm(OUT, { recursive: true, force: true });
let copied = 0;
for (const icon of VENDOR_ICONS) {
  const source = SOURCES[icon.id] as string | { light: string; dark: string };
  const files =
    typeof source === "string"
      ? [[source, `${icon.id}.svg`]]
      : [
          [source.light, `${icon.id}.svg`],
          [source.dark, `${icon.id}-dark.svg`],
        ];
  if (typeof source !== "string" && !icon.dark) {
    throw new Error(`${icon.id} has a dark version, so mark it dark in the catalog.`);
  }
  for (const [from, to] of files) {
    const target = join(OUT, to as string);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(PACKS, from as string), target);
    copied++;
  }
}
console.log(`Copied ${copied} icons into public/vendor-icons/.`);
