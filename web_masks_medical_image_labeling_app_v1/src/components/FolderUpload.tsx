import { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { UploadProgress } from "../lib/types";

interface FolderUploadProps {
  projectName: string;
  onClose: () => void;
  onSubmit: (
    name: string,
    files: File[],
    onProgress: (progress: UploadProgress) => void,
  ) => Promise<void>;
}

export function FolderUpload({ projectName, onClose, onSubmit }: FolderUploadProps) {
  const [folderName, setFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string>("");
  const { t } = useLanguage();

  const handleCreateEmpty = async () => {
    const name = folderName.trim() || `dataset-${new Date().toISOString().split("T")[0]}`;
    setUploading(true);
    setProgress(0);
    setCurrentFile("");
    try {
      await onSubmit(name, [], () => {});
      onClose();
    } catch (error) {
      console.error("Create empty folder failed:", error);
      alert(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const imageFiles = files.filter((f) =>
      f.type.startsWith("image/")
    );

    if (imageFiles.length === 0) {
      alert(t("noImageFiles"));
      return;
    }

    setUploading(true);
    setProgress(0);
    setCurrentFile("");

    try {
      const name = folderName.trim() || `dataset-${new Date().toISOString().split("T")[0]}`;
      await onSubmit(name, imageFiles, ({ completed, total, filename }) => {
        setProgress((completed / total) * 100);
        setCurrentFile(filename);
      });
      onClose();
    } catch (error) {
      console.error("Upload failed:", error);
      alert(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">{t("folderUpload")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t("projectLabel")}: <span className="font-semibold text-gray-900 dark:text-white">{projectName}</span>
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("folderName")}
            </label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder={t("folderNamePlaceholder")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={uploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("selectImages")}
            </label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              disabled={uploading}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {uploading && (
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 text-center">
                {t("uploading")} {Math.round(progress)}%
                {currentFile ? ` · ${currentFile}` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleCreateEmpty}
            disabled={uploading}
            className="flex-1 px-4 py-2 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 font-medium transition-colors disabled:opacity-50"
          >
            {t("createEmptyFolder")}
          </button>
          <button
            onClick={onClose}
            disabled={uploading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
