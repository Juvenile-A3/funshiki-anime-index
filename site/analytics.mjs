// Manual Umami pageviews keep hash routes distinct without recording search text.
export function createAnalytics(config, win = window, doc = document) {
  const noop = { page() {}, clip() {} };
  if (!config?.website_id || !config?.script_url ||
      !config.domains?.includes(win.location.hostname)) return noop;
  const script = doc.createElement('script');
  script.src = config.script_url;
  script.defer = true;
  script.dataset.websiteId = config.website_id;
  script.dataset.autoTrack = 'false';
  const queue = [];
  let ready = false, lastPage = '', failed = false;
  function send(payload) {
    if (failed) return;
    if (!ready) { if (queue.length < 100) queue.push(payload); return; }
    try {
      Promise.resolve(win.umami?.track(props => ({
        ...props, referrer: '', ...payload,
      }))).catch(() => {});
    } catch { /* Analytics must never interrupt browsing or outbound links. */ }
  }
  script.onload = () => { ready = true; queue.splice(0).forEach(send); };
  script.onerror = () => { failed = true; queue.length = 0; };
  doc.head.append(script);
  function routePath() {
    const path = win.location.hash.split('?')[0] || '#/';
    return win.location.pathname + (/^#\/(?:anime\/\d+|video\/BV\w+|videos|about)?$/.test(path) ? path : '#/');
  }
  return {
    page(subjectId = null) {
      const url = routePath();
      if (lastPage === url) return;
      lastPage = url;
      const title = doc.title;
      send({ url, title });
      if (subjectId !== null) send({ url, title, name: 'work_view', data: { subject_id: subjectId } });
    },
    clip(segment, target) {
      send({ url: routePath(), title: doc.title, name: 'clip_click', data: {
        segment_id: segment.id, subject_ids: segment.subject_ids.join(','),
        bvid: segment.bvid, part: target.p, seconds: target.seconds,
      } });
    },
  };
}
