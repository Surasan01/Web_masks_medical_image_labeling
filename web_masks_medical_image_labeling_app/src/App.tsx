import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderList } from "./components/FolderList";
import { ImageGrid } from "./components/ImageGrid";
import { AnnotationCanvas } from "./components/AnnotationCanvas";
import { ApiConfig } from "./components/ApiConfig";
import { ApiSetup } from "./components/ApiSetup";
import { LanguageToggle } from "./components/LanguageToggle";
import { ThemeToggle } from "./components/ThemeToggle";
import { Logo } from "./components/Logo";
import { useLanguage, LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import {
  fetchProjects,
  createProject,
  deleteProject as deleteProjectApi,
  createDataset,
  deleteDataset as deleteDatasetApi,
  deleteItem as deleteItemApi,
  downloadDatasetZip,
  downloadItemZip,
  fetchDatasets,
  fetchDatasetItems,
  fetchItemDetail,
  saveAnnotations as saveAnnotationsApi,
  uploadImages,
} from "./lib/api";
import type {
  AnnotationShape,
  DatasetItem,
  DatasetItemDetail,
  DatasetSummary,
  ProjectSummary,
  UploadProgress,
} from "./lib/types";

const API_STORAGE_KEY = "maskStudioApiUrl";

const ENV_API_URL = (() => {
  try {
    const value = import.meta.env.VITE_API_URL;
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
})();

function normalizeUrl(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\/+$/u, "");
}

function getStoredApiUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(API_STORAGE_KEY) ?? "";
}

function persistApiUrl(value: string) {
  if (typeof window === "undefined") {
    return;
  }
  if (value) {
    window.localStorage.setItem(API_STORAGE_KEY, value);
  } else {
    window.localStorage.removeItem(API_STORAGE_KEY);
  }
}

type ApiStatus = "checking" | "online" | "offline";

function buildApiCandidatesFromWindow(): string[] {
  if (typeof window === "undefined") {
    return ["http://127.0.0.1:8000"];
  }

  const { protocol, hostname, port } = window.location;
  const protocols = new Set<string>([
    protocol || "http:",
    "https:",
    "http:",
  ]);

  const sanitizedHostname = hostname.replace(/\/+$/u, "");
  const hostVariants = new Set<string>();

  if (sanitizedHostname) {
    hostVariants.add(sanitizedHostname);
    hostVariants.add(`${sanitizedHostname}:8000`);
    hostVariants.add(`8000-${sanitizedHostname}`);
  }

  if (port) {
    hostVariants.add(`${sanitizedHostname}:${port}`);
    hostVariants.add(`${sanitizedHostname}:8000`);
    hostVariants.add(`8000-${sanitizedHostname}`);
  }

  const hyphenParts = sanitizedHostname.split("-");
  if (hyphenParts.length > 1 && /^\d+$/u.test(hyphenParts[0])) {
    const rest = hyphenParts.slice(1).join("-");
    if (rest) {
      hostVariants.add(rest);
      hostVariants.add(`8000-${rest}`);
      hostVariants.add(`${rest}:8000`);
    }
  }

  const dotParts = sanitizedHostname.split(".");
  if (dotParts.length > 1 && /^\d+$/u.test(dotParts[0])) {
    const rest = dotParts.slice(1).join(".");
    if (rest) {
      hostVariants.add(rest);
      hostVariants.add(`8000-${rest}`);
      hostVariants.add(`${rest}:8000`);
    }
  }

  const candidates = new Set<string>();

  hostVariants.forEach((variant) => {
    const normalizedVariant = normalizeUrl(variant);
    if (!normalizedVariant) return;
    protocols.forEach((proto) => {
      candidates.add(`${proto}//${normalizedVariant}`);
    });
  });

  candidates.add("http://127.0.0.1:8000");
  candidates.add("http://localhost:8000");

  if (ENV_API_URL) {
    candidates.add(normalizeUrl(ENV_API_URL));
  }

  return Array.from(candidates)
    .map((candidate) => normalizeUrl(candidate))
    .filter((candidate, index, array) => candidate && array.indexOf(candidate) === index);
}

function resolveDefaultApiUrl(): string {
  const stored = getStoredApiUrl();
  if (stored) {
    return stored;
  }
  if (ENV_API_URL) {
    return ENV_API_URL;
  }
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000";
  }
  const { protocol, hostname, port } = window.location;
  if (port) {
    return `${protocol}//${hostname}:8000`;
  }

  const [maybePort, ...rest] = hostname.split("-");
  const numericPort = Number(maybePort);
  if (!Number.isNaN(numericPort) && rest.length > 0) {
    return `${protocol}//8000-${rest.join("-")}`;
  }

  return `${protocol}//${hostname}:8000`;
}

function AppContent() {
  const [apiUrl, setApiUrl] = useState<string>(() => resolveDefaultApiUrl());
  const apiUrlRef = useRef(apiUrl);
  const apiDetectionInFlightRef = useRef(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [autoDetectEnabled, setAutoDetectEnabled] = useState<boolean>(() => !Boolean(getStoredApiUrl()));
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);

  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [items, setItems] = useState<DatasetItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemDetail, setSelectedItemDetail] = useState<DatasetItemDetail | null>(null);
  const [itemLoading, setItemLoading] = useState(false);
  const [savingAnnotations, setSavingAnnotations] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [itemUploading, setItemUploading] = useState(false);
  const [itemUploadProgress, setItemUploadProgress] = useState<UploadProgress | null>(null);

  const { t } = useLanguage();

  const apiReady = useMemo(() => apiStatus === "online" && Boolean(apiUrl), [apiStatus, apiUrl]);

  useEffect(() => {
    apiUrlRef.current = apiUrl;
  }, [apiUrl]);

  useEffect(() => {
    if (apiStatus !== "online") {
      setProjects([]);
      setProjectsError(null);
      setProjectsLoading(false);
      setSelectedProject(null);
      setDatasets([]);
      setSelectedDataset(null);
      setItems([]);
      setSelectedItemId(null);
      setSelectedItemDetail(null);
    }
  }, [apiStatus]);

  const validateAndApplyApiUrl = useCallback(async (candidate: string, isManual = false) => {
    const normalized = normalizeUrl(candidate);
    if (!normalized) {
      setApiStatus("offline");
      return false;
    }

    if (typeof window === "undefined") {
      setApiUrl(normalized);
      apiUrlRef.current = normalized;
      setApiStatus("online");
      if (isManual) {
        persistApiUrl(normalized);
        setAutoDetectEnabled(false);
      } else {
        persistApiUrl(normalized);
      }
      return true;
    }

    setApiStatus("checking");
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 3500);
      const response = await fetch(`${normalized}/health`, {
        method: "GET",
        mode: "cors",
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (!response.ok) {
        setApiStatus("offline");
        return false;
      }

      setApiUrl(normalized);
      apiUrlRef.current = normalized;
      setApiStatus("online");
      if (isManual) {
        persistApiUrl(normalized);
        setAutoDetectEnabled(false);
      } else {
        persistApiUrl(normalized);
      }
      return true;
    } catch (error) {
      console.error("API validation failed", error);
      setApiStatus("offline");
      return false;
    }
  }, []);

  const autoDetectApiUrl = useCallback(async () => {
    if (!autoDetectEnabled) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }

    if (apiDetectionInFlightRef.current) {
      return;
    }

    setApiStatus("checking");

    const candidateSet = new Set<string>();
    const addCandidate = (candidate?: string) => {
      const normalized = normalizeUrl(candidate);
      if (normalized) {
        candidateSet.add(normalized);
      }
    };

    apiDetectionInFlightRef.current = true;
    try {
      addCandidate(apiUrlRef.current);
      addCandidate(ENV_API_URL);
      buildApiCandidatesFromWindow().forEach((candidate) => addCandidate(candidate));

      let detectedUrl: string | null = null;
      for (const candidate of candidateSet) {
        let timeoutId: number | undefined;
        try {
          const controller = new AbortController();
          timeoutId = window.setTimeout(() => controller.abort(), 3500);
          const response = await fetch(`${candidate}/health`, {
            method: "GET",
            mode: "cors",
            signal: controller.signal,
          });
          window.clearTimeout(timeoutId);

          if (!response.ok) {
            continue;
          }

          detectedUrl = candidate;
          break;
        } catch (error) {
          if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
          }
          console.warn("API auto-detect candidate failed", candidate, error);
        }
      }

      if (detectedUrl) {
        if (apiUrlRef.current !== detectedUrl) {
          setApiUrl(detectedUrl);
          apiUrlRef.current = detectedUrl;
        }
        setApiStatus("online");
        persistApiUrl(detectedUrl);
      } else {
        setApiStatus("offline");
        console.warn("API auto-detect could not find a reachable backend");
      }
    } finally {
      apiDetectionInFlightRef.current = false;
    }
  }, [autoDetectEnabled]);

  const handleRetryApiDetection = useCallback(() => {
    setAutoDetectEnabled(true);
    void autoDetectApiUrl();
  }, [autoDetectApiUrl]);

  const handleManualApiSubmit = useCallback(
    async (value: string) => validateAndApplyApiUrl(value, true),
    [validateAndApplyApiUrl],
  );

  useEffect(() => {
    void autoDetectApiUrl();
  }, [autoDetectApiUrl]);

  const loadProjects = useCallback(async () => {
    if (!apiReady) return;
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const list = await fetchProjects(apiUrl);
      setProjects(list);
      setSelectedProject((previous) => {
        if (previous && list.some((project) => project.name === previous)) {
          return previous;
        }
        return list.length > 0 ? list[0].name : null;
      });
    } catch (error) {
      console.error("Failed to load projects", error);
      setProjects([]);
      setSelectedProject(null);
      setProjectsError(t("apiError"));
      void autoDetectApiUrl();
    } finally {
      setProjectsLoading(false);
    }
  }, [apiReady, apiUrl, t, autoDetectApiUrl]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const loadDatasets = useCallback(async () => {
    if (!apiReady || !selectedProject) {
      setDatasets([]);
      return;
    }
    setDatasetsLoading(true);
    setDatasetsError(null);
    try {
      const list = await fetchDatasets(apiUrl, selectedProject);
      setDatasets(list);
    } catch (error) {
      console.error("Failed to load datasets", error);
      setDatasetsError(t("apiError"));
      void autoDetectApiUrl();
    } finally {
      setDatasetsLoading(false);
    }
  }, [apiReady, apiUrl, selectedProject, t, autoDetectApiUrl]);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    setSelectedDataset(null);
    setItems([]);
    setSelectedItemId(null);
    setSelectedItemDetail(null);
    setDatasetsError(null);
    setItemsError(null);
    setItemError(null);
  }, [selectedProject]);

  const loadItems = useCallback(
    async (datasetName: string) => {
      if (!apiReady || !selectedProject) return;
      setItemsLoading(true);
      setItemsError(null);
      try {
        const list = await fetchDatasetItems(apiUrl, selectedProject, datasetName);
        setItems(list);
      } catch (error) {
        console.error("Failed to load items", error);
        setItems([]);
        setItemsError(t("apiError"));
        void autoDetectApiUrl();
      } finally {
        setItemsLoading(false);
      }
    },
    [apiReady, apiUrl, selectedProject, t, autoDetectApiUrl],
  );

  useEffect(() => {
    if (selectedDataset) {
      void loadItems(selectedDataset);
    } else {
      setItems([]);
    }
  }, [selectedDataset, loadItems]);

  useEffect(() => {
    setItemUploading(false);
    setItemUploadProgress(null);
  }, [selectedDataset]);

  const loadItemDetail = useCallback(
    async (datasetName: string, itemId: string) => {
      if (!apiReady || !selectedProject) return;
      setItemLoading(true);
      setItemError(null);
      try {
        const detail = await fetchItemDetail(apiUrl, selectedProject, datasetName, itemId);
        setSelectedItemDetail(detail);
      } catch (error) {
        console.error("Failed to load item detail", error);
        setItemError(t("apiError"));
        setSelectedItemDetail(null);
        void autoDetectApiUrl();
      } finally {
        setItemLoading(false);
      }
    },
    [apiReady, apiUrl, selectedProject, t, autoDetectApiUrl],
  );

  useEffect(() => {
    if (selectedDataset && selectedItemId) {
      void loadItemDetail(selectedDataset, selectedItemId);
    } else {
      setSelectedItemDetail(null);
    }
  }, [selectedDataset, selectedItemId, loadItemDetail]);

  const handleBackToFolders = () => {
    setSelectedDataset(null);
    setSelectedItemId(null);
    setSelectedItemDetail(null);
  };

  const handleBackToImages = () => {
    setSelectedItemId(null);
    setSelectedItemDetail(null);
  };

  const handleSelectProject = useCallback((projectName: string | null) => {
    setSelectedProject(projectName);
  }, []);

  const handleCreateProject = useCallback(async () => {
    if (!apiReady) {
      alert(t("setApiFirst"));
      return;
    }

    const defaultName = `project-${new Date().toISOString().split("T")[0]}`;
    const input = window.prompt(t("projectNamePrompt"), defaultName);
    if (!input) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    try {
      const project = await createProject(apiUrl, trimmed);
      setSelectedProject(project.name);
      await loadProjects();
    } catch (error) {
      console.error("Create project failed", error);
      alert(t("projectCreateFailed"));
    }
  }, [apiReady, apiUrl, t, loadProjects]);

  const handleDeleteProject = useCallback(
    async (projectName: string) => {
      if (!apiReady) return;
      const confirmDelete = window.confirm(t("deleteProjectConfirm"));
      if (!confirmDelete) return;

      try {
        await deleteProjectApi(apiUrl, projectName);
        if (selectedProject === projectName) {
          setSelectedProject(null);
        }
        await loadProjects();
      } catch (error) {
        console.error("Delete project failed", error);
        alert(t("deleteFailed"));
      }
    },
    [apiReady, apiUrl, selectedProject, t, loadProjects],
  );

  const handleCreateDataset = async (
    name: string,
    files: File[],
    onProgress: (progress: UploadProgress) => void,
  ) => {
    if (!apiReady) {
      alert(t("setApiFirst"));
      return;
    }

    if (!selectedProject) {
      alert(t("selectProjectFirst"));
      return;
    }

    const datasetName = name;
    try {
      await createDataset(apiUrl, selectedProject, datasetName);
    } catch (error) {
      const message = (error as Error).message;
      if (message !== "Dataset already exists") {
        console.error("Dataset creation failed", error);
        alert(t("uploadFailed"));
        void autoDetectApiUrl();
        return;
      }
      console.info("Dataset already exists, continuing with upload");
    }

    if (files.length === 0) {
      await loadDatasets();
      setSelectedDataset(datasetName);
      await loadItems(datasetName);
      return;
    }

    try {
      await uploadImages(apiUrl, selectedProject, datasetName, files, onProgress);
      await loadDatasets();
      setSelectedDataset(datasetName);
      await loadItems(datasetName);
    } catch (error) {
      console.error("Upload failed", error);
      alert(t("uploadFailed"));
      void autoDetectApiUrl();
    }
  };

  const handleDeleteDataset = async (datasetName: string) => {
    if (!apiReady || !selectedProject) return;
    const confirmDelete = window.confirm(t("deleteFolder"));
    if (!confirmDelete) return;

    try {
      await deleteDatasetApi(apiUrl, selectedProject, datasetName);
      if (selectedDataset === datasetName) {
        handleBackToFolders();
      }
      await loadDatasets();
    } catch (error) {
      console.error("Delete dataset failed", error);
      alert(t("deleteFailed"));
    }
  };

  const handleSelectDataset = (datasetName: string) => {
    setSelectedDataset(datasetName);
    setSelectedItemId(null);
    setSelectedItemDetail(null);
  };

  const handleSelectItem = (itemId: string) => {
    setSelectedItemId(itemId);
  };

  const handleAddImages = useCallback(
    async (files: File[]) => {
      if (!apiReady || !selectedDataset || !selectedProject) return;

      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        alert(t("noImageFiles"));
        return;
      }

      setItemUploading(true);
      setItemUploadProgress({ completed: 0, total: imageFiles.length, filename: "" });

      try {
        await uploadImages(apiUrl, selectedProject, selectedDataset, imageFiles, (progress: UploadProgress) => {
          setItemUploadProgress(progress);
        });
        await loadItems(selectedDataset);
      } catch (error) {
        console.error("Upload images failed", error);
        alert(t("uploadFailed"));
        void autoDetectApiUrl();
      } finally {
        setItemUploading(false);
        setItemUploadProgress(null);
      }
    },
    [apiReady, selectedDataset, selectedProject, t, apiUrl, loadItems, autoDetectApiUrl],
  );

  const handleDeleteItem = async () => {
    if (!apiReady || !selectedDataset || !selectedItemDetail || !selectedProject) return;
    const confirmDelete = window.confirm(t("deleteImage"));
    if (!confirmDelete) return;

    try {
      await deleteItemApi(apiUrl, selectedProject, selectedDataset, selectedItemDetail.id);
      handleBackToImages();
      await loadItems(selectedDataset);
    } catch (error) {
      console.error("Delete item failed", error);
      alert(t("deleteFailed"));
    }
  };

  const handleDownloadItem = async () => {
    if (!apiReady || !selectedDataset || !selectedItemDetail || !selectedProject) return;
    try {
      await downloadItemZip(apiUrl, selectedProject, selectedDataset, selectedItemDetail.id);
    } catch (error) {
      console.error("Download item failed", error);
      alert(t("downloadFailed"));
    }
  };

  const handleDownloadDataset = async () => {
    if (!apiReady || !selectedDataset || !selectedProject) return;
    try {
      await downloadDatasetZip(apiUrl, selectedProject, selectedDataset);
    } catch (error) {
      console.error("Download dataset failed", error);
      alert(t("downloadFailed"));
    }
  };

  const handleSaveAnnotations = async (annotations: AnnotationShape[]) => {
    if (!apiReady || !selectedDataset || !selectedItemDetail || !selectedProject) return;
    setSavingAnnotations(true);
    try {
      const result = await saveAnnotationsApi(apiUrl, selectedProject, selectedDataset, selectedItemDetail.id, {
        imageWidth: selectedItemDetail.width,
        imageHeight: selectedItemDetail.height,
        annotations,
      });

      setSelectedItemDetail({
        ...selectedItemDetail,
        annotations,
        annotationCount: result.annotationCount,
        maskUrl: result.maskUrl ?? selectedItemDetail.maskUrl,
        labelUrl: result.labelUrl ?? selectedItemDetail.labelUrl,
      });
      await loadItems(selectedDataset);
    } catch (error) {
      console.error("Save annotations failed", error);
      alert(t("saveFailed"));
    } finally {
      setSavingAnnotations(false);
    }
  };

  const nextPendingItemId = useMemo(() => {
    if (items.length === 0) {
      return null;
    }
    return items.find((candidate) => candidate.annotationCount === 0 && candidate.id !== selectedItemId)?.id ?? null;
  }, [items, selectedItemId]);

  const handleGoToNextPending = useCallback(() => {
    if (!nextPendingItemId) {
      alert(t("noPendingImages"));
      return;
    }
    setSelectedItemId(nextPendingItemId);
  }, [nextPendingItemId, t]);

  if (apiStatus !== "online" || !apiUrl) {
    return (
      <ApiSetup
        status={apiStatus}
        apiUrl={apiUrl}
        onSubmit={handleManualApiSubmit}
        onRetry={handleRetryApiDetection}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo />
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  {t("title")}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Professional Medical Imaging Platform
                </p>
              </div>
              {selectedDataset && (
                <button
                  onClick={handleBackToFolders}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t("backToFolders")}
                </button>
              )}
              {selectedItemId && (
                <button
                  onClick={handleBackToImages}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t("backToImages")}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <LanguageToggle />
              <ApiConfig
                apiUrl={apiUrl}
                apiStatus={apiStatus}
                onSetApiUrl={(value) => validateAndApplyApiUrl(value, true)}
                onRetry={handleRetryApiDetection}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {!selectedDataset && (
          <FolderList
            projects={projects}
            selectedProject={selectedProject}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
            projectsLoading={projectsLoading}
            datasets={datasets}
            isLoading={datasetsLoading}
            onSelectDataset={handleSelectDataset}
            onCreateDataset={handleCreateDataset}
            onDeleteDataset={handleDeleteDataset}
          />
        )}

        {projectsError && !selectedDataset && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
            {projectsError}
          </div>
        )}

        {datasetsError && !selectedDataset && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
            {datasetsError}
          </div>
        )}

        {selectedDataset && !selectedItemId && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{selectedDataset}</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadDataset}
                  className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {t("downloadAll")}
                </button>
              </div>
            </div>
            {itemsError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
                {itemsError}
              </div>
            )}
            <ImageGrid
              items={items}
              isLoading={itemsLoading}
              onSelectItem={handleSelectItem}
              onUploadImages={handleAddImages}
              uploading={itemUploading}
              uploadProgress={itemUploadProgress}
            />
          </div>
        )}

        {selectedDataset && selectedItemDetail && (
          <AnnotationCanvas
            datasetName={selectedDataset}
            item={selectedItemDetail}
            saving={savingAnnotations}
            onBack={handleBackToImages}
            onSave={handleSaveAnnotations}
            onDelete={handleDeleteItem}
            onDownload={handleDownloadItem}
            onNextPending={handleGoToNextPending}
            canGoToNextPending={Boolean(nextPendingItemId)}
          />
        )}

        {itemLoading && (
          <div className="text-gray-500 dark:text-gray-400">{t("loading")}</div>
        )}

        {itemError && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">{itemError}</div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </ThemeProvider>
  );
}
