import { escapeHtml as esc } from './domain.mjs';

function decoratedText(key, value, repository) {
  const safe = esc(value);
  if (key === 'metadata_text') return safe.replace(/Bangumi/i, '<a href="https://bgm.tv/" target="_blank" rel="noopener noreferrer">$&</a>');
  if (key === 'feedback_text') return safe
    .replace(/GitHub Issues/g, `<a href="https://github.com/${esc(repository)}/issues" target="_blank" rel="noopener noreferrer">$&</a>`)
    .replace(/作者\s*B\s*站/g, '<a href="https://space.bilibili.com/412633250" target="_blank" rel="noopener noreferrer">作者B站</a>');
  if (key === 'architecture_intro') return `<ul class="roadmap-list">${String(value).split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`;
  return safe;
}
export function aboutMarkup(copy, repository, contributors) {
  const text = (key, tag = 'span', cls = '') => `<${tag} class="${cls}" data-copy="${key}">${esc(copy[key])}</${tag}>`;
  const link = (url, key) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text(key)}</a>`;
  const repo = `https://github.com/${repository}`;
  const metadata = decoratedText('metadata_text',copy.metadata_text,repository);
  return `<article class="page-wrap prose about-page" data-repository="${esc(repository)}">
    <div class="about-intro">${text('intro','p','lead')}<div class="about-links">${link(repo,'github_label')}${link('https://space.bilibili.com/412633250','author_label')}${link(`${repo}/issues`,'feedback_label')}</div></div>
    <section class="about-credits">${text('thanks_title','h2')}
      <div class="credits-columns"><div class="credit-primary"><a href="https://space.bilibili.com/63231" target="_blank" rel="noopener noreferrer"><img src="./assets/credits/fanshi.webp" alt="泛式头像" width="64" height="64">${text('fan_name')}</a><a href="https://space.bilibili.com/281341996" target="_blank" rel="noopener noreferrer"><img src="./assets/credits/recorders.webp" alt="下播型泛式录播组头像" width="64" height="64">${text('recorders_name')}</a></div>
      <div class="credit-secondary"><p>${link('https://space.bilibili.com/1463485213','archive_name')}</p><p data-copy="metadata_text">${metadata}</p></div><div class="credit-timelines"><p>${text('timelines_name')}：${contributors.map(c=>esc(c.name)).join('、')}</p></div></div>
    </section>
    <section class="about-roadmap">${text('architecture_title','h2')}<div data-copy="architecture_intro">${decoratedText('architecture_intro',copy.architecture_intro || '',repository)}</div></section>
    <section>${text('feedback_title','h2')}<p data-copy="feedback_text">${decoratedText('feedback_text',copy.feedback_text,repository)}</p>${text('rights_text','p','about-note')}</section>
  </article>`;
}
