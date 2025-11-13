import { useLanguage } from "../contexts/LanguageContext";

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("language")}:</span>
      <div className="flex rounded-xl border border-gray-300 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
        <button
          onClick={() => setLanguage("en")}
          className={`px-4 py-2 text-sm font-medium transition-all ${
            language === "en"
              ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg"
              : "bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
        >
          EN
        </button>
        <button
          onClick={() => setLanguage("th")}
          className={`px-4 py-2 text-sm font-medium transition-all ${
            language === "th"
              ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg"
              : "bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
        >
          TH
        </button>
      </div>
    </div>
  );
}
