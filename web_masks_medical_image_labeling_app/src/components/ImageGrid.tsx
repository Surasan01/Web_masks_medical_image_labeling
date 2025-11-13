import { useRef, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import type { DatasetItem, UploadProgress } from "../lib/types";

interface ImageGridProps {
  items: DatasetItem[];
  isLoading: boolean;
  onSelectItem: (itemId: string) => void;
  onUploadImages?: (files: File[]) => void;
  uploading?: boolean;
  uploadProgress?: UploadProgress | null;
}

export function ImageGrid({ items, isLoading, onSelectItem, onUploadImages, uploading = false, uploadProgress = null }: ImageGridProps) {
  const { t } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPercentage = uploadProgress && uploadProgress.total > 0
    ? Math.round((uploadProgress.completed / uploadProgress.total) * 100)
    : 0;

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!onUploadImages) return;
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    onUploadImages(files);
    event.target.value = "";
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onUploadImages || uploading) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onUploadImages || uploading) return;
    event.preventDefault();
    if (event.target === event.currentTarget) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!onUploadImages || uploading) return;
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      alert(t("noImageFiles"));
      return;
    }
    onUploadImages(files);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t("images")}</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Select an image to start annotating</p>
      </div>

      {onUploadImages && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-2xl border-2 border-dashed p-6 transition-colors ${
            isDragging
              ? "border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-900/10"
              : "border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
          } ${uploading ? "opacity-60" : ""}`}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {uploading ? t("uploadingImages") : t("addImages")}
              </p>
              {!uploading && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("dropImagesHint")} <button type="button" onClick={handleBrowseClick} className="text-blue-600 dark:text-blue-400 font-semibold underline">
                    {t("browseFiles")}
                  </button>
                </p>
              )}
            </div>
            {uploading && uploadProgress && (
              <div className="w-full max-w-sm space-y-1">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 dark:bg-blue-400 h-full transition-all"
                    style={{ width: `${uploadPercentage}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {uploadProgress.completed}/{uploadProgress.total}
                  {uploadProgress.filename ? ` · ${uploadProgress.filename}` : ""}
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
              disabled={uploading}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectItem(item.id)}
            className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl dark:hover:shadow-2xl transition-all cursor-pointer transform hover:scale-105 hover:border-blue-300 dark:hover:border-blue-600"
          >
            <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 relative overflow-hidden">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.filename}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
              )}
              {item.annotationCount > 0 && (
                <div className="absolute top-3 right-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs px-3 py-1.5 rounded-full font-bold shadow-lg">
                  {item.annotationCount}
                </div>
              )}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 bg-white dark:bg-gray-800 rounded-full p-3 shadow-lg transform scale-75 group-hover:scale-100 transition-all">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-900 dark:text-white truncate font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {item.filename}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Ready to annotate</span>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!isLoading && items.length === 0 && (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No images found</h3>
          <p className="text-gray-500 dark:text-gray-400">{t("noImages")}</p>
        </div>
      )}
    </div>
  );
}
