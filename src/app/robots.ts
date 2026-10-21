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
        '/admin/',
        '/profile/',
        '/classroom/*/manage/',
        '/classroom/*/messages/',
        '/classroom/student/',
        '/classroom/teacher/',
        '/learn/dashboard/',
      ],
    },
    sitemap: 'https://outputtracer.com/sitemap.xml',
  }
}
