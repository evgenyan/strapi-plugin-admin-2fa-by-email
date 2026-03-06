import { PLUGIN_ID } from '../pluginId';

const getTranslation = (id: string) => `${PLUGIN_ID}.${id}`;

const prefixPluginTranslations = (
  trad: Record<string, string>,
  pluginId: string
): Record<string, string> => {
  return Object.keys(trad).reduce(
    (acc, current) => {
      acc[`${pluginId}.${current}`] = trad[current];
      return acc;
    },
    {} as Record<string, string>
  );
};

export { getTranslation, prefixPluginTranslations };
