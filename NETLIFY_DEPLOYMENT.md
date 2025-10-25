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
   - Publish directory: `out`
   - Node version: `18`

3. **Set Environment Variables:**
   - Go to Site Settings > Environment Variables
   - Add the variables listed above

4. **Deploy:**
   - Click "Deploy site"
   - Netlify will automatically build and deploy your site

## Build Process

The build process includes:
1. Next.js static export generation
2. RSS feed generation
3. Content processing with Contentlayer

## Custom Domain (Optional)

1. Go to Site Settings > Domain Management
2. Add your custom domain
3. Configure DNS settings as instructed by Netlify
4. Enable HTTPS (automatic with Netlify)

## Troubleshooting

- If build fails, check the build logs in Netlify dashboard
- Ensure all environment variables are set correctly
- Verify that your repository is public or you've granted Netlify access

