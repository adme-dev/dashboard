// Only managed public assets and the builder's font/animation dependencies may
// leave the renderer. Redirects to other hosts, arbitrary pages and private IPs
// cannot match these anchored patterns.
export const SHARE_IMAGE_REQUESTS = [
  '^https://app\\.xeroflow\\.io/api/public/banner-assets/v1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$',
  '^https://cdnjs\\.cloudflare\\.com/ajax/libs/gsap/3\\.12\\.2/(gsap|CustomEase|MotionPathPlugin)\\.min\\.js$',
  '^https://fonts\\.googleapis\\.com/css2\\?',
  '^https://fonts\\.gstatic\\.com/'
]

export function bannerShareCaptureOptions(html: string, width: number, height: number, time: number) {
  return {
    html, viewport: { width, height, deviceScaleFactor: 1 },
    screenshotOptions: { type: 'jpeg', quality: 85 },
    allowRequestPattern: SHARE_IMAGE_REQUESTS,
    gotoOptions: { waitUntil: 'domcontentloaded', timeout: 15000 },
    actionTimeout: 15000,
    addScriptTag: [{ content: `(async function(){
      function ready(media){return new Promise(function(resolve,reject){
        var timer=setTimeout(function(){cleanup();reject(new Error('Media unavailable'));},7000);
        function cleanup(){clearTimeout(timer);['loadeddata','seeked','error'].forEach(function(e){media.removeEventListener(e,check);});}
        function check(){if(media.error){cleanup();reject(new Error('Media unavailable'));}else if(media.readyState>=2&&!media.seeking){cleanup();resolve();}}
        ['loadeddata','seeked','error'].forEach(function(e){media.addEventListener(e,check);});check();
      });}
      try{
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map(function(image){return image.decode();}));
        var videos=Array.from(document.querySelectorAll('video'));
        await Promise.all(videos.map(ready));
        window.__engagrFrame.seek(${time});
        await Promise.all(videos.map(ready));
        requestAnimationFrame(function(){requestAnimationFrame(function(){document.body.setAttribute('data-share-image-ready','');});});
      }catch(_){document.body.setAttribute('data-share-image-error','');}
    })();` }],
    waitForSelector: { selector: '[data-share-image-ready]', timeout: 15000 }
  }
}
