import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";

type ApiStatus = "checking" | "online" | "offline";

interface ApiSetupProps {
  status: ApiStatus;
  apiUrl: string;
  onSubmit: (url: string) => Promise<boolean>;
  onRetry: () => void;
}

export function ApiSetup({ status, apiUrl, onSubmit, onRetry }: ApiSetupProps) {
  const { t } = useLanguage();
  const [value, setValue] = useState(apiUrl);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setValue(apiUrl);
  }, [apiUrl]);

  const statusLabel = useMemo(() => {
    if (status === "checking") return t("apiSetupStatusChecking");
    if (status === "offline") return t("apiSetupStatusOffline");
    return t("apiConnected");
  }, [status, t]);

  const statusClass = useMemo(() => {
    if (status === "checking") return "bg-yellow-100 text-yellow-800 border-yellow-200";
    if (status === "offline") return "bg-red-100 text-red-700 border-red-200";
    return "bg-green-100 text-green-700 border-green-200";
  }, [status]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const ok = await onSubmit(value.trim());
    if (!ok) {
      setError(t("apiConnectionFailed"));
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-6 py-12 text-white">
      <div className="w-full max-w-xl bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-10 shadow-2xl space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold">{t("apiSetupTitle")}</h1>
          <p className="text-sm text-slate-200 leading-relaxed">{t("apiSetupDescription")}</p>
        </div>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${statusClass}`}>
          <span className="inline-flex h-2 w-2 rounded-full bg-current"></span>
          {statusLabel}
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-200" htmlFor="apiUrl">
            {t("apiSetupInputLabel")}
          </label>
          <input
            id="apiUrl"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://example.ngrok-free.app"
            className="w-full px-4 py-3 rounded-xl bg-white/90 text-slate-900 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !value.trim()}
            className="inline-flex justify-center items-center px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:bg-blue-500/50 font-semibold transition"
          >
            {submitting ? t("loading") : t("apiSetupButtonConnect")}
          </button>
          <button
            type="button"
            onClick={onRetry}
            disabled={status === "checking"}
            className="inline-flex justify-center items-center px-6 py-3 rounded-xl border border-white/40 text-sm text-white/80 hover:bg-white/10 disabled:opacity-60 transition"
          >
            {t("retryConnection")}
          </button>
        </div>
        <p className="text-xs text-slate-300">
          {t("apiSetupHint")}
        </p>
      </div>
    </div>
  );
}
