import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const folderId = await ctx.db.insert("folders", {
      name: args.name,
      createdAt: Date.now(),
    });
    return folderId;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const folders = await ctx.db.query("folders").order("desc").collect();
    
    const foldersWithCounts = await Promise.all(
      folders.map(async (folder) => {
        const images = await ctx.db
          .query("images")
          .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
          .collect();
        
        return {
          ...folder,
          imageCount: images.length,
        };
      })
    );
    
    return foldersWithCounts;
  },
});

export const deleteFolder = mutation({
  args: {
    folderId: v.id("folders"),
  },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("images")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    
    for (const image of images) {
      const annotations = await ctx.db
        .query("annotations")
        .withIndex("by_image", (q) => q.eq("imageId", image._id))
        .collect();
      
      for (const annotation of annotations) {
        await ctx.db.delete(annotation._id);
      }
      
      await ctx.storage.delete(image.storageId);
      await ctx.db.delete(image._id);
    }
    
    await ctx.db.delete(args.folderId);
  },
});
