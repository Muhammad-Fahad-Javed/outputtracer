import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/auth/',
        // Prefixes, not trailing-slash paths. "/projects/" does not match
        // the URL "/projects". "/p/" is kept (not "/p") so "/practice" and
        // "/python" stay allowed.
        '/projects',
        '/groups',
        '/p/',
        '/admin',
        '/profile',
        '/classroom/student',
        '/classroom/teacher',
        '/classroom/teach',
        '/learn/dashboard',
      ],
    },
    sitemap: 'https://outputtracer.com/sitemap.xml',
  }
}
