/** @type {import("pliny/config").PlinyConfig } */
const siteMetadata = {
  title: 'Cary Bengals Fantasy Football',
  author: 'Cary Bengals LLC',
  headerTitle: 'Cary Bengals Fantasy Football',
  description: 'Cary Bengals Fantasy Football League - Weekly previews, recaps, and analysis',
  email: 'revanthbobba1@gmail.com',
  language: 'en-us',
  theme: 'system', // system, dark or light
  siteUrl: 'https://cary-bengals.netlify.app',
  // Default OG/Twitter card image (1200x630) for pages without their own image.
  socialBanner: '/static/images/social-banner.png',
  youtube: 'https://www.youtube.com/@carybengalsffl',
  locale: 'en-US',
  currentSeason: 2026,
  analytics: {
    // If you want to use an analytics provider you have to add it to the
    // content security policy in the `next.config.js` file.
    // supports Plausible, Simple Analytics, Umami, Posthog or Google Analytics.
    umamiAnalytics: {
      // We use an env variable for this site to avoid other users cloning our analytics ID
      umamiWebsiteId: process.env.NEXT_UMAMI_ID, // e.g. 123e4567-e89b-12d3-a456-426614174000
    },
    // plausibleAnalytics: {
    //   plausibleDataDomain: '', // e.g. cary-bengals.netlify.app
    // },
    // simpleAnalytics: {},
    // posthogAnalytics: {
    //   posthogProjectApiKey: '', // e.g. 123e4567-e89b-12d3-a456-426614174000
    // },
    // googleAnalytics: {
    //   googleAnalyticsId: '', // e.g. G-XXXXXXX
    // },
  },
  search: {
    provider: 'kbar',
    kbarConfig: {
      searchDocumentsPath: 'api/search-index', // path to load documents to search
    },
  },
}

module.exports = siteMetadata
