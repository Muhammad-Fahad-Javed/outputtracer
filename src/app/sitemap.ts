import type { MetadataRoute } from 'next';
import { getTopics, getQuestionsByTopic } from '@/lib/practice';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://outputtracer.com';

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/practice`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/examples`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/learn`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
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
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      });

      const questions = await getQuestionsByTopic(topic.id);
      for (const question of questions) {
        dynamicEntries.push({
          url: `${baseUrl}/practice/${topic.id}/${question.id}`,
          lastModified: new Date(),
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
