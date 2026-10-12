import { asset, catalog, copy, links } from './site.ts';
import { documents, reviewedAt } from './documentation.ts';
import { canonicalUrl, siteOrigin } from './seo.ts';

export function aiIndex(full = false) {
  const lines = [
    '# Zero', '', `> ${copy.en.description}`, `> ${copy.zh.description}`, '',
    `Website: ${canonicalUrl('zh')}`, `Content reviewed: ${reviewedAt}. Release catalog checked: ${catalog.verifiedAt}.`, '',
    '## Current product facts', '',
  ];
  for (const locale of ['zh', 'en'] as const) {
    const faq = documents(locale).find((document) => document.page === 'faq');
    if (!faq) throw new Error(`Missing FAQ content for ${locale}`);
    for (const section of faq.sections.filter((section) => section.id !== 'support')) {
      lines.push(`### ${section.heading}`, '', ...section.paragraphs.flatMap((paragraph) => [paragraph, '']));
    }
  }
  lines.push('## Official pages', '',
    `[中文首页](${canonicalUrl('zh')})`, `[English home](${canonicalUrl('en')})`,
    `[获取 Zero](${canonicalUrl('zh', 'download')})`, `[Get Zero](${canonicalUrl('en', 'download')})`, '',
  );
  for (const locale of ['zh', 'en'] as const) {
    lines.push(`## ${locale === 'zh' ? '中文文档' : 'English documentation'}`, '');
    for (const document of documents(locale)) {
      lines.push(`- [${document.title}](${canonicalUrl(locale, document.page)}): ${document.description}`);
      if (full) {
        lines.push('', `### ${document.title}`, '', document.description, '');
        for (const section of document.sections) {
          lines.push(`#### ${section.heading}`, '', ...section.paragraphs.flatMap((p) => [p, '']));
          if (section.steps) lines.push(...section.steps.map((step, i) => `${i + 1}. ${step}`), '');
        }
        lines.push(...document.sources.map((source) => `[${source.title}](${source.url})`), '');
      }
    }
    lines.push('');
  }
  lines.push('## Project sources', '', `[Source repository](${links.github})`, `[Trial packaging notes](${links.trial})`, `[Public releases](${links.releases})`, `[Developer guide](${links.developer})`, '');
  if (!full) lines.push(`[Full text documentation](${new URL(asset('llms-full.txt'), siteOrigin).href})`, '');
  lines.push('This text index supplements the public HTML pages. It does not guarantee indexing, rankings or AI citation.', '');
  return lines.join('\n');
}
