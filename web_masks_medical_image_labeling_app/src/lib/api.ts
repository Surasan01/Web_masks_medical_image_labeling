import {
  ProjectSummary,
  DatasetSummary,
  DatasetItem,
  DatasetItemDetail,
  UploadProgress,
  SaveAnnotationsPayload,
} from "./types";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function normalizeApiUrl(apiUrl: string): string {
  if (!apiUrl) {
    throw new ApiError("API URL is not configured", 400);
  }
  return apiUrl.replace(/\/$/, "");
}

function shouldBypassNgrokWarning(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host.includes(".ngrok") || host.endsWith("ngrok-free.app");
}

function addNgrokBypassQuery(url: URL): string {
  if (shouldBypassNgrokWarning(url)) {
    url.searchParams.set("ngrok-skip-browser-warning", "true");
  }
  return url.toString();
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("ngrok-skip-browser-warning", "true");

  const response = await fetch(url, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new ApiError(message || `Request failed: ${response.status}`, response.status);
  }
  if (response.status === 204) {
    return undefined as unknown as T;
  }
  return (await response.json()) as T;
}

function resourceUrl(apiUrl: string, path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    const url = new URL(path, normalizeApiUrl(apiUrl));
    return addNgrokBypassQuery(url);
  } catch {
    return path;
  }
}

export async function fetchProjects(apiUrl: string): Promise<ProjectSummary[]> {
  const base = normalizeApiUrl(apiUrl);
  return request<ProjectSummary[]>(`${base}/projects`);
}

export async function createProject(apiUrl: string, name: string): Promise<ProjectSummary> {
  const base = normalizeApiUrl(apiUrl);
  return request<ProjectSummary>(`${base}/projects`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteProject(apiUrl: string, project: string): Promise<void> {
  const base = normalizeApiUrl(apiUrl);
  await request(`${base}/projects/${encodeURIComponent(project)}`, { method: "DELETE" });
}

export async function fetchDatasets(apiUrl: string, project: string): Promise<DatasetSummary[]> {
  const base = normalizeApiUrl(apiUrl);
  return request<DatasetSummary[]>(`${base}/projects/${encodeURIComponent(project)}/datasets`);
}

export async function createDataset(apiUrl: string, project: string, name: string): Promise<DatasetSummary> {
  const base = normalizeApiUrl(apiUrl);
  return request<DatasetSummary>(`${base}/projects/${encodeURIComponent(project)}/datasets`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function renameDataset(apiUrl: string, project: string, dataset: string, newName: string): Promise<string> {
  const base = normalizeApiUrl(apiUrl);
  const response = await request<{ name: string }>(
    `${base}/projects/${encodeURIComponent(project)}/datasets/${encodeURIComponent(dataset)}/rename`,
    {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ new_name: newName }),
    },
  );
  return response.name;
}

export async function deleteDataset(apiUrl: string, project: string, dataset: string): Promise<void> {
  const base = normalizeApiUrl(apiUrl);
  await request(`${base}/projects/${encodeURIComponent(project)}/datasets/${encodeURIComponent(dataset)}`, {
    method: "DELETE",
  });
}

export async function uploadImages(
  apiUrl: string,
  project: string,
  dataset: string,
  files: File[],
  onProgress?: (info: UploadProgress) => void,
): Promise<void> {
  const base = normalizeApiUrl(apiUrl);
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      `${base}/projects/${encodeURIComponent(project)}/datasets/${encodeURIComponent(dataset)}/upload`,
      {
      method: "POST",
      body: formData,
      headers: {
        "ngrok-skip-browser-warning": "true",
      },
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new ApiError(message || `Upload failed for ${file.name}`, response.status);
    }

    onProgress?.({ completed: index + 1, total: files.length, filename: file.name });
  }
}

export async function fetchDatasetItems(apiUrl: string, project: string, dataset: string): Promise<DatasetItem[]> {
  const base = normalizeApiUrl(apiUrl);
  const items = await request<DatasetItem[]>(
    `${base}/projects/${encodeURIComponent(project)}/datasets/${encodeURIComponent(dataset)}/items`,
  );
  return items.map((item) => ({
    ...item,
    imageUrl: resourceUrl(apiUrl, item.imageUrl) ?? item.imageUrl,
    maskUrl: resourceUrl(apiUrl, item.maskUrl) ?? item.maskUrl,
    labelUrl: resourceUrl(apiUrl, item.labelUrl) ?? item.labelUrl,
  }));
}

export async function fetchItemDetail(
  apiUrl: string,
  project: string,
  dataset: string,
  itemId: string,
): Promise<DatasetItemDetail> {
  const base = normalizeApiUrl(apiUrl);
  const detail = await request<DatasetItemDetail>(
    `${base}/projects/${encodeURIComponent(project)}/datasets/${encodeURIComponent(dataset)}/items/${encodeURIComponent(itemId)}`,
  );
  return {
    ...detail,
    imageUrl: resourceUrl(apiUrl, detail.imageUrl) ?? detail.imageUrl,
    maskUrl: resourceUrl(apiUrl, detail.maskUrl) ?? detail.maskUrl,
    labelUrl: resourceUrl(apiUrl, detail.labelUrl) ?? detail.labelUrl,
    annotations: detail.annotations ?? [],
  };
}

export async function saveAnnotations(
  apiUrl: string,
  project: string,
  dataset: string,
  itemId: string,
  payload: SaveAnnotationsPayload,
): Promise<{ maskUrl: string | null; labelUrl: string | null; annotationCount: number }> {
  const base = normalizeApiUrl(apiUrl);
  const result = await request<{ maskUrl: string | null; labelUrl: string | null; annotationCount: number }>(
    `${base}/projects/${encodeURIComponent(project)}/datasets/${encodeURIComponent(dataset)}/items/${encodeURIComponent(itemId)}/annotations`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return {
    maskUrl: resourceUrl(apiUrl, result.maskUrl) ?? result.maskUrl,
    labelUrl: resourceUrl(apiUrl, result.labelUrl) ?? result.labelUrl,
    annotationCount: result.annotationCount,
  };
}

export async function deleteItem(apiUrl: string, project: string, dataset: string, itemId: string): Promise<void> {
  const base = normalizeApiUrl(apiUrl);
  await request(
    `${base}/projects/${encodeURIComponent(project)}/datasets/${encodeURIComponent(dataset)}/items/${encodeURIComponent(itemId)}`,
    {
    method: "DELETE",
    },
  );
}

async function downloadBlob(url: string): Promise<Blob> {
  const response = await fetch(url, {
    headers: {
      "ngrok-skip-browser-warning": "true",
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new ApiError(message || "Unable to download", response.status);
  }
  return response.blob();
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadItemZip(apiUrl: string, project: string, dataset: string, itemId: string): Promise<void> {
  const base = normalizeApiUrl(apiUrl);
  const blob = await downloadBlob(
    `${base}/projects/${encodeURIComponent(project)}/datasets/${encodeURIComponent(dataset)}/items/${encodeURIComponent(itemId)}/download`,
  );
  triggerBlobDownload(blob, `${itemId}.zip`);
}

export async function downloadDatasetZip(apiUrl: string, project: string, dataset: string): Promise<void> {
  const base = normalizeApiUrl(apiUrl);
  const blob = await downloadBlob(
    `${base}/projects/${encodeURIComponent(project)}/datasets/${encodeURIComponent(dataset)}/download`,
  );
  triggerBlobDownload(blob, `${dataset}.zip`);
}
