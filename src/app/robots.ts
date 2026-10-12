import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/auth/',
        '/projects/',
        '/groups/',
        '/p/',
      ],
    },
    sitemap: 'https://outputtracer.com/sitemap.xml',
  }
}
