/*
 * Every price 0n1's cost estimate uses (S44), in US dollars. They're typical
 * list prices of the big cloud providers in 2026, on-demand, in a US
 * region, rounded, with no free tiers, discounts or reserved capacity. Real
 * bills differ by provider, region and contract, so the estimate is a sense
 * of scale, not a quote.
 */

/** Hours in a month, as cloud bills count them. */
export const HOURS_PER_MONTH = 730;
export const SECONDS_PER_MONTH = HOURS_PER_MONTH * 3600;

export const PRICES = {
  /**
   * A general-purpose virtual machine: about $0.048 per vCPU-hour, with
   * 4 GB of memory per vCPU. Services and workers run on these.
   */
  computeVcpuMonth: 35,
  /**
   * A managed relational database: about $0.096 per vCPU-hour, roughly
   * twice a plain VM for the management, backups and failover.
   */
  databaseVcpuMonth: 70,
  /** Managed database storage (SSD), per GB-month. */
  databaseStorageGbMonth: 0.12,
  /** Managed databases start at this much storage. */
  databaseMinStorageGb: 20,
  /** A managed search cluster: about $0.12 per vCPU-hour, memory-heavy machines. */
  searchVcpuMonth: 90,
  /** A managed in-memory cache: about $0.023 per GB-hour of memory. */
  cacheGbMonth: 17,
  /** A managed load balancer: about $0.0225 an hour… */
  loadBalancerMonth: 16,
  /** …plus about $0.008 per GB it processes (a simplified capacity-unit charge). */
  loadBalancerPerGb: 0.008,
  /** A managed API gateway, HTTP APIs tier: per million requests. */
  gatewayPerMillion: 1,
  /** A CDN: per GB delivered to users (first pricing tier)… */
  cdnPerGb: 0.085,
  /** …and per million HTTPS requests. */
  cdnPerMillion: 1,
  /** A managed web application firewall's rate-limiting rule: per month… */
  rateLimitRuleMonth: 5,
  /** …plus per million requests it inspects. */
  rateLimitPerMillion: 0.6,
  /** Object storage, standard class: per GB-month stored. */
  objectStorageGbMonth: 0.023,
  /** Object storage reads (GET): per million. */
  objectGetPerMillion: 0.4,
  /** Object storage writes (PUT): per million. */
  objectPutPerMillion: 5,
  /** Data sent out to the internet, per GB (first pricing tier). Sending to a CDN is usually free. */
  egressPerGb: 0.09,
  /**
   * A managed queue: $0.40 per million API calls. Each job takes about three:
   * send, receive and delete.
   */
  queuePerMillionJobs: 1.2,
  /** Managed pub/sub: per million messages published… */
  pubsubPublishPerMillion: 0.5,
  /** …and per million delivered to subscribers. */
  pubsubDeliverPerMillion: 0.5,
  /** Managed DNS: a hosted zone, per month… */
  dnsZoneMonth: 0.5,
  /** …and per million lookups it answers. */
  dnsPerMillion: 0.4,
} as const;

/*
 * Sizes: how a component's settings translate into what you'd rent. Machines
 * come in sizes that double (1, 2, 4, 8… vCPUs), so a size is rounded up.
 */
export const SIZING = {
  /**
   * Requests at once one vCPU of a service handles: web requests mostly
   * wait on I/O, so a vCPU juggles many.
   */
  serviceRequestsPerVcpu: 32,
  /** Jobs at once one vCPU of a worker handles: background jobs do more work each. */
  workerJobsPerVcpu: 2,
  /** Database connections per vCPU. */
  connectionsPerVcpu: 25,
  /** Search connections per vCPU. */
  searchConnectionsPerVcpu: 16,
  /** One item in a cache or row in a database, with its overhead (KB). */
  itemKb: 1,
  /** A typical API response (KB). */
  responseKb: 10,
} as const;
