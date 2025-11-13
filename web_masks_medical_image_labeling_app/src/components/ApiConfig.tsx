import { useEffect, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";

type ApiStatus = "checking" | "online" | "offline";

interface ApiConfigProps {
  apiUrl: string;
  apiStatus: ApiStatus;
  onSetApiUrl: (url: string) => Promise<boolean>;
  onRetry: () => void;
}

export function ApiConfig({ apiUrl, apiStatus, onSetApiUrl, onRetry }: ApiConfigProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempUrl, setTempUrl] = useState(apiUrl);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (!isEditing) {
      setTempUrl(apiUrl);
      setError(null);
    }
  }, [apiUrl, isEditing]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const ok = await onSetApiUrl(tempUrl);
    setSaving(false);
    if (ok) {
      setIsEditing(false);
    } else {
      setError(t("apiConnectionFailed"));
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setTempUrl(apiUrl);
    setError(null);
  };

  const statusStyles = {
    checking: {
      container: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
      dot: "bg-yellow-500 animate-pulse",
      label: t("apiConnecting"),
    },
    online: {
      container: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
      dot: "bg-green-500 animate-pulse",
      label: t("apiConnected"),
    },
    offline: {
      container: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
      dot: "bg-red-500",
      label: t("apiDisconnected"),
    },
  } as const;

  const currentStatus = statusStyles[apiStatus];

  return (
    <div className="flex items-center gap-3">
      {isEditing ? (
        <>
          <div className="flex flex-col gap-1">
            <input
              type="text"
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
              placeholder="https://your-backend.ngrok-free.app"
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            {error && <span className="text-xs text-red-500">{error}</span>}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 font-medium text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-60"
          >
            {saving ? t("loading") : t("save")}
          </button>
          <button
            onClick={handleCancel}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm text-gray-700 dark:text-gray-300 transition-colors"
          >
            {t("cancel")}
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-col text-sm">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${currentStatus.container}`}>
              <div className={`w-2 h-2 rounded-full ${currentStatus.dot}`}></div>
              <span className="font-medium text-gray-700 dark:text-gray-200">{currentStatus.label}</span>
            </div>
            {apiUrl ? (
              <span className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-all">{apiUrl}</span>
            ) : null}
          </div>
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm text-gray-700 dark:text-gray-300 transition-colors"
          >
            {apiUrl ? t("changeApi") : t("setApiUrl")}
          </button>
          {apiStatus !== "online" && (
            <button
              onClick={onRetry}
              disabled={apiStatus === "checking"}
              className="px-4 py-2 border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium text-sm transition-colors disabled:opacity-60"
            >
              {t("retryConnection")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
