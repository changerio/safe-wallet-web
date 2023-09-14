import path from 'path'
import withBundleAnalyzer from '@next/bundle-analyzer'
import NextPwa from 'next-pwa'

// console.log('process.env.NEXT_SCOPE', process.env.NEXT_SCOPE)
// console.log('process.env.NEXT_CACHE_START_URL', process.env.NEXT_CACHE_START_URL)
// console.log('process.env.NEXT_DYNAMIC_START_URL', process.env.NEXT_DYNAMIC_START_URL)
// console.log('process.env.NEXT_SUBDOMAIN_PREFIX', process.env.NEXT_SUBDOMAIN_PREFIX)
// console.log('process.env.NEXT_BASE_PATH', process.env.NEXT_BASE_PATH)
// console.log('process.env.NEXT_ASSET_PREFIX', process.env.NEXT_ASSET_PREFIX)

const withPWA = NextPwa({
  disable: process.env.NODE_ENV === 'development',
  dest: 'public',
  reloadOnOnline: false,
  /* Do not precache anything */
  publicExcludes: ['**/*'],
  buildExcludes: [/./],
  scope: process.env.NEXT_SCOPE,
  cacheStartUrl: process.env.NEXT_CACHE_START_URL
    ? process.env.NEXT_CACHE_START_URL.toLowerCase() === 'true'
    : undefined,
  dynamicStartUrl: process.env.NEXT_DYNAMIC_START_URL
    ? process.env.NEXT_DYNAMIC_START_URL.toLowerCase() === 'true'
    : undefined,
  subdomainPrefix: process.env.NEXT_SUBDOMAIN_PREFIX,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // static site export

  basePath: process.env.NEXT_BASE_PATH,
  assetPrefix: process.env.NEXT_ASSET_PREFIX,

  images: {
    unoptimized: true,
  },

  reactStrictMode: false,
  productionBrowserSourceMaps: true,
  eslint: {
    dirs: ['src'],
  },
  modularizeImports: {
    '@mui/material': {
      transform: '@mui/material/{{member}}',
    },
    '@mui/icons-material/?(((\\w*)?/?)*)': {
      transform: '@mui/icons-material/{{ matches.[1] }}/{{member}}',
    },
    lodash: {
      transform: 'lodash/{{member}}',
    },
    'date-fns': {
      transform: 'date-fns/{{member}}',
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: { and: [/\.(js|ts|md)x?$/] },
      use: [
        {
          loader: '@svgr/webpack',
          options: {
            prettier: false,
            svgo: false,
            svgoConfig: {
              plugins: [
                {
                  name: 'preset-default',
                  params: {
                    overrides: { removeViewBox: false },
                  },
                },
              ],
            },
            titleProp: true,
          },
        },
      ],
    })

    config.resolve.alias = {
      ...config.resolve.alias,
      'bn.js': path.resolve('./node_modules/bn.js/lib/bn.js'),
      'mainnet.json': path.resolve('./node_modules/@ethereumjs/common/dist.browser/genesisStates/mainnet.json'),
    }

    return config
  },
}

export default withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(withPWA(nextConfig))
