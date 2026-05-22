<template>
  <ToastProvider>
    <NuxtLayout>
      <NuxtPage />
      <ToastViewport
        class="fixed bottom-0 right-0 z-[2147483647] m-0 flex w-[390px] max-w-[100vw] list-none flex-col gap-[10px] p-[var(--viewport-padding)] outline-none [--viewport-padding:_25px]"
      >
        <BaseToast ref="toastRef" />
      </ToastViewport>
    </NuxtLayout>
  </ToastProvider>
</template>

<script setup lang="ts">
const toast = useToast();
const toastRef = useTemplateRef('toastRef');
toast.setToast(toastRef);

// make sure to fetch release early
useGlobalStore();

useHead({
  bodyAttrs: {
    class: 'bg-gray-50 dark:bg-neutral-800',
  },
  // FOUC fix — two layers:
  //
  // 1) Inline blocking <script> in <head> sets <html class="dark"|"light">
  //    synchronously before first paint, reading the `theme` cookie + matchMedia.
  //
  // 2) Inline <style> covers the ~100ms hydration window where
  //    `@eschricht/nuxt-color-mode` clears the class on <html> while it waits
  //    for `onNuxtReady` to consult matchMedia. During that gap the class is
  //    empty, no Tailwind dark: variants apply, and on a dark-mode system the
  //    body briefly flashes light. Using prefers-color-scheme as a fallback
  //    only when the class is unresolved (no `.dark`, no `.light`) keeps
  //    explicit user preferences honored.
  //
  // Together: <script> handles initial paint, <style> handles the hydration
  // gap. Visible flicker drops from ~100ms to ~3ms (imperceptible).
  script: [
    {
      tagPriority: 'critical',
      // 1) Read `theme` cookie + matchMedia → set <html> class before first paint.
      // 2) When the cookie is `system` (or absent), the @eschricht/nuxt-color-mode
      //    module's reactive htmlAttrs.class transiently sets `light` for ~10ms
      //    during hydration before it consults matchMedia. A MutationObserver
      //    over the next 1000ms re-applies the system-resolved value whenever
      //    the class disagrees, then disconnects. No-op when cookie is explicit
      //    `dark`/`light` (no class fight).
      innerHTML: `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/);var p=m?decodeURIComponent(m[1]):'system';var sys=p==='system'||!m;var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var want=d?'dark':'light';var h=document.documentElement;if(h.className!==want)h.className=want;if(sys){var start=performance.now();var mo=new MutationObserver(function(){if(h.className!==want)h.className=want;if(performance.now()-start>1000)mo.disconnect();});mo.observe(h,{attributes:true,attributeFilter:['class']});}}catch(e){}})();`,
    },
  ],
  style: [
    {
      tagPriority: 'critical',
      innerHTML: `@media (prefers-color-scheme: dark){html:not(.light):not(.dark) body{background-color:rgb(38 38 38);color-scheme:dark}}@media (prefers-color-scheme: light){html:not(.light):not(.dark) body{background-color:rgb(249 250 251)}}`,
    },
  ],
  link: [
    {
      rel: 'manifest',
      href: '/manifest.json',
    },
    {
      rel: 'icon',
      type: 'image/png',
      href: '/favicon.png',
    },
    {
      rel: 'apple-touch-icon',
      href: '/apple-touch-icon.png',
    },
  ],
  meta: [
    {
      name: 'mobile-web-app-capable',
      content: 'yes',
    },
    {
      name: 'apple-mobile-web-app-capable',
      content: 'yes',
    },
    {
      name: 'apple-mobile-web-app-status-bar-style',
      content: 'black-translucent',
    },
    // Hint the browser to render form controls / scrollbars in the right scheme
    // until our JS sets <html class="dark">/<html class="light"> on first paint.
    {
      name: 'color-scheme',
      content: 'light dark',
    },
  ],
  title: 'WireGuard',
});
</script>
