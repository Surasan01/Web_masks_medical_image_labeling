import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveImage = mutation({
  args: {
    folderId: v.id("folders"),
    storageId: v.id("_storage"),
    filename: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const imageId = await ctx.db.insert("images", {
      folderId: args.folderId,
      storageId: args.storageId,
      filename: args.filename,
      width: args.width,
      height: args.height,
    });
    return imageId;
  },
});

export const listByFolder = query({
  args: {
    folderId: v.id("folders"),
  },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("images")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    
    const imagesWithUrls = await Promise.all(
      images.map(async (image) => {
        const url = await ctx.storage.getUrl(image.storageId);
        const annotations = await ctx.db
          .query("annotations")
          .withIndex("by_image", (q) => q.eq("imageId", image._id))
          .collect();
        
        return {
          ...image,
          url,
          annotationCount: annotations.length,
        };
      })
    );
    
    return imagesWithUrls;
  },
});

export const getImage = query({
  args: {
    imageId: v.id("images"),
  },
  handler: async (ctx, args) => {
    const image = await ctx.db.get(args.imageId);
    if (!image) return null;
    
    const url = await ctx.storage.getUrl(image.storageId);
    const annotations = await ctx.db
      .query("annotations")
      .withIndex("by_image", (q) => q.eq("imageId", args.imageId))
      .collect();
    
    return {
      ...image,
      url,
      annotations,
    };
  },
});
