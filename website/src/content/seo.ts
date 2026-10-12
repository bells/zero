import { asset, copy, links, path, type Locale } from './site.ts';

export const siteOrigin = 'https://www.usezero.cn';
export function canonicalUrl(locale: Locale, page = '') { return new URL(path(locale, page), siteOrigin).href; }

export function structuredData(locale: Locale, page: string, title: string, description: string) {
  const root = `${siteOrigin}/`;
  const softwareId = `${root}#software`;
  const sourceId = `${root}#source`;
  const websiteId = `${root}#website`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': websiteId, name: 'Zero', url: root, inLanguage: ['zh-CN', 'en'] },
      {
        '@type': 'SoftwareApplication', '@id': softwareId, name: 'Zero', url: root,
        applicationCategory: 'UtilitiesApplication', operatingSystem: ['macOS', 'Windows'],
        description: copy[locale].description, inLanguage: ['zh-CN', 'en'],
        image: new URL(asset('social.png'), siteOrigin).href,
        featureList: copy[locale].tools.items.map((tool) => `${tool.name}: ${tool.description} ${tool.platform}`),
      },
      { '@type': 'SoftwareSourceCode', '@id': sourceId, name: 'Zero source code', codeRepository: links.github, targetProduct: { '@id': softwareId } },
      {
        '@type': 'WebPage', '@id': `${canonicalUrl(locale, page)}#webpage`, url: canonicalUrl(locale, page),
        name: title, description, inLanguage: locale === 'zh' ? 'zh-CN' : 'en',
        isPartOf: { '@id': websiteId }, about: { '@id': softwareId },
      },
    ],
  };
}
