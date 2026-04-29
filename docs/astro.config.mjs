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
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'API Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
});
