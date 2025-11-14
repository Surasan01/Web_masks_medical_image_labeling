import { useMemo, useState } from "react";
import { FolderUpload } from "./FolderUpload";
import { useLanguage } from "../contexts/LanguageContext";
import type { DatasetSummary, ProjectSummary, UploadProgress } from "../lib/types";

interface FolderListProps {
  projects: ProjectSummary[];
  selectedProject: string | null;
  onSelectProject: (name: string | null) => void;
  onCreateProject: () => void | Promise<void>;
  onDeleteProject: (name: string) => void | Promise<void>;
  projectsLoading: boolean;
  datasets: DatasetSummary[];
  isLoading: boolean;
  onSelectDataset: (name: string) => void;
  onCreateDataset: (
    name: string,
    files: File[],
    onProgress: (progress: UploadProgress) => void,
  ) => Promise<void> | void;
  onDeleteDataset: (name: string) => void;
}

export function FolderList({
  projects,
  selectedProject,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  projectsLoading,
  datasets,
  isLoading,
  onSelectDataset,
  onCreateDataset,
  onDeleteDataset,
}: FolderListProps) {
  const [showUpload, setShowUpload] = useState(false);
  const { t } = useLanguage();

  const sortedDatasets = useMemo(
    () => [...datasets].sort((a, b) => a.name.localeCompare(b.name)),
    [datasets],
  );

  const handleCreateProjectClick = () => {
    void onCreateProject();
  };

  const handleDeleteProjectClick = () => {
    if (!selectedProject) return;
    void onDeleteProject(selectedProject);
  };

  const handleUploadClick = () => {
    if (!selectedProject) return;
    setShowUpload(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t("projects")}</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t("projectsDescription")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCreateProjectClick}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 font-medium transition-all shadow-lg hover:shadow-xl disabled:opacity-60"
            disabled={projectsLoading}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t("createProject")}
          </button>
          {selectedProject && (
            <button
              onClick={handleDeleteProjectClick}
              disabled={projectsLoading}
              className="px-4 py-2 border border-red-300 text-red-500 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition-colors disabled:opacity-60"
            >
              {t("deleteProject")}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("activeProject")}</label>
        <div className="flex items-center gap-3">
          <select
            value={selectedProject ?? ""}
            onChange={(event) => onSelectProject(event.target.value || null)}
            disabled={projectsLoading || projects.length === 0}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-60"
          >
            <option value="" disabled>
              {projectsLoading ? t("loading") : t("selectProject")}
            </option>
            {projects.map((project) => (
              <option key={project.name} value={project.name}>
                {project.name} ({project.datasetCount})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{t("folders")}</h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t("foldersDescription")}</p>
        </div>
        <button
          onClick={handleUploadClick}
          disabled={!selectedProject}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 font-medium transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("uploadFolder")}
        </button>
      </div>

      {showUpload && selectedProject && (
        <FolderUpload
          projectName={selectedProject}
          onClose={() => setShowUpload(false)}
          onSubmit={async (name, files, onProgress) => {
            await onCreateDataset(name, files, onProgress);
            setShowUpload(false);
          }}
        />
      )}

      {selectedProject ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedDatasets.map((dataset) => (
              <div
                key={dataset.name}
                className="group bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-xl dark:hover:shadow-2xl transition-all cursor-pointer transform hover:scale-105 hover:border-blue-300 dark:hover:border-blue-600"
                onClick={() => onSelectDataset(dataset.name)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {dataset.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {dataset.imageCount} {t("imageCount")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteDataset(dataset.name);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                  <span>{dataset.createdAt ? new Date(dataset.createdAt).toLocaleDateString() : ""}</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>{t("activeStatus")}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!isLoading && sortedDatasets.length === 0 && (
            <div className="text-center py-16">
              <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t("noFoldersTitle")}</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">{t("noFolders")}</p>
              <button
                onClick={() => setShowUpload(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 font-medium transition-all shadow-lg hover:shadow-xl"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t("uploadFolder")}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
          {projects.length === 0 ? t("createProjectFirst") : t("selectProjectFirst")}
        </div>
      )}
    </div>
  );
}
