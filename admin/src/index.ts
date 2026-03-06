import { PLUGIN_ID } from './pluginId';
import { prefixPluginTranslations } from './utils/getTranslation';
import { interceptLoginFetch } from './utils/interceptLoginFetch';

export default {
  register(app: any) {
    app.registerPlugin({
      id: PLUGIN_ID,
      name: PLUGIN_ID,
      initializer: () => null,
      isReady: true,
    });
  },

  bootstrap() {
    interceptLoginFetch();
  },

  async registerTrads({ locales }: { locales: string[] }) {
    const importedTranslations = [];

    for (const locale of locales) {
      try {
        const translations = await import(
          `./translations/${locale}.json`
        );
        importedTranslations.push({
          data: prefixPluginTranslations(
            translations.default,
            PLUGIN_ID
          ),
          locale,
        });
      } catch {
        // Locale not supported
      }
    }

    return importedTranslations;
  },
};
