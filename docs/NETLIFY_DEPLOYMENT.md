# Netlify Deployment Guide

## Environment Variables

Set these environment variables in your Netlify dashboard under Site Settings > Environment Variables:

### Required
- `NODE_ENV`: Set to `production`

### Optional (Analytics)
- `NEXT_UMAMI_ID`: Your Umami website ID for analytics

### Optional (Comments - Giscus)
- `NEXT_PUBLIC_GISCUS_REPO`: Your GitHub repository (e.g., `username/repo`)
- `NEXT_PUBLIC_GISCUS_REPOSITORY_ID`: Your repository ID
- `NEXT_PUBLIC_GISCUS_CATEGORY`: Category name (e.g., `General`)
- `NEXT_PUBLIC_GISCUS_CATEGORY_ID`: Your category ID

### Build Configuration
- `ANALYZE`: Set to `false` for production builds

## Deployment Steps

1. **Connect Repository to Netlify:**
   - Go to [Netlify](https://netlify.com)
   - Click "New site from Git"
   - Connect your GitHub account
   - Select your `cary-bengals` repository

2. **Configure Build Settings:**
   - Build command: `yarn build`
   - Publish directory: `.next` (Netlify Next.js plugin handles this automatically)
   - Node version: `18`
   - **Important:** Netlify will automatically detect and use the `@netlify/plugin-nextjs` plugin from your `netlify.toml` file

3. **Set Environment Variables:**
   - Go to Site Settings > Environment Variables
   - Add the variables listed above

4. **Deploy:**
   - Click "Deploy site"
   - Netlify will automatically install the Next.js plugin and deploy your site

## Build Process

The build process includes:
1. Next.js build with Netlify's Next.js runtime plugin (supports API routes)
2. RSS feed generation
3. Content processing with Contentlayer
4. Automatic optimization by Netlify's Next.js plugin

## Why Netlify Next.js Plugin?

Your app uses:
- **API Routes** (`/app/api/newsletter`) - requires server runtime
- **Image Optimization** - Next.js Image component needs server runtime
- **Next.js Features** - Better support for SSR, ISR, and other Next.js features

The plugin enables these features while still providing excellent performance.

## Custom Domain (Optional)

1. Go to Site Settings > Domain Management
2. Add your custom domain
3. Configure DNS settings as instructed by Netlify
4. Enable HTTPS (automatic with Netlify)

## Troubleshooting

- If build fails, check the build logs in Netlify dashboard
- Ensure all environment variables are set correctly
- Verify that your repository is public or you've granted Netlify access

