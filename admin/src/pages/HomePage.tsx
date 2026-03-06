import { Main } from '@strapi/design-system';
import { Layouts } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import { PLUGIN_ID } from '../pluginId';

const HomePage = () => {
  const { formatMessage } = useIntl();

  return (
    <Layouts.Root>
      <Main>
        <Layouts.Header
          title={formatMessage({
            id: `${PLUGIN_ID}.plugin.name`,
            defaultMessage: 'Admin 2FA',
          })}
          subtitle={formatMessage({
            id: `${PLUGIN_ID}.plugin.description`,
            defaultMessage:
              'Two-factor email authentication for admin panel',
          })}
        />
      </Main>
    </Layouts.Root>
  );
};

export { HomePage };
