import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    imageId: v.id("images"),
    type: v.union(v.literal("bbox"), v.literal("polygon")),
    color: v.string(),
    label: v.optional(v.string()),
    data: v.string(),
  },
  handler: async (ctx, args) => {
    const annotationId = await ctx.db.insert("annotations", {
      imageId: args.imageId,
      type: args.type,
      color: args.color,
      label: args.label,
      data: args.data,
    });
    return annotationId;
  },
});

export const update = mutation({
  args: {
    annotationId: v.id("annotations"),
    data: v.string(),
    color: v.optional(v.string()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: any = { data: args.data };
    if (args.color) updates.color = args.color;
    if (args.label !== undefined) updates.label = args.label;
    
    await ctx.db.patch(args.annotationId, updates);
  },
});

export const deleteAnnotation = mutation({
  args: {
    annotationId: v.id("annotations"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.annotationId);
  },
});

export const listByImage = query({
  args: {
    imageId: v.id("images"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("annotations")
      .withIndex("by_image", (q) => q.eq("imageId", args.imageId))
      .collect();
  },
});
