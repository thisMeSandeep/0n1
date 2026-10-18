import type { ComponentDefinition } from "../../model/component.ts";
import { concurrencyParam, errorRateParam } from "../shared.ts";

export const objectStorage: ComponentDefinition = {
  type: "object-storage",
  category: "data",
  displayName: "Object storage",
  description:
    "Stores files (images, videos, backups) cheaply, at almost any scale, but not quickly.",
  modelNote:
    "Each request waits for the first byte, then for the file to transfer at the bandwidth you set, so big files take longer. " +
    "It can serve a very large number of requests at once, but only so many per second: above the request limit it answers “slow down” (rejected). " +
    "Use it from services and workers, or as the origin behind a CDN. Storage classes, multipart uploads and consistency details are not modelled.",
  icon: "archive",
  keywords: ["files", "blob", "bucket", "s3", "storage", "images", "uploads"],
  params: {
    firstByte: {
      kind: "number",
      label: "Time to first byte",
      section: "behaviour",
      help: "How long before a file starts to arrive.",
      default: 40,
      min: 1,
      max: 10_000,
      scale: "log",
      unit: "ms",
    },
    objectSize: {
      kind: "number",
      label: "File size",
      section: "behaviour",
      default: 256,
      min: 1,
      max: 10_000_000,
      scale: "log",
      unit: "KB",
    },
    bandwidth: {
      kind: "number",
      label: "Bandwidth",
      section: "behaviour",
      help: "How fast one file transfers.",
      default: 50,
      min: 0.1,
      max: 10_000,
      scale: "log",
      unit: "MB/s",
    },
    concurrency: concurrencyParam("Requests at once", 1024),
    requestLimit: {
      kind: "number",
      label: "Request limit",
      section: "capacity",
      help: "Requests per second it accepts before telling callers to slow down.",
      default: 5500,
      min: 1,
      max: 1_000_000,
      step: 1,
      scale: "log",
      unit: "/s",
    },
    errorRate: errorRateParam,
  },
  connections: { incoming: true, outgoing: [] },
};
