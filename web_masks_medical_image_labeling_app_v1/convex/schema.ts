import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  folders: defineTable({
    name: v.string(),
    createdAt: v.number(),
  }),
  
  images: defineTable({
    folderId: v.id("folders"),
    storageId: v.id("_storage"),
    filename: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  }).index("by_folder", ["folderId"]),
  
  annotations: defineTable({
    imageId: v.id("images"),
    type: v.union(v.literal("bbox"), v.literal("polygon")),
    color: v.string(),
    label: v.optional(v.string()),
    // For bounding box: {x, y, width, height}
    // For polygon: {points: [{x, y}, ...]}
    data: v.string(), // JSON stringified
  }).index("by_image", ["imageId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
