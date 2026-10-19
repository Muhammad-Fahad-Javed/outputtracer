import type { MetadataRoute } from 'next';
import { getTopics, getQuestionsByTopic } from '@/lib/practice';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://outputtracer.com';

  // No `lastModified` here on purpose: these routes have no real revision date,
  // and emitting `new Date()` on every request told crawlers every URL had just
  // changed, which makes `lastmod` untrustworthy and gets it ignored.
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/practice`,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/examples`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/learn`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/python`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/assembly`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  try {
    const topics = await getTopics();
    const dynamicEntries: MetadataRoute.Sitemap = [];

    for (const topic of topics) {
      dynamicEntries.push({
        url: `${baseUrl}/practice/${topic.id}`,
        changeFrequency: 'weekly',
        priority: 0.8,
      });

      const questions = await getQuestionsByTopic(topic.id);
      for (const question of questions) {
        dynamicEntries.push({
          url: `${baseUrl}/practice/${topic.id}/${question.id}`,
          changeFrequency: 'monthly',
          priority: 0.7,
        });
      }
    }

    return [...staticEntries, ...dynamicEntries];
  } catch (error) {
    console.error('Error generating dynamic sitemap:', error);
    return staticEntries;
  }
}
