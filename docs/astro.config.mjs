import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://naom1029.github.io',
  base: '/electron-messageport-trpc',
  integrations: [
    starlight({
      title: 'electron-messageport-trpc',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/naom1029/electron-messageport-trpc',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [{ autogenerate: { directory: 'getting-started' } }],
        },
        {
          label: 'Guides',
          items: [{ autogenerate: { directory: 'guides' } }],
        },
        {
          label: 'API Reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
    }),
  ],
});
