export interface ProjectSummary {
  name: string;
  datasetCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DatasetSummary {
  name: string;
  imageCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DatasetItem {
  id: string;
  filename: string;
  imageUrl: string;
  maskUrl?: string | null;
  labelUrl?: string | null;
  width: number;
  height: number;
  annotationCount: number;
  updatedAt?: string;
}

export interface AnnotationPoint {
  x: number;
  y: number;
}

export type AnnotationType = "bbox" | "polygon" | "freehand";

export interface AnnotationShape {
  id: string;
  type: AnnotationType;
  color?: string;
  label?: string;
  points?: AnnotationPoint[];
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface DatasetItemDetail extends DatasetItem {
  annotations: AnnotationShape[];
}

export interface SaveAnnotationsPayload {
  imageWidth: number;
  imageHeight: number;
  annotations: AnnotationShape[];
}

export interface UploadProgress {
  completed: number;
  total: number;
  filename: string;
}
