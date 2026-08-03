const W=new URL('..', import.meta.url).pathname;
const { collectionHues } = await import(W+'/src/lib/repo/hues.js');
const DID='did:plc:v4zpi74gy7enfiwke7hmoxv5';

// Hues MUST be computed over the repo's FULL collection set, because
// collectionHues walks sorted NSIDs -- a subset yields different hues and the
// icon would not match the map it depicts.
const all = (await (await fetch(`https://eurosky.social/xrpc/com.atproto.repo.describeRepo?repo=${DID}`)).json()).collections;
const { hueOf } = collectionHues(all.map(col => ({ col })));

// real stored bytes, likes excluded exactly as the app auto-hides them
const REAL = [
  ['app.bsky.feed.post', 2400996], ['app.bsky.graph.listitem', 670400],
  ['app.bsky.feed.repost', 487646], ['site.standard.document', 344267],
  ['app.bsky.graph.verification', 163983], ['app.bsky.feed.postgate', 99771],
  ['social.popfeed.feed.listItem', 62247], ['app.bsky.graph.follow', 58000],
  ['blue.linkat.board', 21000], ['pub.leaflet.document', 15000]
];

// Plain squarify, edge to edge -- no per-level inset, because an icon has no
// room for chrome and must read as colour fields, not as a bordered diagram.
function squarify(items, x, y, w, h, out) {
  let i = 0;
  while (i < items.length && w > 0.01 && h > 0.01) {
    let remain = 0; for (let k=i;k<items.length;k++) remain += items[k].n;
    if (remain <= 0) break;
    const short = Math.min(w,h), scale = (w*h)/remain;
    let sum=0, best=Infinity, j=i;
    for (let k=i;k<items.length;k++){
      const s=sum+items[k].n, len=(s*scale)/short; let worst=0;
      for(let m=i;m<=k;m++){const side=(items[m].n*scale)/len; if(side>0&&len>0) worst=Math.max(worst,Math.max(len/side,side/len));}
      if(worst>best&&k>i) break;
      best=worst; sum=s; j=k;
    }
    const len=(sum*scale)/short; let off=0;
    for(let m=i;m<=j;m++){
      const side=(items[m].n*scale)/len;
      if(w>=h) out.push({...items[m], x, y:y+off, w:len, h:side});
      else out.push({...items[m], x:x+off, y, w:side, h:len});
      off+=side;
    }
    if(w>=h){x+=len;w-=len;} else {y+=len;h-=len;}
    i=j+1;
  }
}

function svg(size, topN, gap) {
  const items = REAL.slice(0, topN).map(([col,n]) => ({ col, n }));
  const out = []; squarify(items, 0, 0, size, size, out);
  const rects = out.map(r => {
    const hue = hueOf.get(r.col) ?? 0;
    const w = Math.max(1, r.w - gap), h = Math.max(1, r.h - gap);
    return `<rect x="${r.x.toFixed(2)}" y="${r.y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="hsl(${hue.toFixed(1)} 74% 52%)"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#171717"/>${rects}</svg>`;
}

console.log('hues used:');
for (const [c] of REAL.slice(0,5)) console.log('  ', c, '->', (hueOf.get(c)??0).toFixed(1));
const fs = await import('node:fs');
const files = {
  'icon-16.svg':  svg(16, 3, 1),
  'icon-32.svg':  svg(32, 5, 1),
  'favicon.svg':  svg(64, 8, 1),
  'icon-180.svg': svg(180, 10, 2),
  'icon-192.svg': svg(192, 10, 2),
  'icon-512.svg': svg(512, 10, 4)
};
for (const [k,v] of Object.entries(files)) fs.writeFileSync(W+'/static/'+k, v);
console.log('\nwrote', Object.keys(files).length, 'files');
